package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.ShipmentItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ShipmentItemRepository : JpaRepository<ShipmentItem, Long> {

    fun findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipmentId: Long): List<ShipmentItem>

    fun findAllByPoIdAndDeletedAtIsNull(poId: Long): List<ShipmentItem>

    fun findAllByLogisticNumAndDeletedAtIsNull(logisticNum: String): List<ShipmentItem>
}
