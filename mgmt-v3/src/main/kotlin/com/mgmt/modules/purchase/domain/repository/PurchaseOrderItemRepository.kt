package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderItemRepository : JpaRepository<PurchaseOrderItem, Long> {

    fun findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(poId: Long): List<PurchaseOrderItem>

    fun findAllByPoNumAndDeletedAtIsNull(poNum: String): List<PurchaseOrderItem>

    fun findAllBySkuAndDeletedAtIsNull(sku: String): List<PurchaseOrderItem>

    fun deleteAllByPoId(poId: Long)
}
