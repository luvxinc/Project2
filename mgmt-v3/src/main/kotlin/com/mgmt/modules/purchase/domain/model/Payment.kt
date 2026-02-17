package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * Payment entity — unified payment record.
 *
 * V1 source: 8 tables (in_pmt_po/_final + in_pmt_deposit/_final
 *            + in_pmt_logistic/_final + in_pmt_prepay/_final) → 1 table.
 * Discriminated by payment_type ENUM.
 */
@Entity
@Table(
    name = "payments",
    uniqueConstraints = [UniqueConstraint(columnNames = ["payment_type", "payment_no"])]
)
class Payment(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "payment_type", nullable = false, columnDefinition = "payment_type")
    var paymentType: String = "po",  // po / deposit / logistics / prepay

    @Column(name = "payment_no", length = 100, nullable = false)
    var paymentNo: String = "",

    // Reference keys (nullable based on payment_type)
    @Column(name = "po_id")
    var poId: Long? = null,

    @Column(name = "po_num", length = 50)
    var poNum: String? = null,

    @Column(name = "shipment_id")
    var shipmentId: Long? = null,

    @Column(name = "logistic_num", length = 50)
    var logisticNum: String? = null,

    @Column(name = "supplier_id")
    var supplierId: Long? = null,

    @Column(name = "supplier_code", length = 2)
    var supplierCode: String? = null,

    // Amount fields
    @Column(name = "payment_date", nullable = false)
    var paymentDate: LocalDate = LocalDate.now(),

    @Column(length = 3, nullable = false, columnDefinition = "currency_code")
    var currency: String = "USD",

    @Column(name = "cash_amount", precision = 12, scale = 2, nullable = false)
    var cashAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "prepay_amount", precision = 12, scale = 2, nullable = false)
    var prepayAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "exchange_rate", precision = 10, scale = 4, nullable = false)
    var exchangeRate: BigDecimal = BigDecimal("7.0"),

    @Column(name = "rate_mode", length = 10, nullable = false, columnDefinition = "exchange_rate_mode")
    var rateMode: String = "auto",

    // Extra fees
    @Column(name = "extra_amount", precision = 12, scale = 2, nullable = false)
    var extraAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "extra_currency", columnDefinition = "currency_code")
    var extraCurrency: String? = null,

    @Column(name = "extra_note", length = 255)
    var extraNote: String? = null,

    // Prepay specific
    @Column(name = "prepay_tran_type", columnDefinition = "prepay_tran_type")
    var prepayTranType: String? = null,

    // Deposit specific
    @Column(name = "deposit_override")
    var depositOverride: Boolean? = false,

    @Column(length = 500)
    var note: String? = null,

    // §8.1 Audit
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,

    @Version
    @Column(nullable = false)
    var version: Int = 0,
)
