package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.math.BigDecimal
import java.time.Instant

/**
 * EbayFinPayout — eBay Finances API getPayouts 打款记录。
 */
@Entity
@Table(name = "fin_payouts", schema = "ebay_api")
class EbayFinPayout(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "payout_id", nullable = false, unique = true, length = 100)
    var payoutId: String = "",

    @Column(name = "payout_status", length = 50)
    var payoutStatus: String? = null,

    @Column(name = "payout_date")
    var payoutDate: Instant? = null,

    @Column(name = "amount_value", precision = 12, scale = 2)
    var amountValue: BigDecimal? = null,

    @Column(name = "amount_currency", length = 10)
    var amountCurrency: String? = null,

    @Column(name = "payout_instrument_type", length = 50)
    var payoutInstrumentType: String? = null,

    @Column(name = "payout_memo", columnDefinition = "text")
    var payoutMemo: String? = null,

    @Column(name = "bank_name", length = 200)
    var bankName: String? = null,

    @Column(name = "last4_digits", length = 4)
    var last4Digits: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_json", columnDefinition = "jsonb")
    var rawJson: String? = null,

    @Column(name = "api_fetched_at", nullable = false)
    var apiFetchedAt: Instant = Instant.now(),

    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,
)
