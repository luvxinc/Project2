package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.Receive
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface ReceiveRepository : JpaRepository<Receive, Long>, JpaSpecificationExecutor<Receive> {

    fun findByIdAndDeletedAtIsNull(id: Long): Receive?

    fun findAllByShipmentIdAndDeletedAtIsNull(shipmentId: Long): List<Receive>

    fun findAllByPoIdAndDeletedAtIsNull(poId: Long): List<Receive>

    fun findAllByDeletedAtIsNullOrderByReceiveDateDesc(): List<Receive>

    fun countByDeletedAtIsNull(): Long
}
