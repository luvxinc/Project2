package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.WarehouseLocation
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface WarehouseLocationRepository : JpaRepository<WarehouseLocation, Long>, JpaSpecificationExecutor<WarehouseLocation> {

    fun findByBarcode(barcode: String): WarehouseLocation?

    fun findAllByWarehouse(warehouse: String): List<WarehouseLocation>

    fun existsByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(
        warehouse: String, aisle: String, bay: Int, level: String, bin: String, slot: String,
    ): Boolean
}
