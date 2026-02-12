package com.mgmt.domain.product

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ProductRepository : JpaRepository<Product, String>, JpaSpecificationExecutor<Product> {

    fun findBySkuAndDeletedAtIsNull(sku: String): Product?

    fun findByIdAndDeletedAtIsNull(id: String): Product?

    fun findAllByDeletedAtIsNullOrderBySkuAsc(): List<Product>

    fun findAllByStatusAndDeletedAtIsNullOrderBySkuAsc(status: ProductStatus): List<Product>

    @Query("SELECT DISTINCT p.category FROM Product p WHERE p.deletedAt IS NULL AND p.category IS NOT NULL ORDER BY p.category")
    fun findDistinctCategories(): List<String>

    fun countByDeletedAtIsNull(): Long
}
