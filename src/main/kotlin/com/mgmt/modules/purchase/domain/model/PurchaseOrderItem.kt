package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * PurchaseOrderItem — line item within a PO.
 *
 * V3: child of purchase_orders via po_id FK.
 */
@Entity
@Table(
    name = "purchase_order_items",
    uniqueConstraints = [UniqueConstraint(columnNames = ["po_id", "sku", "unit_price"])]
)
class PurchaseOrderItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "po_id", nullable = false)
    var poId: Long = 0,

    @Column(name = "po_num", length = 50, nullable = false)
    var poNum: String = "",

    @Column(length = 100, nullable = false)
    var sku: String = "",

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(name = "unit_price", precision = 12, scale = 5, nullable = false)
    var unitPrice: BigDecimal = BigDecimal.ZERO,

    @Column(length = 3, nullable = false, columnDefinition = "currency_code")
    var currency: String = "RMB",

    @Column(name = "exchange_rate", precision = 10, scale = 4, nullable = false)
    var exchangeRate: BigDecimal = BigDecimal("7.0"),

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
