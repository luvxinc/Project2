package com.mgmt.modules.inventory.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.domain.repository.WarehouseLocationInventoryRepository
import com.mgmt.modules.inventory.domain.repository.WarehouseLocationRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * WarehouseInventoryUseCase — queries for warehouse-level inventory views.
 *
 * Powers:
 *  1. 3D Hover: position → SKU + qty mapping (WarehouseInventoryResponse)
 *  2. Product List: warehouse-wide SKU totals + FIFO value (WarehouseProductListResponse)
 *
 * Data source: warehouse_location_inventory (real-time snapshot from latest stocktake).
 * FIFO value: from fifo_layers materialized view (mv_dynamic_inventory).
 */
@Service
class WarehouseInventoryUseCase(
    private val locationRepo: WarehouseLocationRepository,
    private val inventoryRepo: WarehouseLocationInventoryRepository,
    private val em: jakarta.persistence.EntityManager,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Get inventory map for 3D hover display.
     * Returns all locations in the warehouse with their current products.
     */
    @Transactional(readOnly = true)
    fun getWarehouseInventory(warehouse: String): WarehouseInventoryResponse {
        val whName = warehouse.trim().uppercase()
        if (!locationRepo.existsByWarehouse(whName)) {
            throw NotFoundException("inventory.errors.warehouseNotFound")
        }

        val allLocations = locationRepo.findAllByWarehouse(whName)
        val allInventory = inventoryRepo.findAllByWarehouse(whName)

        // Group inventory by location_id
        val inventoryByLocation = allInventory.groupBy { it.locationId }

        val locationItems = allLocations.map { loc ->
            val items = inventoryByLocation[loc.id]?.map { inv ->
                LocationSkuItem(
                    sku = inv.sku,
                    qtyPerBox = inv.qtyPerBox,
                    boxPerCtn = inv.boxPerCtn,
                    numOfCtn = inv.numOfCtn,
                    totalQty = inv.qtyPerBox * inv.boxPerCtn * inv.numOfCtn, // manual calc since generated col read after flush
                )
            } ?: emptyList()

            LocationInventoryItem(
                locationId = loc.id,
                aisle = loc.aisle,
                bay = loc.bay,
                level = loc.level,
                bin = loc.bin,
                slot = loc.slot,
                barcode = loc.barcode,
                items = items,
            )
        }

        return WarehouseInventoryResponse(
            warehouse = whName,
            locations = locationItems,
            totalLocations = allLocations.size,
            occupiedLocations = locationItems.count { it.items.isNotEmpty() },
        )
    }

    /**
     * Get product list for warehouse main page bottom section.
     * Aggregates all SKUs across all locations in the warehouse.
     * Value is calculated using FIFO cost from fifo_layers.
     */
    @Transactional(readOnly = true)
    fun getWarehouseProducts(warehouse: String): WarehouseProductListResponse {
        val whName = warehouse.trim().uppercase()
        if (!locationRepo.existsByWarehouse(whName)) {
            throw NotFoundException("inventory.errors.warehouseNotFound")
        }

        val allInventory = inventoryRepo.findAllByWarehouse(whName)

        // Aggregate by SKU
        val skuAgg = allInventory.groupBy { it.sku }.map { (sku, items) ->
            val totalQty = items.sumOf { it.qtyPerBox * it.boxPerCtn * it.numOfCtn }
            sku to totalQty
        }

        // Fetch FIFO costs
        val costMap = fetchFifoCosts(skuAgg.map { it.first })

        val products = skuAgg
            .filter { it.second > 0 }  // Exclude SKUs with zero quantity
            .map { (sku, totalQty) ->
            val fifoCost = costMap[sku] ?: BigDecimal.ZERO
            val totalValue = fifoCost.multiply(BigDecimal(totalQty)).setScale(2, RoundingMode.HALF_UP)

            WarehouseProductSummary(
                sku = sku,
                totalQty = totalQty,
                fifoCost = fifoCost,
                totalValue = totalValue,
            )
        }.sortedBy { it.sku }

        val totalQuantity = products.sumOf { it.totalQty }
        val totalValue = products.fold(BigDecimal.ZERO) { acc, p -> acc.add(p.totalValue) }

        return WarehouseProductListResponse(
            warehouse = whName,
            products = products,
            totalSkus = products.size,
            totalQuantity = totalQuantity,
            totalValue = totalValue,
        )
    }

    /**
     * Fetch FIFO average costs directly from fifo_layers table (real-time).
     * Avoids dependency on mv_dynamic_inventory materialized view which may be stale.
     */
    private fun fetchFifoCosts(skus: List<String>): Map<String, BigDecimal> {
        if (skus.isEmpty()) return emptyMap()

        try {
            @Suppress("UNCHECKED_CAST")
            val results = em.createNativeQuery("""
                SELECT sku,
                  CASE WHEN SUM(qty_remaining) > 0
                    THEN SUM(qty_remaining::numeric * COALESCE(landed_cost, unit_cost)) / SUM(qty_remaining)
                    ELSE 0
                  END AS avg_cost
                FROM fifo_layers
                WHERE sku IN :skus AND qty_remaining > 0
                GROUP BY sku
            """).setParameter("skus", skus)
                .resultList as List<Array<Any>>

            return results.associate { row ->
                val sku = row[0] as String
                val cost = when (val v = row[1]) {
                    is BigDecimal -> v
                    is Number -> BigDecimal.valueOf(v.toDouble())
                    else -> BigDecimal.ZERO
                }
                sku to cost.setScale(5, RoundingMode.HALF_UP)
            }
        } catch (e: Exception) {
            log.warn("Failed to fetch FIFO costs: {}", e.message)
            return emptyMap()
        }
    }
}
