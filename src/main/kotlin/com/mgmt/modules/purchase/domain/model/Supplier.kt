package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * Supplier entity — aggregate root for Supplier subdomain.
 *
 * V3 DDD: domain/model layer → maps to 'suppliers' table.
 * V1 source: in_supplier (Django Supplier model).
 */
@Entity
@Table(name = "suppliers")
class Supplier(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "supplier_code", length = 2, unique = true, nullable = false)
    var supplierCode: String = "",

    @Column(name = "supplier_name", length = 100, nullable = false)
    var supplierName: String = "",

    @Column(nullable = false)
    var status: Boolean = true,

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

    // Optimistic locking
    @Version
    @Column(nullable = false)
    var version: Int = 0,
)
