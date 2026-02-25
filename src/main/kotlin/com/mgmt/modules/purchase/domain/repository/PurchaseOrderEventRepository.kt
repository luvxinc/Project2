package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.PurchaseOrderEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface PurchaseOrderEventRepository : JpaRepository<PurchaseOrderEvent, Long> {

    fun findAllByPoIdOrderByEventSeqAsc(poId: Long): List<PurchaseOrderEvent>

    fun findAllByPoNumOrderByEventSeqAsc(poNum: String): List<PurchaseOrderEvent>

    @Query("SELECT COALESCE(MAX(e.eventSeq), 0) FROM PurchaseOrderEvent e WHERE e.poId = :poId")
    fun findMaxEventSeq(poId: Long): Int
}
