package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * WarehouseLocationInventory — real-time snapshot of what's at each warehouse position.
 *
 * Overwritten on each stocktake upload. Powers the 3D hover display
 * and the warehouse product list (SKU total + FIFO value).
 *
 * total_qty is a GENERATED ALWAYS AS (qty_per_box * num_of_box) STORED column — read-only in JPA.
 */
@Entity
@Table(name = "warehouse_location_inventory")
class WarehouseLocationInventory(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id", nullable = false)
    var location: WarehouseLocation? = null,

    @Column(name = "location_id", insertable = false, updatable = false)
    var locationId: Long = 0,

    @Column(name = "sku", length = 100, nullable = false)
    var sku: String = "",

    @Column(name = "qty_per_box", nullable = false)
    var qtyPerBox: Int = 0,

    @Column(name = "num_of_box", nullable = false)
    var numOfBox: Int = 0,

    // GENERATED column — read-only
    @Column(name = "total_qty", insertable = false, updatable = false)
    var totalQty: Int = 0,

    @Column(name = "last_stocktake_id")
    var lastStocktakeId: Long? = null,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,
)
