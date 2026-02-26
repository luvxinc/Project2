package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * StocktakeLocationDetail — individual CSV row from a stocktake upload.
 *
 * Records the exact position (warehouse_location) and quantity breakdown
 * for each SKU found during a physical inventory count.
 *
 * total_qty is a GENERATED ALWAYS AS (qty_per_box * num_of_box) STORED column — read-only in JPA.
 */
@Entity
@Table(name = "stocktake_location_details")
class StocktakeLocationDetail(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stocktake_id", nullable = false)
    var stocktake: Stocktake? = null,

    @Column(name = "stocktake_id", insertable = false, updatable = false)
    var stocktakeId: Long = 0,

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

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
