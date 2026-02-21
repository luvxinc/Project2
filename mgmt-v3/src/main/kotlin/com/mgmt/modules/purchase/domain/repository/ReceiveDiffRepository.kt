package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ReceiveDiffRepository : JpaRepository<ReceiveDiff, Long> {

    fun findAllByReceiveId(receiveId: Long): List<ReceiveDiff>

    fun findAllByStatus(status: String): List<ReceiveDiff>

    fun findAllByLogisticNum(logisticNum: String): List<ReceiveDiff>

    fun findAllByReceiveIdIn(receiveIds: List<Long>): List<ReceiveDiff>

    fun countByStatus(status: String): Long
}

