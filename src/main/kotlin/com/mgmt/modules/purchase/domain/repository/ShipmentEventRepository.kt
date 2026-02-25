package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.ShipmentEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ShipmentEventRepository : JpaRepository<ShipmentEvent, Long> {
    fun findAllByShipmentIdOrderByEventSeqAsc(shipmentId: Long): List<ShipmentEvent>

    @Query("SELECT COALESCE(MAX(e.eventSeq), 0) FROM ShipmentEvent e WHERE e.shipmentId = :shipmentId")
    fun findMaxEventSeq(shipmentId: Long): Int
}
