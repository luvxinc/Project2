package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "after_sales_events", schema = "ebay_api",
    uniqueConstraints = [UniqueConstraint(columnNames = ["event_type", "event_id"])])
class EbayAfterSalesEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    @Column(name = "event_type", nullable = false, length = 50)
    var eventType: String = "",
    @Column(name = "event_id", nullable = false, length = 100)
    var eventId: String = "",
    @Column(name = "order_id", length = 100)
    var orderId: String? = null,
    @Column(name = "legacy_order_id", length = 100)
    var legacyOrderId: String? = null,
    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,
    @Column(name = "buyer_username", length = 200)
    var buyerUsername: String? = null,
    @Column(name = "item_id", length = 100)
    var itemId: String? = null,
    @Column(name = "sku", length = 500)
    var sku: String? = null,
    @Column(name = "title", length = 500)
    var title: String? = null,
    @Column(name = "quantity")
    var quantity: Int? = null,
    @Column(name = "reason", columnDefinition = "TEXT")
    var reason: String? = null,
    @Column(name = "status", length = 50)
    var status: String? = null,
    @Column(name = "amount", precision = 12, scale = 2)
    var amount: BigDecimal? = null,
    @Column(name = "currency", length = 10)
    var currency: String = "USD",
    @Column(name = "raw_json", columnDefinition = "JSONB")
    var rawJson: String? = null,
    @Column(name = "webhook_source", length = 20)
    var webhookSource: String = "API",
    @Column(name = "created_at")
    var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at")
    var updatedAt: Instant = Instant.now(),
)
