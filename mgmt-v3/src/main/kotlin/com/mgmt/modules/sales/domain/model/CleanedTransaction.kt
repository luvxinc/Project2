package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * CleanedTransaction — 清洗后的交易记录 (ETL Pipeline 输出)。
 *
 * V1 对应: Data_Clean_Log (MySQL, TEXT 列)
 * V3 对应: cleaned_transactions (PostgreSQL, 强类型)
 *
 * V1 Transformer 输出列 (transformer.py output_cols):
 *   order date, seller, order number, item id, item title, full sku, quantity,
 *   revenue, Shipping and handling, Seller collected tax, eBay collected tax,
 *   Final Value Fee - fixed/variable, Regulatory operating fee,
 *   International fee, Promoted Listings fee, Payments dispute fee,
 *   action, Refund, Shipping label-* (5种), buyer username, ship to city/country,
 *   sku1..sku10, qty1..qty10, qtyp1..qtyp10
 *
 * V3 表保留了 denormalized 10-slot 结构 (与 V1 一致),
 * 但 financial 字段从 TEXT 升级为 numeric(12,2)。
 *
 * 去重策略: 四维去重 (order_number + seller + item_id + action)
 *   — 见 transformer.py 行 353-362 dedup SQL
 */
@Entity
@Table(name = "cleaned_transactions")
class CleanedTransaction(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    /** V1: seller (IngestService 探测 + Transformer 清洗) */
    @Column(name = "seller", length = 100)
    var seller: String? = null,

    /** V1: order number */
    @Column(name = "order_number", length = 100)
    var orderNumber: String? = null,

    /** V1: item id */
    @Column(name = "item_id", length = 100)
    var itemId: String? = null,

    /** V1: order date (Transformer._normalize_date → YYYY-MM-DD) */
    @Column(name = "order_date", nullable = false)
    var orderDate: Instant = Instant.now(),

    /**
     * V1: action_code — Transformer 通过 type + reference_id 组合判断
     * PostgreSQL: sales_action 枚举类型
     */
    @Column(name = "action", nullable = false, columnDefinition = "sales_action")
    @Enumerated(EnumType.STRING)
    var action: SalesAction = SalesAction.NN,

    // ── SKU Slots 1-10 (V1: sku1..sku10, qty1..qty10, qtyp1..qtyp10) ──
    // V1 Transformer: sku{i} = P_SKU{i}, qty{i} = P_Quantity{i}, qtyp{i} = qty{i} * quantity
    @Column(name = "sku1", length = 100) var sku1: String? = null,
    @Column(name = "quantity1") var quantity1: Int? = 0,
    @Column(name = "qtyp1") var qtyp1: Int? = 0,

    @Column(name = "sku2", length = 100) var sku2: String? = null,
    @Column(name = "quantity2") var quantity2: Int? = 0,
    @Column(name = "qtyp2") var qtyp2: Int? = 0,

    @Column(name = "sku3", length = 100) var sku3: String? = null,
    @Column(name = "quantity3") var quantity3: Int? = 0,
    @Column(name = "qtyp3") var qtyp3: Int? = 0,

    @Column(name = "sku4", length = 100) var sku4: String? = null,
    @Column(name = "quantity4") var quantity4: Int? = 0,
    @Column(name = "qtyp4") var qtyp4: Int? = 0,

    @Column(name = "sku5", length = 100) var sku5: String? = null,
    @Column(name = "quantity5") var quantity5: Int? = 0,
    @Column(name = "qtyp5") var qtyp5: Int? = 0,

    @Column(name = "sku6", length = 100) var sku6: String? = null,
    @Column(name = "quantity6") var quantity6: Int? = 0,
    @Column(name = "qtyp6") var qtyp6: Int? = 0,

    @Column(name = "sku7", length = 100) var sku7: String? = null,
    @Column(name = "quantity7") var quantity7: Int? = 0,
    @Column(name = "qtyp7") var qtyp7: Int? = 0,

    @Column(name = "sku8", length = 100) var sku8: String? = null,
    @Column(name = "quantity8") var quantity8: Int? = 0,
    @Column(name = "qtyp8") var qtyp8: Int? = 0,

    @Column(name = "sku9", length = 100) var sku9: String? = null,
    @Column(name = "quantity9") var quantity9: Int? = 0,
    @Column(name = "qtyp9") var qtyp9: Int? = 0,

    @Column(name = "sku10", length = 100) var sku10: String? = null,
    @Column(name = "quantity10") var quantity10: Int? = 0,
    @Column(name = "qtyp10") var qtyp10: Int? = 0,

    // ── Financial (V1 TEXT → V3 numeric) ──

    /** V1: revenue (= item subtotal) */
    @Column(name = "sale_amount", precision = 12, scale = 2, nullable = false)
    var saleAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: Shipping and handling */
    @Column(name = "shipping_fee", precision = 12, scale = 2, nullable = false)
    var shippingFee: BigDecimal = BigDecimal.ZERO,

    /** V1: Seller collected tax + eBay collected tax */
    @Column(name = "tax_amount", precision = 12, scale = 2, nullable = false)
    var taxAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: 计算列 — 净收入 */
    @Column(name = "net_amount", precision = 12, scale = 2, nullable = false)
    var netAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: Promoted Listings fee */
    @Column(name = "ad_fee", precision = 12, scale = 2, nullable = false)
    var adFee: BigDecimal = BigDecimal.ZERO,

    /** V1: Regulatory operating fee + other fees */
    @Column(name = "other_fee", precision = 12, scale = 2, nullable = false)
    var otherFee: BigDecimal = BigDecimal.ZERO,

    /** V1: 四维去重 hash (order_number + seller + item_id + action) */
    @Column(name = "row_hash", length = 64, unique = true)
    var rowHash: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
