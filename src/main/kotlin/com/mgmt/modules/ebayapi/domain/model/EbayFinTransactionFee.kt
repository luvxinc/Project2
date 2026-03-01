package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.math.BigDecimal

/**
 * EbayFinTransactionFee — 交易费用明细 (从 marketplaceFees[] 拆出)。
 *
 * 每个 feeType 一行, 如 FINAL_VALUE_FEE, AD_FEE, INTERNATIONAL_FEE 等。
 */
@Entity
@Table(name = "fin_transaction_fees", schema = "ebay_api")
class EbayFinTransactionFee(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "transaction_id", nullable = false, length = 100)
    var transactionId: String = "",

    @Column(name = "line_item_id", length = 100)
    var lineItemId: String? = null,

    @Column(name = "fee_type", nullable = false, length = 100)
    var feeType: String = "",

    @Column(name = "fee_amount", precision = 12, scale = 2, nullable = false)
    var feeAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "fee_currency", length = 10)
    var feeCurrency: String? = null,

    @Column(name = "fee_basis_amount", precision = 12, scale = 2)
    var feeBasisAmount: BigDecimal? = null,

    @Column(name = "fee_basis_currency", length = 10)
    var feeBasisCurrency: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_id", referencedColumnName = "transaction_id", insertable = false, updatable = false)
    var transaction: EbayFinTransaction? = null,
)
