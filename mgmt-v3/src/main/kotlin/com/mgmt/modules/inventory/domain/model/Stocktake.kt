package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate

/**
 * Stocktake — physical inventory count event.
 *
 * V1 source: Data_Inventory (25 date-columns wide table → normalised)
 * V3: Each stocktake_date is one row; items are in stocktake_items.
 */
@Entity
@Table(
    name = "stocktakes",
    uniqueConstraints = [UniqueConstraint(columnNames = ["stocktake_date"])]
)
class Stocktake(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "stocktake_date", nullable = false)
    var stocktakeDate: LocalDate = LocalDate.now(),

    @Column(columnDefinition = "text")
    var note: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,

    @OneToMany(mappedBy = "stocktake", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.EAGER)
    var items: MutableList<StocktakeItem> = mutableListOf(),
)
