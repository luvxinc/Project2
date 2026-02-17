package com.mgmt.modules.products.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * Product entity — aggregate root for Products module.
 *
 * V3 DDD: domain/model layer — maps to 'products' table.
 * V3 architecture §8.1: includes created_by/updated_by audit fields.
 */
@Entity
@Table(name = "products")
class Product(
    @Id
    @Column(length = 36)
    var id: String = "",

    @Column(unique = true, nullable = false)
    var sku: String = "",

    var name: String? = null,
    var category: String? = null,
    var subcategory: String? = null,
    var type: String? = null,

    @Column(precision = 10, scale = 2, nullable = false)
    var cost: BigDecimal = BigDecimal.ZERO,

    @Column(precision = 10, scale = 2, nullable = false)
    var freight: BigDecimal = BigDecimal.ZERO,

    @Column(precision = 10, scale = 2, nullable = false)
    var cogs: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false)
    var weight: Int = 0,

    var upc: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: ProductStatus = ProductStatus.ACTIVE,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,

    // §8.1 audit fields
    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,
)

enum class ProductStatus {
    ACTIVE, INACTIVE
}
