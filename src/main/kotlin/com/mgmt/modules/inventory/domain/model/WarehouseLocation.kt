package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * WarehouseLocation — physical warehouse bin/slot address.
 *
 * barcode is a GENERATED ALWAYS AS stored column — NOT mapped to JPA (read-only).
 */
@Entity
@Table(
    name = "warehouse_locations",
    uniqueConstraints = [UniqueConstraint(columnNames = ["warehouse", "aisle", "bay", "level", "bin", "slot"])]
)
class WarehouseLocation(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "warehouse", length = 20, nullable = false)
    var warehouse: String = "",

    @Column(name = "aisle", length = 10, nullable = false)
    var aisle: String = "",

    @Column(name = "bay", nullable = false)
    var bay: Int = 0,

    @Column(name = "level", length = 10, nullable = false)
    var level: String = "",

    @Column(name = "bin", length = 10, nullable = false)
    var bin: String = "",

    @Column(name = "slot", length = 10, nullable = false)
    var slot: String = "",

    // Generated column — read-only in JPA
    @Column(name = "barcode", length = 50, insertable = false, updatable = false)
    var barcode: String? = null,

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
