package com.mgmt.modules.products.domain.repository

import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.model.ProductStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

/**
 * ProductRepository — domain-layer repository interface.
 *
 * V3 DDD: domain/repository layer.
 * Enhanced with subcategory/type distinct queries for dropdown options.
 */
@Repository
interface ProductRepository : JpaRepository<Product, String>, JpaSpecificationExecutor<Product> {

    fun findBySkuAndDeletedAtIsNull(sku: String): Product?

    fun findByIdAndDeletedAtIsNull(id: String): Product?

    fun findAllByDeletedAtIsNullOrderBySkuAsc(): List<Product>

    fun findAllByDeletedAtIsNull(): List<Product>

    fun findAllByStatusAndDeletedAtIsNullOrderBySkuAsc(status: ProductStatus): List<Product>

    @Query("SELECT DISTINCT p.category FROM Product p WHERE p.deletedAt IS NULL AND p.category IS NOT NULL ORDER BY p.category")
    fun findDistinctCategories(): List<String>

    @Query("SELECT DISTINCT p.subcategory FROM Product p WHERE p.deletedAt IS NULL AND p.subcategory IS NOT NULL ORDER BY p.subcategory")
    fun findDistinctSubcategories(): List<String>

    @Query("SELECT DISTINCT p.type FROM Product p WHERE p.deletedAt IS NULL AND p.type IS NOT NULL ORDER BY p.type")
    fun findDistinctTypes(): List<String>

    /** Lightweight projection for category hierarchy — avoids loading full Product entities */
    @Query("SELECT p.category, p.subcategory, p.type FROM Product p WHERE p.deletedAt IS NULL AND p.category IS NOT NULL")
    fun findCategoryHierarchyTuples(): List<Array<String?>>

    fun countByDeletedAtIsNull(): Long

    fun existsBySkuAndDeletedAtIsNull(sku: String): Boolean

    /** Batch-load products by SKU list (N+1 fix for LandedPriceRecalcService) */
    fun findAllBySkuInAndDeletedAtIsNull(skus: Collection<String>): List<Product>
}
