package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * PurchaseOrderStrategy — contract terms snapshot for a specific PO.
 *
 * Captures the currency/deposit/exchange config at PO creation time.
 */
@Entity
@Table(name = "purchase_order_strategies")
class PurchaseOrderStrategy(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "po_id", nullable = false)
    var poId: Long = 0,

    @Column(name = "po_num", length = 50, nullable = false)
    var poNum: String = "",

    @Column(name = "strategy_date", nullable = false)
    var strategyDate: LocalDate = LocalDate.now(),

    @Column(length = 3, nullable = false, columnDefinition = "currency_code")
    var currency: String = "USD",

    @Column(name = "exchange_rate", precision = 10, scale = 4, nullable = false)
    var exchangeRate: BigDecimal = BigDecimal("7.0"),

    @Column(name = "rate_mode", length = 10, nullable = false, columnDefinition = "exchange_rate_mode")
    var rateMode: String = "auto",

    @Column(name = "float_enabled", nullable = false)
    var floatEnabled: Boolean = false,

    @Column(name = "float_threshold", precision = 5, scale = 2, nullable = false)
    var floatThreshold: BigDecimal = BigDecimal.ZERO,

    @Column(name = "require_deposit", nullable = false)
    var requireDeposit: Boolean = false,

    @Column(name = "deposit_ratio", precision = 5, scale = 2, nullable = false)
    var depositRatio: BigDecimal = BigDecimal.ZERO,

    @Column(length = 500)
    var note: String? = null,

    /** strategy edit version counter (V01, V02, ...) */
    @Column(name = "strategy_seq", nullable = false)
    var strategySeq: Int = 1,

    // §8.1 Audit
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,

    @Version
    @Column(nullable = false)
    var version: Int = 0,
)
