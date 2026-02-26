package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.WarehouseLocationInventory
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface WarehouseLocationInventoryRepository : JpaRepository<WarehouseLocationInventory, Long> {

    fun findAllByLocationId(locationId: Long): List<WarehouseLocationInventory>

    fun findByLocationIdAndSku(locationId: Long, sku: String): WarehouseLocationInventory?

    @Query("SELECT wli FROM WarehouseLocationInventory wli WHERE wli.location.warehouse = :warehouse")
    fun findAllByWarehouse(@Param("warehouse") warehouse: String): List<WarehouseLocationInventory>

    @Query("""
        SELECT DISTINCT wli.sku, SUM(wli.qtyPerBox * wli.numOfBox) AS totalQty 
        FROM WarehouseLocationInventory wli 
        WHERE wli.location.warehouse = :warehouse 
        GROUP BY wli.sku ORDER BY wli.sku
    """)
    fun findSkuSummaryByWarehouse(@Param("warehouse") warehouse: String): List<Array<Any>>

    @Modifying
    @Query("DELETE FROM WarehouseLocationInventory wli WHERE wli.location.warehouse = :warehouse")
    fun deleteAllByWarehouse(@Param("warehouse") warehouse: String): Int

    @Query("SELECT COUNT(wli) > 0 FROM WarehouseLocationInventory wli WHERE wli.locationId = :locationId")
    fun existsByLocationId(@Param("locationId") locationId: Long): Boolean
}
