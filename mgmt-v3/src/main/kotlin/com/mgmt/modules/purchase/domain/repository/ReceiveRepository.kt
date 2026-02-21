package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.Receive
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface ReceiveRepository : JpaRepository<Receive, Long>, JpaSpecificationExecutor<Receive> {

    fun findByIdAndDeletedAtIsNull(id: Long): Receive?

    fun findAllByShipmentIdAndDeletedAtIsNull(shipmentId: Long): List<Receive>

    fun findAllByShipmentIdOrderBySkuAsc(shipmentId: Long): List<Receive>

    fun findAllByPoIdAndDeletedAtIsNull(poId: Long): List<Receive>

    fun findAllByDeletedAtIsNullOrderByReceiveDateDesc(): List<Receive>

    fun findAllByLogisticNumOrderBySkuAsc(logisticNum: String): List<Receive>

    fun findByLogisticNumAndDeletedAtIsNull(logisticNum: String): List<Receive>

    @Query("SELECT COALESCE(SUM(r.receiveQuantity), 0) FROM Receive r WHERE r.logisticNum = :logisticNum AND r.deletedAt IS NULL")
    fun sumReceiveQuantityByLogisticNum(@Param("logisticNum") logisticNum: String): Int

    @Query("SELECT DISTINCT r.logisticNum FROM Receive r ORDER BY r.logisticNum")
    fun findDistinctLogisticNums(): List<String>

    fun countByDeletedAtIsNull(): Long
}

