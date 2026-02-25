package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderItemRepository : JpaRepository<PurchaseOrderItem, Long> {

    fun findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(poId: Long): List<PurchaseOrderItem>

    /** Batch-load items for multiple POs (N+1 fix). */
    fun findAllByPoIdInAndDeletedAtIsNull(poIds: Collection<Long>): List<PurchaseOrderItem>

    fun findAllByPoNumAndDeletedAtIsNull(poNum: String): List<PurchaseOrderItem>

    fun findAllBySkuAndDeletedAtIsNull(sku: String): List<PurchaseOrderItem>

    fun deleteAllByPoId(poId: Long)

    @Query("SELECT DISTINCT p.sku FROM PurchaseOrderItem p WHERE p.deletedAt IS NULL ORDER BY p.sku")
    fun findDistinctSkus(): List<String>
}
