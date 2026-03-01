package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.math.BigDecimal
import java.time.Instant

/**
 * EbayFulOrder — eBay Fulfillment API getOrders 原生数据。
 *
 * 🔴 完整保留 API 返回的所有字段。
 * raw_json 保留完整 API 响应作为数据完整性保险。
 */
@Entity
@Table(name = "ful_orders", schema = "ebay_api")
class EbayFulOrder(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "order_id", nullable = false, unique = true, length = 100)
    var orderId: String = "",

    @Column(name = "legacy_order_id", length = 100)
    var legacyOrderId: String? = null,

    @Column(name = "creation_date", nullable = false)
    var creationDate: Instant = Instant.now(),

    @Column(name = "last_modified_date")
    var lastModifiedDate: Instant? = null,

    @Column(name = "order_fulfillment_status", length = 50)
    var orderFulfillmentStatus: String? = null,

    @Column(name = "order_payment_status", length = 50)
    var orderPaymentStatus: String? = null,

    @Column(name = "cancel_status", length = 50)
    var cancelStatus: String? = null,

    @Column(name = "buyer_username", length = 200)
    var buyerUsername: String? = null,

    @Column(name = "buyer_full_name", length = 300)
    var buyerFullName: String? = null,

    @Column(name = "ship_to_name", length = 300)
    var shipToName: String? = null,

    @Column(name = "ship_to_address_line1", columnDefinition = "text")
    var shipToAddressLine1: String? = null,

    @Column(name = "ship_to_address_line2", columnDefinition = "text")
    var shipToAddressLine2: String? = null,

    @Column(name = "ship_to_city", length = 200)
    var shipToCity: String? = null,

    @Column(name = "ship_to_state", length = 100)
    var shipToState: String? = null,

    @Column(name = "ship_to_postal_code", length = 50)
    var shipToPostalCode: String? = null,

    @Column(name = "ship_to_country_code", length = 10)
    var shipToCountryCode: String? = null,

    @Column(name = "ship_to_phone", length = 50)
    var shipToPhone: String? = null,

    @Column(name = "price_subtotal", precision = 12, scale = 2)
    var priceSubtotal: BigDecimal = BigDecimal.ZERO,

    @Column(name = "price_discount", precision = 12, scale = 2)
    var priceDiscount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "delivery_cost", precision = 12, scale = 2)
    var deliveryCost: BigDecimal = BigDecimal.ZERO,

    @Column(name = "delivery_discount", precision = 12, scale = 2)
    var deliveryDiscount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "tax", precision = 12, scale = 2)
    var tax: BigDecimal = BigDecimal.ZERO,

    @Column(name = "total", precision = 12, scale = 2)
    var total: BigDecimal = BigDecimal.ZERO,

    @Column(name = "price_currency", length = 10)
    var priceCurrency: String? = null,

    @Column(name = "total_due_seller", precision = 12, scale = 2)
    var totalDueSeller: BigDecimal = BigDecimal.ZERO,

    @Column(name = "total_marketplace_fee", precision = 12, scale = 2)
    var totalMarketplaceFee: BigDecimal = BigDecimal.ZERO,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "refunds_json", columnDefinition = "jsonb")
    var refundsJson: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payments_json", columnDefinition = "jsonb")
    var paymentsJson: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fulfillment_hrefs_json", columnDefinition = "jsonb")
    var fulfillmentHrefsJson: String? = null,

    @Column(name = "sales_record_ref", length = 50)
    var salesRecordRef: String? = null,

    @Column(name = "seller_id", length = 100)
    var sellerId: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_json", columnDefinition = "jsonb")
    var rawJson: String? = null,

    @Column(name = "api_fetched_at", nullable = false)
    var apiFetchedAt: Instant = Instant.now(),

    @Column(name = "sync_batch_id", length = 50)
    var syncBatchId: String? = null,

    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,

    @OneToMany(mappedBy = "order", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var items: MutableList<EbayFulOrderItem> = mutableListOf(),
)
