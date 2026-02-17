package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * StocktakeItem — individual SKU count within a stocktake.
 *
 * Unique on (stocktake_id, sku). CASCADE DELETE from parent Stocktake.
 */
@Entity
@Table(
    name = "stocktake_items",
    uniqueConstraints = [UniqueConstraint(columnNames = ["stocktake_id", "sku"])]
)
class StocktakeItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stocktake_id", nullable = false)
    var stocktake: Stocktake? = null,

    @Column(name = "stocktake_id", insertable = false, updatable = false)
    var stocktakeId: Long = 0,

    @Column(name = "sku", length = 100, nullable = false)
    var sku: String = "",

    @Column(name = "counted_qty", nullable = false)
    var countedQty: Int = 0,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
