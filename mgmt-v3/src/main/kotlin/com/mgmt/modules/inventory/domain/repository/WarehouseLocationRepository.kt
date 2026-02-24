package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.WarehouseLocation
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface WarehouseLocationRepository : JpaRepository<WarehouseLocation, Long>, JpaSpecificationExecutor<WarehouseLocation> {

    fun findByBarcode(barcode: String): WarehouseLocation?

    fun findAllByWarehouse(warehouse: String): List<WarehouseLocation>

    fun existsByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(
        warehouse: String, aisle: String, bay: Int, level: String, bin: String, slot: String,
    ): Boolean

    @Modifying
    @Query("DELETE FROM WarehouseLocation w WHERE w.warehouse = :warehouse")
    fun deleteAllByWarehouse(@Param("warehouse") warehouse: String): Int

    @Query("SELECT DISTINCT w.warehouse FROM WarehouseLocation w ORDER BY w.warehouse")
    fun findDistinctWarehouseNames(): List<String>

    fun existsByWarehouse(warehouse: String): Boolean

    fun countByWarehouse(warehouse: String): Long
}
