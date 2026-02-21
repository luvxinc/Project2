package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.ShipmentItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository
import java.math.BigDecimal

@Repository
interface ShipmentItemRepository : JpaRepository<ShipmentItem, Long> {

    fun findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipmentId: Long): List<ShipmentItem>

    fun findAllByPoIdAndDeletedAtIsNull(poId: Long): List<ShipmentItem>

    fun findAllByLogisticNumAndDeletedAtIsNull(logisticNum: String): List<ShipmentItem>

    @Query("SELECT COUNT(i) FROM ShipmentItem i WHERE i.shipmentId = :shipmentId AND i.deletedAt IS NULL")
    fun countByShipmentId(shipmentId: Long): Int

    @Query("SELECT SUM(i.quantity * i.unitPrice) FROM ShipmentItem i WHERE i.shipmentId = :shipmentId AND i.deletedAt IS NULL")
    fun sumValueByShipmentId(shipmentId: Long): BigDecimal?

    @Query("SELECT i FROM ShipmentItem i WHERE i.poId = :poId AND i.sku = :sku AND i.deletedAt IS NULL")
    fun findAllByPoIdAndSkuAndDeletedAtIsNull(poId: Long, sku: String): List<ShipmentItem>

    /** V1 parity: total sent for (poNum, sku) across ALL shipments */
    @Query("SELECT COALESCE(SUM(i.quantity), 0) FROM ShipmentItem i WHERE i.poNum = :poNum AND i.sku = :sku AND i.deletedAt IS NULL")
    fun sumSentByPoNumAndSku(poNum: String, sku: String): Int
}
