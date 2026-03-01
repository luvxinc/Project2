package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.math.BigDecimal

/**
 * EbayFulOrderItem — 订单行项目 (从 lineItems[] 拆出)。
 *
 * 🔴 每个 lineItem 一行, 完整保留 API 返回字段。
 *     sku = Custom Label — ETL 核心依赖字段。
 */
@Entity
@Table(name = "ful_order_items", schema = "ebay_api")
class EbayFulOrderItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "order_id", nullable = false, length = 100)
    var orderId: String = "",

    @Column(name = "line_item_id", nullable = false, length = 100)
    var lineItemId: String = "",

    @Column(name = "legacy_item_id", length = 100)
    var legacyItemId: String? = null,

    @Column(name = "legacy_variation_id", length = 100)
    var legacyVariationId: String? = null,

    @Column(name = "title", length = 500)
    var title: String? = null,

    @Column(name = "sku", length = 500)
    var sku: String? = null,

    @Column(name = "quantity", nullable = false)
    var quantity: Int = 0,

    @Column(name = "line_item_cost", precision = 12, scale = 2)
    var lineItemCost: BigDecimal = BigDecimal.ZERO,

    @Column(name = "discounted_line_item_cost", precision = 12, scale = 2)
    var discountedLineItemCost: BigDecimal = BigDecimal.ZERO,

    @Column(name = "line_item_currency", length = 10)
    var lineItemCurrency: String? = null,

    @Column(name = "ebay_collect_and_remit_tax", precision = 12, scale = 2)
    var ebayCollectAndRemitTax: BigDecimal = BigDecimal.ZERO,

    @Column(name = "sold_via_ad_campaign")
    var soldViaAdCampaign: Boolean = false,

    @Column(name = "condition_id", length = 50)
    var conditionId: String? = null,

    @Column(name = "condition_description", length = 200)
    var conditionDescription: String? = null,

    @Column(name = "listing_marketplace_id", length = 50)
    var listingMarketplaceId: String? = null,

    @Column(name = "purchase_marketplace_id", length = 50)
    var purchaseMarketplaceId: String? = null,

    @Column(name = "sold_format", length = 50)
    var soldFormat: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "applied_promotions_json", columnDefinition = "jsonb")
    var appliedPromotionsJson: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "taxes_json", columnDefinition = "jsonb")
    var taxesJson: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "delivery_cost_json", columnDefinition = "jsonb")
    var deliveryCostJson: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", referencedColumnName = "order_id", insertable = false, updatable = false)
    var order: EbayFulOrder? = null,
)
