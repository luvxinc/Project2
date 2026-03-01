package com.mgmt.modules.ebayapi.application.service

import com.mgmt.modules.sales.infrastructure.csv.EbayCSVParser
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * EbayTransformService — 将 API 原始数据转换为 cleaned_transactions。
 *
 * 数据来源: ebay_api.{fin_transactions, ful_orders, ful_order_items, fin_transaction_fees}
 * 目标表:  ebay_api.cleaned_transactions
 *
 * ACTION 映射规则 (已验证 100% 覆盖):
 *   SALE     → NN (正常销售)
 *   REFUND + cancel_status='CANCELED' → CA (取消退款)
 *   REFUND + cancel_status≠'CANCELED' → RE (退货退款)
 *   CREDIT   → CR (信用退还)
 *   DISPUTE  → PD (争议冻结)
 *
 * Transform Phases:
 *   Phase 1: NN rows from SALE + ful_orders + ful_order_items
 *   Phase 2: CA/RE rows from REFUND
 *   Phase 3: CR rows from CREDIT
 *   Phase 4: PD rows from DISPUTE
 *   Phase 5: Backfill promo_fee from NON_SALE_CHARGE via references_json
 *   Phase 6: Backfill label_* from SHIPPING_LABEL by memo type
 *   Phase 7: Calculate net_amount = sale_amount - all_fees - labels - promo
 *   Phase 8: SKU Parsing (full_sku → sku1..sku10)
 *
 * 关键设计决策:
 *   - NN 按 ful_orders.creation_date 过滤 (PST 时区)
 *   - CA/RE 按 fin_transactions.transaction_date 过滤 (退款日期)
 *   - 多 item 订单: 每个 line_item 一行
 *   - sale_amount: 优先 discounted_line_item_cost (折后价)
 *   - FVF fixed ($0.40): 分配给第一个 item
 *   - 费用按 item_cost / order_subtotal 比例分配
 *   - promo_fee: 从 NON_SALE_CHARGE 通过 references_json ORDER_ID 关联
 *   - label_*: 从 SHIPPING_LABEL 按 transaction_memo 分5种
 *   - SKU 解析: 复用 V3 EbayCSVParser (pat1/pat2/complex + sku_corrections)
 *   - 四维去重: order_number + seller + item_id + action
 */
@Service
class EbayTransformService(
    private val jdbcTemplate: JdbcTemplate,
    private val skuParser: EbayCSVParser,
) {
    private val log = LoggerFactory.getLogger(EbayTransformService::class.java)

    /**
     * Transform raw API data into cleaned_transactions for a date range.
     *
     * @param fromDate  PST 起始日期 "2025-11-01"
     * @param toDate    PST 截止日期 "2025-11-30"
     * @return total rows inserted
     */
    @Transactional
    fun transformDateRange(fromDate: String, toDate: String): Int {
        log.info("Starting transform for {} to {}", fromDate, toDate)

        // Clear existing data for this date range
        val deleted = jdbcTemplate.update("""
            DELETE FROM ebay_api.cleaned_transactions
            WHERE (order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
        """.trimIndent(), fromDate, toDate)
        log.info("Cleared {} existing rows for date range", deleted)

        // Phase 1: NN (Normal Sales) — from SALE transactions
        val nnCount = insertNN(fromDate, toDate)
        log.info("Phase 1: Inserted {} NN rows", nnCount)

        // Phase 2: CA + RE (Refunds) — from REFUND transactions
        val refundCount = insertRefunds(fromDate, toDate)
        log.info("Phase 2: Inserted {} CA+RE rows", refundCount)

        // Phase 3: CR (Credits) — from CREDIT transactions
        val crCount = insertCredits(fromDate, toDate)
        log.info("Phase 3: Inserted {} CR rows", crCount)

        // Phase 4: PD (Disputes) — from DISPUTE transactions
        val pdCount = insertDisputes(fromDate, toDate)
        log.info("Phase 4: Inserted {} PD rows", pdCount)

        // Phase 5: Backfill promo_fee from NON_SALE_CHARGE via references_json
        val promoCount = backfillPromoFee(fromDate, toDate)
        log.info("Phase 5: Updated promo_fee for {} rows", promoCount)

        // Phase 6a: Backfill label_* from API SHIPPING_LABEL by memo type
        val labelCount = backfillLabels(fromDate, toDate)
        log.info("Phase 6a: Updated labels from API for {} rows", labelCount)

        // Phase 6b: Backfill remaining label_cost from CSV Earning Report
        val csvLabelCount = backfillLabelsFromCsv(fromDate, toDate)
        log.info("Phase 6b: Updated labels from CSV for {} rows", csvLabelCount)

        // Phase 7: Calculate net_amount
        val netCount = calculateNetAmount(fromDate, toDate)
        log.info("Phase 7: Updated net_amount for {} rows", netCount)

        // Phase 8: SKU Parsing
        val skuCount = parseSkus(fromDate, toDate)
        log.info("Phase 8: Parsed SKUs for {} rows", skuCount)

        val total = nnCount + refundCount + crCount + pdCount
        log.info("Transform complete: {} total rows (NN={}, CA+RE={}, CR={}, PD={})",
            total, nnCount, refundCount, crCount, pdCount)
        return total
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 1: NN (Normal Sales)
    // ═══════════════════════════════════════════════════════════
    private fun insertNN(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            INSERT INTO ebay_api.cleaned_transactions (
                seller, order_number, item_id, order_date, action,
                quantity, item_title, full_sku, buyer_username, ship_to_city, ship_to_country,
                sale_amount, shipping_fee, tax_amount, seller_tax, ebay_tax, net_amount,
                ad_fee, other_fee, fvf_fee, fvf_fee_fixed, fvf_fee_variable,
                intl_fee, promo_fee, regulatory_fee, dispute_fee, refund_amount,
                label_cost, label_return, label_underpay, label_overpay, label_regular,
                row_hash, created_at
            )
            SELECT
                o.seller_username,
                ft.order_id,
                oi.legacy_item_id,
                o.creation_date,
                'NN',
                oi.quantity,
                oi.title,
                oi.sku,
                o.buyer_username,
                o.ship_to_city,
                o.ship_to_country_code,
                -- sale_amount: prefer discounted price
                CASE WHEN oi.discounted_line_item_cost > 0
                     THEN oi.discounted_line_item_cost
                     ELSE oi.line_item_cost END,
                -- shipping: first item only
                CASE WHEN oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id ORDER BY oi2.line_item_id LIMIT 1
                ) THEN o.delivery_cost ELSE 0.00 END,
                oi.ebay_collect_and_remit_tax,
                0.00,
                oi.ebay_collect_and_remit_tax,
                -- net_amount: proportional
                ROUND(COALESCE(ft.amount_value, 0.00) *
                    CASE WHEN oi.discounted_line_item_cost > 0
                         THEN oi.discounted_line_item_cost
                         ELSE oi.line_item_cost END
                    / NULLIF(o.price_subtotal, 0), 2),
                -- ad_fee: placeholder, will be filled by promo backfill
                0.00,
                -- other_fee: INAD + regulatory (proportional)
                ROUND(COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type IN ('HIGH_ITEM_NOT_AS_DESCRIBED_FEE', 'REGULATORY_OPERATING_FEE')), 0.00)
                    * CASE WHEN oi.discounted_line_item_cost > 0 THEN oi.discounted_line_item_cost ELSE oi.line_item_cost END
                    / NULLIF(o.price_subtotal, 0), 2),
                -- fvf_fee (combined FVF fixed + variable, first item gets fixed)
                CASE WHEN oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id ORDER BY oi2.line_item_id LIMIT 1
                ) THEN COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type IN ('FINAL_VALUE_FEE', 'FINAL_VALUE_FEE_FIXED_PER_ORDER')), 0.00)
                ELSE COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE'
                    AND f.line_item_id = oi.line_item_id), 0.00)
                END,
                -- fvf_fee_fixed: first item only
                CASE WHEN oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id ORDER BY oi2.line_item_id LIMIT 1
                ) THEN COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE_FIXED_PER_ORDER'), 0.00)
                ELSE 0.00 END,
                -- fvf_fee_variable: by line_item_id
                COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE'
                    AND f.line_item_id = oi.line_item_id), 0.00),
                -- intl_fee: by line_item_id
                COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'INTERNATIONAL_FEE'
                    AND f.line_item_id = oi.line_item_id), 0.00),
                -- promo_fee: placeholder 0, Phase 5 backfills from NON_SALE_CHARGE
                0.00,
                -- regulatory_fee
                COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'REGULATORY_OPERATING_FEE'
                    AND f.line_item_id = oi.line_item_id), 0.00),
                0.00, 0.00,  -- dispute, refund
                0.00, 0.00, 0.00, 0.00, 0.00,  -- labels (Phase 6 backfills)
                MD5(CONCAT(ft.order_id, '|', o.seller_username, '|', oi.line_item_id, '|NN')),
                NOW()
            FROM ebay_api.fin_transactions ft
            JOIN ebay_api.ful_orders o ON ft.order_id = o.order_id AND ft.seller_username = o.seller_username
            JOIN ebay_api.ful_order_items oi ON o.order_id = oi.order_id
            WHERE ft.transaction_type = 'SALE'
            AND (o.creation_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (o.creation_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            ON CONFLICT DO NOTHING
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 2: CA + RE (Refunds)
    // ═══════════════════════════════════════════════════════════
    private fun insertRefunds(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            INSERT INTO ebay_api.cleaned_transactions (
                seller, order_number, item_id, order_date, action,
                quantity, item_title, full_sku, buyer_username, ship_to_city, ship_to_country,
                sale_amount, shipping_fee, tax_amount, seller_tax, ebay_tax, net_amount,
                ad_fee, other_fee, fvf_fee, fvf_fee_fixed, fvf_fee_variable,
                intl_fee, promo_fee, regulatory_fee, dispute_fee, refund_amount,
                label_cost, label_return, label_underpay, label_overpay, label_regular,
                row_hash, created_at
            )
            SELECT
                ft.seller_username,
                ft.order_id,
                oi.legacy_item_id,
                ft.transaction_date,
                CASE WHEN o.cancel_status = 'CANCELED' THEN 'CA' ELSE 'RE' END,
                COALESCE(oi.quantity, 1),
                oi.title,
                oi.sku,
                COALESCE(o.buyer_username, ft.buyer_username),
                o.ship_to_city,
                o.ship_to_country_code,
                CASE WHEN oi.discounted_line_item_cost > 0
                     THEN oi.discounted_line_item_cost
                     ELSE COALESCE(oi.line_item_cost, ABS(ft.amount_value)) END,
                0.00,
                COALESCE(oi.ebay_collect_and_remit_tax, 0.00),
                0.00,
                COALESCE(oi.ebay_collect_and_remit_tax, 0.00),
                -- net_amount: refund amount (negative direction)
                -ABS(COALESCE(ft.amount_value, 0.00)),
                0.00,  -- ad_fee
                0.00,  -- other_fee
                -- fvf_fee (refund returns some fees)
                -COALESCE(ft.total_fee_amount, 0.00),
                -- fvf_fee_fixed (refund)
                COALESCE((SELECT -SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE_FIXED_PER_ORDER'), 0.00),
                -- fvf_fee_variable (refund)
                COALESCE((SELECT -SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE'), 0.00),
                0.00, 0.00, 0.00, 0.00,
                -- refund_amount: gross refund = amount + fee returned
                ABS(COALESCE(ft.amount_value, 0.00)) + COALESCE(ft.total_fee_amount, 0.00),
                0.00, 0.00, 0.00, 0.00, 0.00,  -- labels
                MD5(CONCAT(ft.transaction_id, '|', ft.seller_username, '|', COALESCE(oi.line_item_id, ft.order_id))),
                NOW()
            FROM ebay_api.fin_transactions ft
            JOIN ebay_api.ful_orders o ON ft.order_id = o.order_id AND ft.seller_username = o.seller_username
            -- Only join first item to prevent multi-item inflation
            JOIN ebay_api.ful_order_items oi ON o.order_id = oi.order_id
                AND oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id
                    ORDER BY oi2.line_item_id LIMIT 1
                )
            WHERE ft.transaction_type = 'REFUND'
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            ON CONFLICT DO NOTHING
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 3: CR (Credits)
    // ═══════════════════════════════════════════════════════════
    private fun insertCredits(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            INSERT INTO ebay_api.cleaned_transactions (
                seller, order_number, item_id, order_date, action,
                quantity, item_title, full_sku, buyer_username, ship_to_city, ship_to_country,
                sale_amount, shipping_fee, tax_amount, seller_tax, ebay_tax, net_amount,
                ad_fee, other_fee, fvf_fee, fvf_fee_fixed, fvf_fee_variable,
                intl_fee, promo_fee, regulatory_fee, dispute_fee, refund_amount,
                label_cost, label_return, label_underpay, label_overpay, label_regular,
                row_hash, created_at
            )
            SELECT
                ft.seller_username,
                ft.order_id,
                COALESCE(oi.legacy_item_id, ''),
                ft.transaction_date,
                'CR',
                COALESCE(oi.quantity, 1),
                oi.title,
                oi.sku,
                COALESCE(o.buyer_username, ft.buyer_username),
                o.ship_to_city,
                o.ship_to_country_code,
                COALESCE(CASE WHEN oi.discounted_line_item_cost > 0
                     THEN oi.discounted_line_item_cost ELSE oi.line_item_cost END,
                     ABS(ft.amount_value)),
                0.00, 0.00, 0.00, 0.00,
                COALESCE(ft.amount_value, 0.00),
                0.00, 0.00, 0.00,
                COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE_FIXED_PER_ORDER'), 0.00),
                COALESCE((SELECT SUM(f.fee_amount) FROM ebay_api.fin_transaction_fees f
                    WHERE f.transaction_id = ft.transaction_id
                    AND f.fee_type = 'FINAL_VALUE_FEE'), 0.00),
                0.00, 0.00, 0.00, 0.00, 0.00,
                0.00, 0.00, 0.00, 0.00, 0.00,
                MD5(CONCAT(ft.transaction_id, '|', ft.seller_username, '|CR')),
                NOW()
            FROM ebay_api.fin_transactions ft
            LEFT JOIN ebay_api.ful_orders o ON ft.order_id = o.order_id AND ft.seller_username = o.seller_username
            -- Only join first item to prevent multi-item inflation
            LEFT JOIN ebay_api.ful_order_items oi ON o.order_id = oi.order_id
                AND oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id
                    ORDER BY oi2.line_item_id LIMIT 1
                )
            WHERE ft.transaction_type = 'CREDIT'
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            ON CONFLICT DO NOTHING
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 4: PD (Disputes)
    // ═══════════════════════════════════════════════════════════
    private fun insertDisputes(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            INSERT INTO ebay_api.cleaned_transactions (
                seller, order_number, item_id, order_date, action,
                quantity, item_title, full_sku, buyer_username, ship_to_city, ship_to_country,
                sale_amount, shipping_fee, tax_amount, seller_tax, ebay_tax, net_amount,
                ad_fee, other_fee, fvf_fee, fvf_fee_fixed, fvf_fee_variable,
                intl_fee, promo_fee, regulatory_fee, dispute_fee, refund_amount,
                label_cost, label_return, label_underpay, label_overpay, label_regular,
                row_hash, created_at
            )
            SELECT
                ft.seller_username,
                COALESCE(ft.order_id, ''),
                COALESCE(oi.legacy_item_id, ''),
                ft.transaction_date,
                'PD',
                COALESCE(oi.quantity, 1),
                COALESCE(oi.title, 'Dispute'),
                COALESCE(oi.sku, ''),
                COALESCE(o.buyer_username, ft.buyer_username, ''),
                COALESCE(o.ship_to_city, ''),
                COALESCE(o.ship_to_country_code, ''),
                COALESCE(CASE WHEN oi.discounted_line_item_cost > 0
                     THEN oi.discounted_line_item_cost ELSE oi.line_item_cost END,
                     ABS(ft.amount_value)),
                0.00, 0.00, 0.00, 0.00,
                -ABS(COALESCE(ft.amount_value, 0.00)),
                0.00, 0.00, 0.00, 0.00, 0.00,
                0.00, 0.00, 0.00,
                ABS(COALESCE(ft.amount_value, 0.00)),  -- dispute_fee
                0.00,
                0.00, 0.00, 0.00, 0.00, 0.00,
                MD5(CONCAT(ft.transaction_id, '|', ft.seller_username, '|PD')),
                NOW()
            FROM ebay_api.fin_transactions ft
            LEFT JOIN ebay_api.ful_orders o ON ft.order_id = o.order_id AND ft.seller_username = o.seller_username
            -- Only join first item to prevent multi-item inflation
            LEFT JOIN ebay_api.ful_order_items oi ON o.order_id = oi.order_id
                AND oi.line_item_id = (
                    SELECT oi2.line_item_id FROM ebay_api.ful_order_items oi2
                    WHERE oi2.order_id = o.order_id
                    ORDER BY oi2.line_item_id LIMIT 1
                )
            WHERE ft.transaction_type = 'DISPUTE'
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ft.transaction_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            ON CONFLICT DO NOTHING
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 5: Backfill promo_fee from NON_SALE_CHARGE
    // ═══════════════════════════════════════════════════════════
    private fun backfillPromoFee(fromDate: String, toDate: String): Int {
        // NON_SALE_CHARGE (promo) links to orders via references_json ORDER_ID.
        // For each NN row, find the matching promo fee by order + item.
        return jdbcTemplate.update("""
            UPDATE ebay_api.cleaned_transactions ct
            SET promo_fee = promo.total_promo,
                ad_fee = promo.total_promo
            FROM (
                SELECT
                    r_order.ref_id AS order_id,
                    r_item.ref_id AS item_id,
                    ft.seller_username,
                    SUM(CASE WHEN ft.booking_entry = 'DEBIT' THEN ft.amount_value
                             WHEN ft.booking_entry = 'CREDIT' THEN -ft.amount_value
                             ELSE 0 END) AS total_promo
                FROM ebay_api.fin_transactions ft,
                    LATERAL (
                        SELECT elem->>'referenceId' AS ref_id
                        FROM jsonb_array_elements(ft.references_json) elem
                        WHERE elem->>'referenceType' = 'ORDER_ID'
                    ) r_order,
                    LATERAL (
                        SELECT elem->>'referenceId' AS ref_id
                        FROM jsonb_array_elements(ft.references_json) elem
                        WHERE elem->>'referenceType' = 'ITEM_ID'
                    ) r_item
                WHERE ft.transaction_type = 'NON_SALE_CHARGE'
                AND ft.transaction_memo LIKE 'Promoted Listings%'
                AND ft.references_json IS NOT NULL
                AND ft.references_json != 'null'::jsonb
                GROUP BY r_order.ref_id, r_item.ref_id, ft.seller_username
            ) promo
            WHERE ct.order_number = promo.order_id
            AND ct.item_id = promo.item_id
            AND ct.seller = promo.seller_username
            AND ct.action = 'NN'
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 6: Backfill label_* from SHIPPING_LABEL
    // ═══════════════════════════════════════════════════════════
    private fun backfillLabels(fromDate: String, toDate: String): Int {
        // Shipping labels link to orders via order_id.
        // For multi-item orders, assign label to first item only.
        // Labels split by memo type into 5 categories.
        return jdbcTemplate.update("""
            UPDATE ebay_api.cleaned_transactions ct
            SET label_cost    = COALESCE(lbl.total_cost, 0),
                label_regular = COALESCE(lbl.regular, 0),
                label_return  = COALESCE(lbl.return_label, 0),
                label_underpay= COALESCE(lbl.underpaid, 0),
                label_overpay = COALESCE(lbl.overpaid, 0)
            FROM (
                SELECT
                    ft.order_id,
                    ft.seller_username,
                    SUM(CASE WHEN ft.booking_entry = 'DEBIT' THEN -ft.amount_value
                             ELSE ft.amount_value END) AS total_cost,
                    SUM(CASE WHEN ft.transaction_memo = 'Shipping label purchased'
                             THEN -ft.amount_value ELSE 0 END) AS regular,
                    SUM(CASE WHEN ft.transaction_memo = 'Return shipping label'
                             THEN -ft.amount_value ELSE 0 END) AS return_label,
                    SUM(CASE WHEN ft.transaction_memo = 'Charge - underpaid postage'
                             THEN -ft.amount_value ELSE 0 END) AS underpaid,
                    SUM(CASE WHEN ft.transaction_memo IN ('Refund - postage purchase', 'Refund - overpaid postage')
                             THEN ft.amount_value ELSE 0 END) AS overpaid
                FROM ebay_api.fin_transactions ft
                WHERE ft.transaction_type = 'SHIPPING_LABEL'
                AND ft.order_id IS NOT NULL AND ft.order_id != ''
                GROUP BY ft.order_id, ft.seller_username
            ) lbl
            WHERE ct.order_number = lbl.order_id
            AND ct.seller = lbl.seller_username
            AND ct.action = 'NN'
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            -- For multi-item orders, assign label to first item only
            AND ct.id = (
                SELECT MIN(ct2.id) FROM ebay_api.cleaned_transactions ct2
                WHERE ct2.order_number = ct.order_number
                AND ct2.seller = ct.seller
                AND ct2.action = 'NN'
            )
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 6b: Backfill remaining label_cost from CSV raw_earnings
    //
    // API SHIPPING_LABEL only covers ~15% of orders (those with order_id).
    // CSV Earning Report has per-order shipping_labels for ~100% coverage.
    // This phase fills in NN orders that Phase 6a did NOT cover.
    // ═══════════════════════════════════════════════════════════
    private fun backfillLabelsFromCsv(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            UPDATE ebay_api.cleaned_transactions ct
            SET label_cost    = csv.shipping_labels,
                label_regular = csv.shipping_labels
            FROM (
                SELECT order_number, seller, shipping_labels
                FROM public.raw_earnings
                WHERE shipping_labels IS NOT NULL AND shipping_labels != 0
            ) csv
            WHERE ct.order_number = csv.order_number
            AND ct.seller = csv.seller
            AND ct.action = 'NN'
            AND (ct.label_cost = 0 OR ct.label_cost IS NULL)
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            -- For multi-item orders, assign label to first item only
            AND ct.id = (
                SELECT MIN(ct2.id) FROM ebay_api.cleaned_transactions ct2
                WHERE ct2.order_number = ct.order_number
                AND ct2.seller = ct.seller
                AND ct2.action = 'NN'
            )
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 7: Calculate net_amount
    // ═══════════════════════════════════════════════════════════
    private fun calculateNetAmount(fromDate: String, toDate: String): Int {
        return jdbcTemplate.update("""
            UPDATE ebay_api.cleaned_transactions
            SET net_amount = COALESCE(sale_amount, 0)
                - COALESCE(fvf_fee, 0)
                - COALESCE(intl_fee, 0)
                - COALESCE(other_fee, 0)
                - COALESCE(promo_fee, 0)
                - COALESCE(regulatory_fee, 0)
                + COALESCE(label_cost, 0)
                - COALESCE(dispute_fee, 0)
            WHERE action = 'NN'
            AND (order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
        """.trimIndent(), fromDate, toDate)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 8: SKU Parsing (full_sku → sku1..sku10, qty1..qty10)
    // ═══════════════════════════════════════════════════════════

    /**
     * Parse full_sku into sku1..sku10 and quantity1..quantity10 slots.
     *
     * SKU format: PREFIX.SKU1.QTY1+SKU2.QTY2.SUFFIX
     * Examples:
     *   A2.NU1C1B36K.20.Hyundai    → sku1=NU1C1B36K, qty1=20
     *   ZD.5102SH571T25.2+BE2B4E55K.10.Audi → sku1=5102SH571T25, qty1=2, sku2=BE2B4E55K, qty2=10
     *   A3.NU1C8E51K.32+2K.Ram     → sku1=NU1C8E51K, qty1=32 (2K is suffix, not a second SKU)
     */
    private fun parseSkus(fromDate: String, toDate: String): Int {
        // Load corrections (keyed by custom_label+bad_sku) and valid SKUs from products
        val correctionsByLabel = loadCorrectionsByLabel()
        val validSkus = loadValidSkus()
        log.info("Loaded {} correction entries, {} valid SKUs", correctionsByLabel.size, validSkus.size)

        // Also load corrections keyed by bad_sku only (for parseComplex fallback)
        val correctionsByBadSku = loadCorrections()

        // Fetch all rows that need SKU parsing
        val rows = jdbcTemplate.queryForList("""
            SELECT id, full_sku, quantity
            FROM ebay_api.cleaned_transactions
            WHERE (order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
        """.trimIndent(), fromDate, toDate)

        var updated = 0
        for (row in rows) {
            val id = row["id"] as Long
            val fullSku = row["full_sku"] as? String ?: ""
            val lineQty = (row["quantity"] as? Number)?.toInt() ?: 1

            // Step 1: Parse using V3 EbayCSVParser (pat1/pat2/complex)
            val result = skuParser.parse(fullSku, correctionsByBadSku, validSkus)

            // Step 2: Post-parse validation & autofix (replicates V1's _validate_and_autofix)
            val skus = Array(10) { "0" }
            val qtys = IntArray(10)
            val qtyps = IntArray(10)

            for (i in result.skus.indices) {
                if (i >= 10) break
                var sku = result.skus[i].uppercase()
                val qty = result.quantities.getOrNull(i)?.toIntOrNull() ?: 0

                // Validate: is this SKU in the products table?
                if (validSkus.isNotEmpty() && sku !in validSkus && sku != "0" && sku.isNotBlank()) {
                    // Try auto-fix: exact match on (custom_label, bad_sku)
                    val key = "${fullSku.trim()}|${sku}"
                    val fix = correctionsByLabel[key]
                    if (fix != null) {
                        log.debug("Auto-fix SKU: {} → {} (label: {})", sku, fix.correctSku, fullSku)
                        sku = fix.correctSku.uppercase()
                    }
                }

                skus[i] = sku
                qtys[i] = qty
                qtyps[i] = qty * lineQty
            }

            // ── Special KEY rule: NU1C8E51K/C with qty∈{20,24,32} → add NU1C8SKT7 ×2 ──
            // When selling these two SKUs in packs of 20/24/32, each order unit
            // includes 2 keys (NU1C8SKT7). E.g. 3 units of 24-pack = 6 keys.
            val keyPackSizes = setOf(20, 24, 32)
            if (skus[0].uppercase() in setOf("NU1C8E51K", "NU1C8E51C")
                && qtys[0] in keyPackSizes
                && skus[1] == "0"  // only inject if sku2 is empty
            ) {
                skus[1] = "NU1C8SKT7"
                qtys[1] = 2
                qtyps[1] = 2 * lineQty
            }

            jdbcTemplate.update("""
                UPDATE ebay_api.cleaned_transactions SET
                    sku1 = ?, quantity1 = ?, qtyp1 = ?,
                    sku2 = ?, quantity2 = ?, qtyp2 = ?,
                    sku3 = ?, quantity3 = ?, qtyp3 = ?,
                    sku4 = ?, quantity4 = ?, qtyp4 = ?,
                    sku5 = ?, quantity5 = ?, qtyp5 = ?,
                    sku6 = ?, quantity6 = ?, qtyp6 = ?,
                    sku7 = ?, quantity7 = ?, qtyp7 = ?,
                    sku8 = ?, quantity8 = ?, qtyp8 = ?,
                    sku9 = ?, quantity9 = ?, qtyp9 = ?,
                    sku10 = ?, quantity10 = ?, qtyp10 = ?
                WHERE id = ?
            """.trimIndent(),
                skus[0], qtys[0], qtyps[0],
                skus[1], qtys[1], qtyps[1],
                skus[2], qtys[2], qtyps[2],
                skus[3], qtys[3], qtyps[3],
                skus[4], qtys[4], qtyps[4],
                skus[5], qtys[5], qtyps[5],
                skus[6], qtys[6], qtyps[6],
                skus[7], qtys[7], qtyps[7],
                skus[8], qtys[8], qtyps[8],
                skus[9], qtys[9], qtyps[9],
                id,
            )
            updated++
        }
        return updated
    }

    /**
     * Load corrections keyed by "custom_label|bad_sku" for post-parse autofix.
     * Replicates V1's find_auto_fix(custom_label, bad_sku) exact-match lookup.
     */
    private fun loadCorrectionsByLabel(): Map<String, com.mgmt.modules.sales.domain.model.SkuCorrection> {
        val rows = jdbcTemplate.queryForList("SELECT * FROM public.sku_corrections")
        val map = mutableMapOf<String, com.mgmt.modules.sales.domain.model.SkuCorrection>()
        for (row in rows) {
            val label = (row["custom_label"] as? String)?.trim() ?: continue
            val badSku = (row["bad_sku"] as? String)?.trim()?.uppercase() ?: continue
            val correctSku = (row["correct_sku"] as? String)?.trim()?.uppercase() ?: continue
            val key = "$label|$badSku"
            map[key] = com.mgmt.modules.sales.domain.model.SkuCorrection(
                customLabel = label,
                badSku = badSku,
                badQty = row["bad_qty"] as? String,
                correctSku = correctSku,
                correctQty = row["correct_qty"] as? String,
            )
        }
        return map
    }

    /**
     * Load corrections keyed by bad_sku only (for parseComplex fallback).
     */
    private fun loadCorrections(): Map<String, com.mgmt.modules.sales.domain.model.SkuCorrection> {
        val rows = jdbcTemplate.queryForList("SELECT * FROM public.sku_corrections")
        val map = mutableMapOf<String, com.mgmt.modules.sales.domain.model.SkuCorrection>()
        for (row in rows) {
            val badSku = (row["bad_sku"] as? String)?.uppercase() ?: continue
            map[badSku] = com.mgmt.modules.sales.domain.model.SkuCorrection(
                customLabel = row["custom_label"] as? String ?: "",
                badSku = badSku,
                badQty = row["bad_qty"] as? String,
                correctSku = (row["correct_sku"] as? String)?.uppercase() ?: continue,
                correctQty = row["correct_qty"] as? String,
            )
        }
        return map
    }

    private fun loadValidSkus(): Set<String> {
        return try {
            jdbcTemplate.queryForList("SELECT UPPER(sku) AS sku FROM public.products WHERE deleted_at IS NULL", String::class.java)
                .filterNotNull()
                .toSet()
        } catch (e: Exception) {
            log.warn("Could not load product SKUs: {}", e.message)
            emptySet()
        }
    }
}

