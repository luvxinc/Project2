package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * RawEarning — eBay Earning CSV 原始数据。
 *
 * 去重策略: row_hash = MD5(7 业务键列) — 覆盖模式 (ON CONFLICT DO UPDATE)
 */
@Entity
@Table(name = "raw_earnings")
class RawEarning(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "upload_batch_id", length = 50)
    var uploadBatchId: String? = null,

    @Column(name = "seller", length = 100)
    var seller: String? = null,

    @Column(name = "order_number", length = 100)
    var orderNumber: String? = null,

    @Column(name = "item_id", length = 100)
    var itemId: String? = null,

    @Column(name = "order_date")
    var orderDate: Instant? = null,

    @Column(name = "buyer_name", length = 200)
    var buyerName: String? = null,

    @Column(name = "custom_label", length = 500)
    var customLabel: String? = null,

    @Column(name = "item_title", length = 500)
    var itemTitle: String? = null,

    /** V1: Shipping labels (monetary amount from Earning CSV) */
    @Column(name = "shipping_labels", precision = 12, scale = 2, nullable = false)
    var shippingLabels: BigDecimal = BigDecimal.ZERO,

    /** MD5(7 business key columns) — 覆盖模式 */
    @Column(name = "row_hash", length = 64, unique = true)
    var rowHash: String? = null,

    /** Processed_E equivalent — false = pending transform */
    @Column(name = "synced", nullable = false)
    var synced: Boolean = false,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
