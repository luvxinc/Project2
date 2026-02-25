package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.dto.TransformResultResponse
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.RawTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import com.mgmt.modules.sales.domain.repository.CleanedTransactionRepository
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import com.mgmt.modules.sales.domain.repository.RawEarningRepository
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/**
 * EtlTransformUseCase — 业务转换 + 4D 去重写入 cleaned_transactions。
 *
 * V1 对应: transformer.py TransformerService
 * 职责:
 *   1. P13: Working Set 跨批次重算 (V1 parity: Processed_T/E=0 → pending_orders)
 *   2. P12: Seller 多店铺优先级选择 (V1 parity: esparts* first)
 *   3. Action 映射 (type + reference_id → NN/CA/RE/CR/CC/PD)
 *   4. P8/P9: Fee/Tax 分别存储
 *   5. Fee 分摊 (item_subtotal / order_subtotal)
 *   6. Shipping Label 分类 (5 types)
 *   7. Return record 生成 (copy NN items → set action)
 *   8. 4D 去重 ON CONFLICT(order_number, seller, item_id, action) DO UPDATE
 */
@Service
class EtlTransformUseCase(
    private val rawTransRepo: RawTransactionRepository,
    private val rawEarnRepo: RawEarningRepository,
    private val cleanedRepo: CleanedTransactionRepository,
    private val batchRepo: EtlBatchRepository,
) {
    private val log = LoggerFactory.getLogger(EtlTransformUseCase::class.java)

    @Transactional
    fun transform(batchId: String): TransformResultResponse {
        val batch = batchRepo.findByBatchId(batchId)
            ?: throw IllegalArgumentException("Batch not found: $batchId")

        batch.status = "transforming"
        batch.progress = 65
        batch.stageMessage = "Building Working Set..."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        // ══════════════════════════════════════════════════════════════
        // P13: Working Set — V1 parity: transformer.py L90-140
        //
        // V1 logic:
        //   pending_orders = DISTINCT(order_number)
        //       FROM Data_Transaction WHERE Processed_T = 0
        //       UNION
        //       FROM Data_Order_Earning WHERE Processed_E = 0
        //
        // Then for ALL orders in pending_orders:
        //   1. DELETE from Data_Clean_Log WHERE order_number IN (pending_orders)
        //   2. Re-fetch ALL raw data for those orders (not just unsynced)
        //   3. Re-transform and INSERT
        //   4. Mark Processed_T=1, Processed_E=1
        // ══════════════════════════════════════════════════════════════

        val unsyncedTrans = rawTransRepo.findAllBySyncedFalse()
        val unsyncedEarnings = rawEarnRepo.findAllBySyncedFalse()

        val pendingOrders = (
            unsyncedTrans.mapNotNull { it.orderNumber } +
            unsyncedEarnings.mapNotNull { it.orderNumber }
        ).distinct()

        if (pendingOrders.isEmpty()) {
            batch.status = "transformed"
            batch.progress = 80
            batch.stageMessage = "No pending orders to transform."
            batch.updatedAt = Instant.now()
            batchRepo.save(batch)
            return TransformResultResponse(
                batchId = batchId,
                cleanedCount = 0,
                actionBreakdown = emptyMap(),
                fifoOutCount = 0,
                fifoReturnCount = 0,
            )
        }

        log.info("ETL batch {} Working Set: {} pending orders from {} unsynced trans + {} unsynced earn",
            batchId, pendingOrders.size, unsyncedTrans.size, unsyncedEarnings.size)

        // V1 parity: DELETE existing cleaned records for pending orders (will be re-created)
        cleanedRepo.deleteAllByOrderNumberIn(pendingOrders)

        // Fetch ALL raw data for pending orders (not just unsynced — V1 parity)
        val allTx = rawTransRepo.findAllByOrderNumberIn(pendingOrders)
        val allEarn = rawEarnRepo.findAllByOrderNumberIn(pendingOrders)

        batch.stageMessage = "Transforming ${allTx.size} transactions..."
        batch.progress = 70
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        // ── Step 1: Classify transactions ──
        val orderTxs = mutableListOf<RawTransaction>()      // type=order
        val returnTxs = mutableListOf<RawTransaction>()      // type=refund/claim
        val shippingTxs = mutableListOf<RawTransaction>()    // type=shipping label

        for (tx in allTx) {
            when (tx.transactionType?.lowercase()) {
                "order" -> orderTxs.add(tx)
                "refund" -> returnTxs.add(tx)
                "claim" -> returnTxs.add(tx)
                "shipping label" -> shippingTxs.add(tx)
                "payment dispute" -> returnTxs.add(tx)
            }
        }

        // ── Step 2: P12 — Seller priority map (V1 parity: transformer.py L199-205) ──
        // V1: for each order_number, pick the seller with highest priority
        //   Priority: esparts* first (is_prio=1), then alphabetically
        val sellerMap = computeSellerMap(allTx)

        // ── Step 3: Compute shipping label by order (V1 parity) ──
        val shippingByOrder = computeShippingLabels(shippingTxs)

        // ── Step 4: Load earning shipping data ──
        val earningByOrder = mutableMapOf<String, BigDecimal>()
        for (e in allEarn) {
            val key = e.orderNumber ?: continue
            earningByOrder[key] = (earningByOrder[key] ?: BigDecimal.ZERO) + e.shippingLabels
        }

        // ── Step 5: Compute order totals for fee proration ──
        val orderTotals = mutableMapOf<String, BigDecimal>() // order_number → sum(item_subtotal)
        for (tx in orderTxs) {
            val key = tx.orderNumber ?: continue
            orderTotals[key] = (orderTotals[key] ?: BigDecimal.ZERO) + tx.saleAmount
        }

        // ── Step 6: Transform order rows → cleaned ──
        val actionBreakdown = mutableMapOf<String, Int>()
        var cleanedCount = 0

        for (tx in orderTxs) {
            if (tx.items.isEmpty()) continue
            val seller = sellerMap[tx.orderNumber] ?: tx.seller ?: ""
            val ct = buildCleanedTransaction(tx, SalesAction.NN, seller, orderTotals, shippingByOrder, earningByOrder)
            upsertCleaned(ct)
            cleanedCount++
            actionBreakdown["NN"] = (actionBreakdown["NN"] ?: 0) + 1
        }

        // ── Step 7: Transform return rows ──
        // V1 parity: for each return, find matching NN order and copy items
        for (tx in returnTxs) {
            val action = mapAction(tx.transactionType, tx.referenceId)
            if (action == SalesAction.PD) continue // Payment disputes skipped

            val orderNumber = tx.orderNumber ?: continue
            val matchingOrders = orderTxs.filter { it.orderNumber == orderNumber && it.items.isNotEmpty() }
            val seller = sellerMap[orderNumber] ?: tx.seller ?: ""

            if (matchingOrders.isNotEmpty()) {
                for (orderTx in matchingOrders) {
                    val ct = buildCleanedTransaction(orderTx, action, seller, orderTotals, shippingByOrder, earningByOrder)
                    ct.refundAmount = tx.refundAmount
                    upsertCleaned(ct)
                    cleanedCount++
                    actionBreakdown[action.name] = (actionBreakdown[action.name] ?: 0) + 1
                }
            } else {
                if (tx.items.isNotEmpty()) {
                    val ct = buildCleanedTransaction(tx, action, seller, orderTotals, shippingByOrder, earningByOrder)
                    ct.refundAmount = tx.refundAmount
                    upsertCleaned(ct)
                    cleanedCount++
                    actionBreakdown[action.name] = (actionBreakdown[action.name] ?: 0) + 1
                }
            }
        }

        // ── Step 8: P13 — Mark all processed records as synced ──
        // V1 parity: UPDATE Data_Transaction SET Processed_T = 1 WHERE row_hash IN (...)
        for (tx in unsyncedTrans) {
            tx.synced = true
        }
        rawTransRepo.saveAll(unsyncedTrans)

        for (e in unsyncedEarnings) {
            e.synced = true
        }
        rawEarnRepo.saveAll(unsyncedEarnings)

        // Update batch
        batch.status = "transformed"
        batch.progress = 80
        batch.stageMessage = "Transform complete. $cleanedCount cleaned records."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        log.info("ETL batch {} transformed: {} cleaned records, {} orders processed",
            batchId, cleanedCount, pendingOrders.size)

        return TransformResultResponse(
            batchId = batchId,
            cleanedCount = cleanedCount,
            actionBreakdown = actionBreakdown,
            fifoOutCount = actionBreakdown["NN"] ?: 0,
            fifoReturnCount = actionBreakdown.entries
                .filter { it.key != "NN" }
                .sumOf { it.value },
        )
    }

    /**
     * P12: V1 parity — transformer.py L199-205 seller priority logic.
     *
     * For each order_number, select the best seller:
     *   1. Clean seller string (strip quotes)
     *   2. Priority: "esparts" prefix sellers first (is_prio=1)
     *   3. Then alphabetically
     *   4. First match wins (drop_duplicates on order_number)
     */
    private fun computeSellerMap(allTx: List<RawTransaction>): Map<String, String> {
        data class SellerCandidate(val orderNumber: String, val seller: String, val isPrio: Int)

        val candidates = allTx
            .filter { !it.orderNumber.isNullOrBlank() && !it.seller.isNullOrBlank() }
            .map { tx ->
                val cleaned = tx.seller!!.trim().replace(Regex("['\"]"), "")
                val isPrio = if (cleaned.lowercase().contains("esparts")) 1 else 0
                SellerCandidate(tx.orderNumber!!, cleaned, isPrio)
            }
            .sortedWith(compareByDescending<SellerCandidate> { it.isPrio }.thenBy { it.seller })

        // V1: drop_duplicates('order number') — first match per order wins
        val result = mutableMapOf<String, String>()
        for (c in candidates) {
            if (c.orderNumber !in result) {
                result[c.orderNumber] = c.seller
            }
        }
        return result
    }

    /**
     * V1 parity: transformer.py action mapping logic
     */
    private fun mapAction(type: String?, referenceId: String?): SalesAction {
        val typeLower = (type ?: "").lowercase()
        val refLower = (referenceId ?: "").lowercase()

        return when {
            typeLower == "payment dispute" -> SalesAction.PD
            typeLower == "claim" && "case" in refLower -> SalesAction.CC
            typeLower == "claim" && "request" in refLower -> SalesAction.CR
            typeLower == "refund" && "return" in refLower -> SalesAction.RE
            typeLower == "refund" && "cancel" in refLower -> SalesAction.CA
            else -> SalesAction.NN
        }
    }

    /**
     * V1 parity: transformer.py shipping label classification (5 types)
     */
    private fun computeShippingLabels(shippingTxs: List<RawTransaction>): Map<String, ShippingLabels> {
        val result = mutableMapOf<String, ShippingLabels>()

        for (tx in shippingTxs) {
            val orderNum = tx.orderNumber ?: continue
            val descLower = (tx.description ?: "").lowercase()
            val amt = tx.totalAmount

            val labels = result.getOrPut(orderNum) { ShippingLabels() }

            when {
                "underpaid" in descLower -> labels.underpay = labels.underpay + amt
                "overpaid" in descLower -> labels.overpay = labels.overpay + amt
                "return shipping" in descLower -> labels.returnShip = labels.returnShip + amt
                "voided" in descLower || "bulk" in descLower -> { /* excluded from regular */ }
                else -> labels.regular = labels.regular + amt
            }
        }
        return result
    }

    private data class ShippingLabels(
        var underpay: BigDecimal = BigDecimal.ZERO,
        var overpay: BigDecimal = BigDecimal.ZERO,
        var returnShip: BigDecimal = BigDecimal.ZERO,
        var regular: BigDecimal = BigDecimal.ZERO,
    )

    /**
     * Build a CleanedTransaction from a RawTransaction.
     * V1 parity: transformer.py output_cols mapping.
     *
     * P8: FVF split into fixed + variable
     * P9: Tax split into seller + ebay
     * P12: Seller from sellerMap (priority-selected)
     */
    private fun buildCleanedTransaction(
        tx: RawTransaction,
        action: SalesAction,
        seller: String,
        orderTotals: Map<String, BigDecimal>,
        shippingByOrder: Map<String, ShippingLabels>,
        earningByOrder: Map<String, BigDecimal>,
    ): CleanedTransaction {
        val orderNum = tx.orderNumber ?: ""

        // Fee proration ratio (V1 parity: item_subtotal / order_subtotal)
        val orderTotal = orderTotals[orderNum] ?: BigDecimal.ONE
        val ratio = if (orderTotal.compareTo(BigDecimal.ZERO) != 0) {
            tx.saleAmount.divide(orderTotal, 10, RoundingMode.HALF_UP)
        } else {
            BigDecimal.ZERO
        }

        // Shipping labels prorated
        val labels = shippingByOrder[orderNum]
        val earningShip = earningByOrder[orderNum] ?: BigDecimal.ZERO

        // P8: FVF split — parse from raw text fields
        val fvfFixed = parseBigDecimal(tx.fvfFeeFixed)
        val fvfVariable = parseBigDecimal(tx.fvfFeeVariable)
        val fvfTotal = fvfFixed + fvfVariable

        val ct = CleanedTransaction(
            seller = seller,                                  // P12: from sellerMap
            orderNumber = tx.orderNumber,
            itemId = tx.itemId,
            orderDate = tx.orderDate ?: Instant.now(),
            action = action,
            quantity = tx.quantity,
            itemTitle = tx.itemTitle,
            // V1 parity: full_sku = "SKU1.QTY1+SKU2.QTY2" (computed from parsed items)
            fullSku = tx.items
                .filter { !it.sku.isBlank() }
                .joinToString("+") { "${it.sku}.${it.quantity}" }
                .ifEmpty { tx.customLabel },
            buyerUsername = tx.buyer,
            shipToCity = tx.shipToCity,
            shipToCountry = tx.shipToCountry,
            saleAmount = tx.saleAmount,
            shippingFee = tx.shippingFee,
            taxAmount = tx.sellerTax + tx.ebayTax,           // combined (backward compat)
            sellerTax = tx.sellerTax,                         // P9: split
            ebayTax = tx.ebayTax,                             // P9: split
            netAmount = parseBigDecimal(tx.netAmount),
            adFee = parseBigDecimal(tx.adFee),         // V1: Promoted Listings fee (primary)
            otherFee = parseBigDecimal(tx.otherFee),     // V1: Regulatory operating fee (primary)
            fvfFee = fvfTotal,                                // combined (backward compat)
            fvfFeeFixed = fvfFixed,                           // P8: split
            fvfFeeVariable = fvfVariable,                     // P8: split
            intlFee = parseBigDecimal(tx.intlFee),
            promoFee = parseBigDecimal(tx.adFee),        // P10: deprecated alias = adFee
            regulatoryFee = parseBigDecimal(tx.otherFee), // P11: deprecated alias = otherFee
            disputeFee = parseBigDecimal(tx.disputeFee),
            refundAmount = tx.refundAmount,
            labelCost = prorate(earningShip, ratio),
            labelReturn = prorate(labels?.returnShip ?: BigDecimal.ZERO, ratio),
            labelUnderpay = prorate(labels?.underpay ?: BigDecimal.ZERO, ratio),
            labelOverpay = prorate(labels?.overpay ?: BigDecimal.ZERO, ratio),
            labelRegular = prorate(labels?.regular ?: BigDecimal.ZERO, ratio),
        )

        // Copy SKU slots from items (V1 parity: sku1..10, qty1..10, qtyp1..10)
        val items = tx.items
        for (i in items.indices) {
            if (i >= 10) break
            val item = items[i]
            val qtyp = item.quantity * tx.quantity
            when (i) {
                0 -> { ct.sku1 = item.sku; ct.quantity1 = item.quantity; ct.qtyp1 = qtyp }
                1 -> { ct.sku2 = item.sku; ct.quantity2 = item.quantity; ct.qtyp2 = qtyp }
                2 -> { ct.sku3 = item.sku; ct.quantity3 = item.quantity; ct.qtyp3 = qtyp }
                3 -> { ct.sku4 = item.sku; ct.quantity4 = item.quantity; ct.qtyp4 = qtyp }
                4 -> { ct.sku5 = item.sku; ct.quantity5 = item.quantity; ct.qtyp5 = qtyp }
                5 -> { ct.sku6 = item.sku; ct.quantity6 = item.quantity; ct.qtyp6 = qtyp }
                6 -> { ct.sku7 = item.sku; ct.quantity7 = item.quantity; ct.qtyp7 = qtyp }
                7 -> { ct.sku8 = item.sku; ct.quantity8 = item.quantity; ct.qtyp8 = qtyp }
                8 -> { ct.sku9 = item.sku; ct.quantity9 = item.quantity; ct.qtyp9 = qtyp }
                9 -> { ct.sku10 = item.sku; ct.quantity10 = item.quantity; ct.qtyp10 = qtyp }
            }
        }

        return ct
    }

    /**
     * 4D upsert: ON CONFLICT(order_number, COALESCE(seller,''), COALESCE(item_id,''), action) DO UPDATE
     * V1 parity: transformer.py staging table DELETE+INSERT hack → PG UNIQUE + ON CONFLICT
     */
    private fun upsertCleaned(ct: CleanedTransaction) {
        val orderNumber = ct.orderNumber ?: run {
            cleanedRepo.save(ct)
            return
        }
        val existing = cleanedRepo.findBy4DKey(
            orderNumber,
            ct.seller ?: "",
            ct.itemId ?: "",
            ct.action.name,
        )

        if (existing != null) {
            copyCleanedFields(from = ct, to = existing)
            cleanedRepo.save(existing)
        } else {
            cleanedRepo.save(ct)
        }
    }

    private fun copyCleanedFields(from: CleanedTransaction, to: CleanedTransaction) {
        to.orderDate = from.orderDate
        to.quantity = from.quantity
        to.itemTitle = from.itemTitle
        to.fullSku = from.fullSku
        to.buyerUsername = from.buyerUsername
        to.shipToCity = from.shipToCity
        to.shipToCountry = from.shipToCountry
        to.saleAmount = from.saleAmount
        to.shippingFee = from.shippingFee
        to.taxAmount = from.taxAmount
        to.sellerTax = from.sellerTax             // P9
        to.ebayTax = from.ebayTax                 // P9
        to.netAmount = from.netAmount
        to.adFee = from.adFee
        to.otherFee = from.otherFee
        to.fvfFee = from.fvfFee
        to.fvfFeeFixed = from.fvfFeeFixed         // P8
        to.fvfFeeVariable = from.fvfFeeVariable   // P8
        to.intlFee = from.intlFee
        to.promoFee = from.promoFee
        to.regulatoryFee = from.regulatoryFee
        to.disputeFee = from.disputeFee
        to.refundAmount = from.refundAmount
        to.labelCost = from.labelCost
        to.labelReturn = from.labelReturn
        to.labelUnderpay = from.labelUnderpay
        to.labelOverpay = from.labelOverpay
        to.labelRegular = from.labelRegular
        // SKU slots
        to.sku1 = from.sku1; to.quantity1 = from.quantity1; to.qtyp1 = from.qtyp1
        to.sku2 = from.sku2; to.quantity2 = from.quantity2; to.qtyp2 = from.qtyp2
        to.sku3 = from.sku3; to.quantity3 = from.quantity3; to.qtyp3 = from.qtyp3
        to.sku4 = from.sku4; to.quantity4 = from.quantity4; to.qtyp4 = from.qtyp4
        to.sku5 = from.sku5; to.quantity5 = from.quantity5; to.qtyp5 = from.qtyp5
        to.sku6 = from.sku6; to.quantity6 = from.quantity6; to.qtyp6 = from.qtyp6
        to.sku7 = from.sku7; to.quantity7 = from.quantity7; to.qtyp7 = from.qtyp7
        to.sku8 = from.sku8; to.quantity8 = from.quantity8; to.qtyp8 = from.qtyp8
        to.sku9 = from.sku9; to.quantity9 = from.quantity9; to.qtyp9 = from.qtyp9
        to.sku10 = from.sku10; to.quantity10 = from.quantity10; to.qtyp10 = from.qtyp10
    }

    private fun prorate(amount: BigDecimal, ratio: BigDecimal): BigDecimal =
        amount.multiply(ratio).setScale(2, RoundingMode.HALF_UP)

    private fun parseBigDecimal(s: String?): BigDecimal {
        if (s.isNullOrBlank()) return BigDecimal.ZERO
        return try {
            BigDecimal(s.trim().replace(",", "").replace("$", ""))
        } catch (_: Exception) {
            BigDecimal.ZERO
        }
    }
}
