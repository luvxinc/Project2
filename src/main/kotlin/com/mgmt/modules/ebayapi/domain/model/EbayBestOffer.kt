package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * EbayBestOffer — Persisted Best Offer data received via webhook.
 *
 * Stores buyer-initiated offers so they can be displayed in the UI
 * even after the SSE event has been consumed.
 */
@Entity
@Table(name = "best_offers", schema = "ebay_api")
class EbayBestOffer(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "best_offer_id", unique = true, nullable = false, length = 64)
    var bestOfferId: String = "",

    @Column(name = "item_id", nullable = false, length = 64)
    var itemId: String = "",

    @Column(name = "seller", length = 64)
    var seller: String? = null,

    @Column(name = "buyer_user_id", length = 128)
    var buyerUserId: String? = null,

    @Column(name = "buyer_email", length = 256)
    var buyerEmail: String? = null,

    @Column(name = "offer_price", precision = 12, scale = 2)
    var offerPrice: BigDecimal? = null,

    @Column(name = "offer_currency", length = 8)
    var offerCurrency: String = "USD",

    @Column(name = "buy_it_now_price", precision = 12, scale = 2)
    var buyItNowPrice: BigDecimal? = null,

    @Column(name = "quantity")
    var quantity: Int = 1,

    @Column(name = "status", length = 32)
    var status: String = "Pending",

    @Column(name = "buyer_message", columnDefinition = "TEXT")
    var buyerMessage: String? = null,

    @Column(name = "item_title", columnDefinition = "TEXT")
    var itemTitle: String? = null,

    @Column(name = "expiration_time")
    var expirationTime: Instant? = null,

    @Column(name = "event_name", length = 64)
    var eventName: String? = null,

    @Column(name = "auto_reply_attempts")
    var autoReplyAttempts: Int = 0,

    @Column(name = "last_auto_reply_attempt_at")
    var lastAutoReplyAttemptAt: Instant? = null,

    @Column(name = "created_at")
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at")
    var updatedAt: Instant = Instant.now(),
)
