package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.ReceiveDiffEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ReceiveDiffEventRepository : JpaRepository<ReceiveDiffEvent, Long> {
    fun findAllByDiffIdOrderByEventSeqAsc(diffId: Long): List<ReceiveDiffEvent>

    fun findAllByLogisticNumOrderByEventSeqAsc(logisticNum: String): List<ReceiveDiffEvent>

    @Query("SELECT COALESCE(MAX(e.eventSeq), 0) FROM ReceiveDiffEvent e WHERE e.diffId = :diffId")
    fun findMaxEventSeq(diffId: Long): Int
}
