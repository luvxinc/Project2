package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * RawTransaction — 从 eBay CSV 上传的原始交易记录。
 *
 * V1 对应: Data_Transaction (MySQL, 全 TEXT 列)
 * V3 对应: raw_transactions (PostgreSQL, 强类型)
 *
 * 去重策略: row_hash (MD5 of all columns) — 见 V1 ingest.py compute_row_hash_full()
 * 关联: 1:N → raw_transaction_items (CASCADE DELETE)
 */
@Entity
@Table(name = "raw_transactions")
class RawTransaction(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    /** ebay / amazon */
    @Column(name = "source", length = 20, nullable = false)
    var source: String = "ebay",

    /** 上传批次 ID, 用于追踪同批次的文件 */
    @Column(name = "upload_batch_id", length = 50)
    var uploadBatchId: String? = null,

    /** V1: Seller 列 (IngestService._detect_metadata 探测) */
    @Column(name = "seller", length = 100)
    var seller: String? = null,

    /** V1: Order number */
    @Column(name = "order_number", length = 100)
    var orderNumber: String? = null,

    /** V1: Item id */
    @Column(name = "item_id", length = 100)
    var itemId: String? = null,

    /** V1: Transaction creation date → 格式化成 YYYY-MM-DD 再入库 */
    @Column(name = "order_date")
    var orderDate: Instant? = null,

    /** V1: Buyer username */
    @Column(name = "buyer", length = 200)
    var buyer: String? = null,

    /** V1: Item subtotal */
    @Column(name = "sale_amount", precision = 12, scale = 2, nullable = false)
    var saleAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: Shipping and handling */
    @Column(name = "shipping_fee", precision = 12, scale = 2, nullable = false)
    var shippingFee: BigDecimal = BigDecimal.ZERO,

    /** V1: Seller collected tax + eBay collected tax (合计, 保留向后兼容) */
    @Column(name = "tax_amount", precision = 12, scale = 2, nullable = false)
    var taxAmount: BigDecimal = BigDecimal.ZERO,

    /** V1 parity P9: Seller collected tax (拆分) */
    @Column(name = "seller_tax", precision = 12, scale = 2, nullable = false)
    var sellerTax: BigDecimal = BigDecimal.ZERO,

    /** V1 parity P9: eBay collected tax (拆分) */
    @Column(name = "ebay_tax", precision = 12, scale = 2, nullable = false)
    var ebayTax: BigDecimal = BigDecimal.ZERO,

    /** V1: Gross transaction amount */
    @Column(name = "total_amount", precision = 12, scale = 2, nullable = false)
    var totalAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: Net amount (仍为 TEXT, 因 V1 存的是原始字符串) */
    @Column(name = "net_amount", columnDefinition = "text")
    var netAmount: String? = null,

    /** V1: Promoted Listings fee (TEXT) */
    @Column(name = "ad_fee", columnDefinition = "text")
    var adFee: String? = null,

    /** V1: promo listing (TEXT) */
    @Column(name = "promo_listing", columnDefinition = "text")
    var promoListing: String? = null,

    /** V1: Final Value Fee - fixed + variable 合并 (TEXT, 保留向后兼容) */
    @Column(name = "listing_fee", columnDefinition = "text")
    var listingFee: String? = null,

    /** V1 parity P8: Final Value Fee - fixed (TEXT, 拆分) */
    @Column(name = "fvf_fee_fixed", columnDefinition = "text")
    var fvfFeeFixed: String? = null,

    /** V1 parity P8: Final Value Fee - variable (TEXT, 拆分) */
    @Column(name = "fvf_fee_variable", columnDefinition = "text")
    var fvfFeeVariable: String? = null,

    /** V1: International fee (TEXT) */
    @Column(name = "intl_fee", columnDefinition = "text")
    var intlFee: String? = null,

    /** V1: Regulatory operating fee + other (TEXT) */
    @Column(name = "other_fee", columnDefinition = "text")
    var otherFee: String? = null,

    // ── V27: ETL pipeline columns ──

    /** V1: Type — order / refund / claim / shipping label / payment dispute */
    @Column(name = "transaction_type", length = 50)
    var transactionType: String? = null,

    /** V1: Reference ID (contains return/cancel/case/request keywords) */
    @Column(name = "reference_id", length = 200)
    var referenceId: String? = null,

    /** V1: Custom label — SKU 解析源 */
    @Column(name = "custom_label", length = 500)
    var customLabel: String? = null,

    /** V1: Item title */
    @Column(name = "item_title", length = 500)
    var itemTitle: String? = null,

    /** V1: Quantity (order line quantity) */
    @Column(name = "quantity", nullable = false)
    var quantity: Int = 0,

    /** V1: Description — Shipping label 分类用 */
    @Column(name = "description", columnDefinition = "text")
    var description: String? = null,

    /** V1: Ship to city */
    @Column(name = "ship_to_city", length = 200)
    var shipToCity: String? = null,

    /** V1: Ship to country */
    @Column(name = "ship_to_country", length = 100)
    var shipToCountry: String? = null,

    /** V1: Payments dispute fee (TEXT, raw CSV value) */
    @Column(name = "dispute_fee", columnDefinition = "text")
    var disputeFee: String? = null,

    /** V1: Refund amount */
    @Column(name = "refund_amount", precision = 12, scale = 2, nullable = false)
    var refundAmount: BigDecimal = BigDecimal.ZERO,

    /** V1: compute_row_hash_full() — MD5('|'.join(all_values)) */
    @Column(name = "row_hash", length = 64, unique = true)
    var rowHash: String? = null,

    /** V1 parity P13: Processed_T equivalent — false = pending transform */
    @Column(name = "synced", nullable = false)
    var synced: Boolean = false,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    /**
     * items: 解析出的 SKU+Quantity 行项目
     * V1: Parser 从 Custom label 解析出 P_SKU1..P_SKU10 后, 按 item 拆分
     * EAGER 加载: 每笔交易通常只有 1-3 个 item
     */
    @OneToMany(mappedBy = "transaction", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.EAGER)
    var items: MutableList<RawTransactionItem> = mutableListOf(),
)
