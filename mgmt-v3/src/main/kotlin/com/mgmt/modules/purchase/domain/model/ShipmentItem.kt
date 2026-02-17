package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * ShipmentItem — per-SKU line item within a shipment.
 *
 * V1 source: in_send_list + in_send_final merged.
 * Tracks which PO each item belongs to.
 */
@Entity
@Table(
    name = "shipment_items",
    uniqueConstraints = [UniqueConstraint(columnNames = ["shipment_id", "po_id", "sku", "unit_price"])]
)
class ShipmentItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "shipment_id", nullable = false)
    var shipmentId: Long = 0,

    @Column(name = "logistic_num", length = 50, nullable = false)
    var logisticNum: String = "",

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

    @Column(name = "po_change", nullable = false)
    var poChange: Boolean = false,  // whether PO was also modified

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
