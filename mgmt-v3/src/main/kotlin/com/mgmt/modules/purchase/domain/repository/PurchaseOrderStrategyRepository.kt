package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderStrategyRepository : JpaRepository<PurchaseOrderStrategy, Long> {

    fun findByPoId(poId: Long): PurchaseOrderStrategy?

    fun findByPoNum(poNum: String): PurchaseOrderStrategy?

    /** Find latest strategy version for a PO (highest strategySeq). */
    fun findFirstByPoNumOrderByStrategySeqDesc(poNum: String): PurchaseOrderStrategy?

    /** Find all strategy versions for a PO, ordered by strategySeq ASC (for history). */
    fun findAllByPoNumOrderByStrategySeqAsc(poNum: String): List<PurchaseOrderStrategy>

    /** Batch-load strategies for multiple PO numbers (N+1 fix). */
    fun findAllByPoNumIn(poNums: Collection<String>): List<PurchaseOrderStrategy>
}
