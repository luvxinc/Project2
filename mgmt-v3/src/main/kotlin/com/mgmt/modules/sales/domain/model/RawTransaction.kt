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

    /** V1: Seller collected tax + eBay collected tax */
    @Column(name = "tax_amount", precision = 12, scale = 2, nullable = false)
    var taxAmount: BigDecimal = BigDecimal.ZERO,

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

    /** V1: Final Value Fee - fixed + variable (TEXT) */
    @Column(name = "listing_fee", columnDefinition = "text")
    var listingFee: String? = null,

    /** V1: International fee (TEXT) */
    @Column(name = "intl_fee", columnDefinition = "text")
    var intlFee: String? = null,

    /** V1: Regulatory operating fee + other (TEXT) */
    @Column(name = "other_fee", columnDefinition = "text")
    var otherFee: String? = null,

    /** V1: compute_row_hash_full() — MD5('|'.join(all_values)) */
    @Column(name = "row_hash", length = 64, unique = true)
    var rowHash: String? = null,

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
