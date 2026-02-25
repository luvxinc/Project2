package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * SupplierStrategy entity — supplier's contract terms snapshot.
 *
 * Each supplier can have multiple strategies (versioned by effective_date).
 */
@Entity
@Table(name = "supplier_strategies")
class SupplierStrategy(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "supplier_id", nullable = false)
    var supplierId: Long = 0,

    @Column(name = "supplier_code", length = 2, nullable = false)
    var supplierCode: String = "",

    @Column(length = 1, nullable = false)
    var category: String = "E",  // E=汽配, A=亚马逊


    @Column(length = 3, nullable = false, columnDefinition = "currency_code")
    var currency: String = "USD",

    @Column(name = "float_currency", nullable = false)
    var floatCurrency: Boolean = false,

    @Column(name = "float_threshold", precision = 5, scale = 2, nullable = false)
    var floatThreshold: BigDecimal = BigDecimal.ZERO,

    @Column(name = "require_deposit", nullable = false)
    var requireDeposit: Boolean = false,

    @Column(name = "deposit_ratio", precision = 5, scale = 2, nullable = false)
    var depositRatio: BigDecimal = BigDecimal.ZERO,

    @Column(name = "effective_date", nullable = false)
    var effectiveDate: LocalDate = LocalDate.now(),

    var note: String? = null,

    @Column(name = "contract_file", length = 500)
    var contractFile: String? = null,

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
