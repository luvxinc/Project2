package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.math.BigDecimal
import java.time.Instant

/**
 * EbayFinTransaction — eBay Finances API getTransactions 原生数据。
 *
 * 🔴 完整保留 API 返回的所有字段, 不做任何转换或删减。
 * 存储在 ebay_api schema, 与 public 物理隔离。
 */
@Entity
@Table(name = "fin_transactions", schema = "ebay_api")
class EbayFinTransaction(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "transaction_id", nullable = false, unique = true, length = 100)
    var transactionId: String = "",

    @Column(name = "transaction_type", nullable = false, length = 50)
    var transactionType: String = "",

    @Column(name = "transaction_status", length = 50)
    var transactionStatus: String? = null,

    @Column(name = "transaction_date", nullable = false)
    var transactionDate: Instant = Instant.now(),

    @Column(name = "transaction_memo", columnDefinition = "text")
    var transactionMemo: String? = null,

    @Column(name = "order_id", length = 100)
    var orderId: String? = null,

    @Column(name = "payout_id", length = 100)
    var payoutId: String? = null,

    @Column(name = "buyer_username", length = 200)
    var buyerUsername: String? = null,

    @Column(name = "amount_value", precision = 12, scale = 2)
    var amountValue: BigDecimal? = null,

    @Column(name = "amount_currency", length = 10)
    var amountCurrency: String? = null,

    @Column(name = "total_fee_basis_amount", precision = 12, scale = 2)
    var totalFeeBasisAmount: BigDecimal? = null,

    @Column(name = "total_fee_basis_currency", length = 10)
    var totalFeeBasisCurrency: String? = null,

    @Column(name = "total_fee_amount", precision = 12, scale = 2)
    var totalFeeAmount: BigDecimal? = null,

    @Column(name = "total_fee_currency", length = 10)
    var totalFeeCurrency: String? = null,

    @Column(name = "ebay_collected_tax_amount", precision = 12, scale = 2)
    var ebayCollectedTaxAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "ebay_collected_tax_currency", length = 10)
    var ebayCollectedTaxCurrency: String? = null,

    @Column(name = "booking_entry", length = 10)
    var bookingEntry: String? = null,

    @Column(name = "transfer_id", length = 100)
    var transferId: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "references_json", columnDefinition = "jsonb")
    var referencesJson: String? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "order_line_items_json", columnDefinition = "jsonb")
    var orderLineItemsJson: String? = null,

    @Column(name = "api_fetched_at", nullable = false)
    var apiFetchedAt: Instant = Instant.now(),

    @Column(name = "sync_batch_id", length = 50)
    var syncBatchId: String? = null,

    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,

    @Column(name = "raw_json", columnDefinition = "text")
    var rawJson: String? = null,

    @OneToMany(mappedBy = "transaction", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var fees: MutableList<EbayFinTransactionFee> = mutableListOf(),
)
