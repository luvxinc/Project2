package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderRepository : JpaRepository<PurchaseOrder, Long>, JpaSpecificationExecutor<PurchaseOrder> {

    fun findByPoNumAndDeletedAtIsNull(poNum: String): PurchaseOrder?

    fun findByIdAndDeletedAtIsNull(id: Long): PurchaseOrder?

    fun findAllByDeletedAtIsNullOrderByPoDateDesc(): List<PurchaseOrder>

    fun findAllBySupplierIdAndDeletedAtIsNullOrderByPoDateDesc(supplierId: Long): List<PurchaseOrder>

    fun existsByPoNumAndDeletedAtIsNull(poNum: String): Boolean

    fun countByDeletedAtIsNull(): Long
}
