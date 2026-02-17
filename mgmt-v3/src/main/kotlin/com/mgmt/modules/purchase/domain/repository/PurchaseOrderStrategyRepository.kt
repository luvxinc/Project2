package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderStrategyRepository : JpaRepository<PurchaseOrderStrategy, Long> {

    fun findByPoId(poId: Long): PurchaseOrderStrategy?

    fun findByPoNum(poNum: String): PurchaseOrderStrategy?
}
