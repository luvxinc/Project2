package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.Shipment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface ShipmentRepository : JpaRepository<Shipment, Long>, JpaSpecificationExecutor<Shipment> {

    fun findByLogisticNumAndDeletedAtIsNull(logisticNum: String): Shipment?

    fun findByIdAndDeletedAtIsNull(id: Long): Shipment?

    fun findAllByDeletedAtIsNullOrderBySentDateDesc(): List<Shipment>

    fun existsByLogisticNumAndDeletedAtIsNull(logisticNum: String): Boolean

    fun countByDeletedAtIsNull(): Long
}
