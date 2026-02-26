package com.mgmt.modules.inventory.application.usecase

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.common.exception.BadRequestException
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.domain.model.Stocktake
import com.mgmt.modules.inventory.domain.model.StocktakeEvent
import com.mgmt.modules.inventory.domain.model.StocktakeItem
import com.mgmt.modules.inventory.domain.model.StocktakeLocationDetail
import com.mgmt.modules.inventory.domain.model.WarehouseLocationInventory
import com.mgmt.modules.inventory.domain.repository.*
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * StocktakeUseCase — physical inventory count lifecycle.
 *
 * Business rules:
 *  - stocktake_date is UNIQUE (one count per date)
 *  - items are (stocktake_id, sku) UNIQUE
 *  - locationDetails are (stocktake_id, location_id, sku) UNIQUE
 *  - CASCADE DELETE: deleting a stocktake removes all items + location details
 *  - On upload: SKU aggregation (sum qty per SKU) for stocktake_items
 *  - On upload: location details written to stocktake_location_details
 *  - On upload: warehouse_location_inventory snapshot refreshed
 *  - On upload: stocktake_event recorded
 */
@Service
class StocktakeUseCase(
    private val stocktakeRepo: StocktakeRepository,
    private val itemRepo: StocktakeItemRepository,
    private val locationDetailRepo: StocktakeLocationDetailRepository,
    private val locationInventoryRepo: WarehouseLocationInventoryRepository,
    private val locationRepo: WarehouseLocationRepository,
    private val eventRepo: StocktakeEventRepository,
    private val em: EntityManager,
    private val objectMapper: ObjectMapper,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(): List<Stocktake> = stocktakeRepo.findAllByOrderByStocktakeDateDesc()

    @Transactional(readOnly = true)
    fun findOne(id: Long): Stocktake =
        stocktakeRepo.findById(id).orElseThrow {
            NotFoundException("inventory.errors.stocktakeNotFound")
        }

    @Transactional(readOnly = true)
    fun findByDate(date: java.time.LocalDate): Stocktake? =
        stocktakeRepo.findByStocktakeDate(date)

    @Transactional(readOnly = true)
    fun findLocationDetails(stocktakeId: Long): List<StocktakeLocationDetail> {
        findOne(stocktakeId) // validate existence
        return locationDetailRepo.findAllByStocktakeIdWithLocation(stocktakeId)
    }

    @Transactional(readOnly = true)
    fun findEvents(stocktakeId: Long): List<StocktakeEvent> {
        findOne(stocktakeId) // validate existence
        return eventRepo.findAllByStocktakeIdOrderByCreatedAtDesc(stocktakeId)
    }

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreateStocktakeRequest, username: String): Stocktake {
        if (stocktakeRepo.existsByStocktakeDate(dto.stocktakeDate)) {
            throw ConflictException("inventory.errors.stocktakeDateExists")
        }

        val stocktake = Stocktake(
            stocktakeDate = dto.stocktakeDate,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )

        // Add aggregated items (SKU → sum of qty)
        dto.items.forEach { itemDto ->
            val item = StocktakeItem(
                stocktake = stocktake,
                sku = itemDto.sku.trim().uppercase(),
                countedQty = itemDto.countedQty,
            )
            stocktake.items.add(item)
        }

        val saved = stocktakeRepo.save(stocktake)

        // Process location details if provided (new CSV format)
        dto.locationDetails?.let { details ->
            processLocationDetails(saved, details, username)
        }

        // Record event
        recordEvent(saved.id, "UPLOAD", username,
            summary = "Uploaded ${dto.items.size} SKUs" +
                    (dto.locationDetails?.let { ", ${it.size} location entries" } ?: ""),
            newData = mapOf(
                "items" to dto.items.map { mapOf("sku" to it.sku, "countedQty" to it.countedQty) },
                "locationDetails" to (dto.locationDetails?.size ?: 0),
            )
        )

        return saved
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdateStocktakeRequest, username: String): Stocktake {
        val stocktake = findOne(id)

        // Capture old state for event
        val oldItems = stocktake.items.map { mapOf("sku" to it.sku, "countedQty" to it.countedQty) }

        dto.note?.let { stocktake.note = it }

        dto.items?.let { newItems ->
            // JPQL delete + clear L1 cache to avoid stale entity conflict
            itemRepo.deleteAllByStocktakeId(stocktake.id)
            em.flush()
            em.clear()

            // Re-fetch the parent after cache clear
            val fresh = findOne(id)
            fresh.note = dto.note ?: fresh.note

            newItems.forEach { itemDto ->
                val item = StocktakeItem(
                    stocktake = fresh,
                    sku = itemDto.sku.trim().uppercase(),
                    countedQty = itemDto.countedQty,
                )
                fresh.items.add(item)
            }

            // Process location details if provided
            dto.locationDetails?.let { details ->
                locationDetailRepo.deleteAllByStocktakeId(fresh.id)
                em.flush()
                processLocationDetails(fresh, details, username)
            }

            fresh.updatedAt = Instant.now()
            fresh.updatedBy = username

            // Record event
            recordEvent(fresh.id, "UPDATE_ITEMS", username,
                summary = "Updated to ${newItems.size} SKUs",
                oldData = mapOf("items" to oldItems),
                newData = mapOf("items" to newItems.map { mapOf("sku" to it.sku, "countedQty" to it.countedQty) }),
            )

            return stocktakeRepo.save(fresh)
        }

        stocktake.updatedAt = Instant.now()
        stocktake.updatedBy = username

        // Note-only update event
        if (dto.note != null) {
            recordEvent(stocktake.id, "UPDATE_NOTE", username,
                summary = "Note updated",
            )
        }

        return stocktakeRepo.save(stocktake)
    }

    // ═══════════ Single-Record Operations (History Page) ═══════════

    @Transactional
    fun updateLocationDetail(stocktakeId: Long, detailId: Long, dto: UpdateLocationDetailRequest, username: String): StocktakeLocationDetail {
        val stocktake = findOne(stocktakeId)
        val detail = locationDetailRepo.findById(detailId).orElseThrow {
            NotFoundException("inventory.errors.locationDetailNotFound")
        }
        require(detail.stocktakeId == stocktakeId) { "Detail does not belong to this stocktake" }

        val oldData = mapOf("sku" to detail.sku, "qtyPerBox" to detail.qtyPerBox, "numOfBox" to detail.numOfBox)

        // Update fields
        dto.qtyPerBox?.let { detail.qtyPerBox = it }
        dto.numOfBox?.let { detail.numOfBox = it }

        // If location fields changed, resolve new location
        if (dto.warehouse != null || dto.aisle != null || dto.bay != null || dto.level != null || dto.bin != null || dto.slot != null) {
            val wh = (dto.warehouse ?: detail.location!!.warehouse).trim().uppercase()
            val aisle = (dto.aisle ?: detail.location!!.aisle).trim().uppercase()
            val bay = dto.bay ?: detail.location!!.bay
            val level = (dto.level ?: detail.location!!.level).trim().uppercase()
            val bin = (dto.bin ?: detail.location!!.bin).trim().uppercase()
            val slot = (dto.slot ?: detail.location!!.slot).trim().uppercase()

            val newLoc = locationRepo.findByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(wh, aisle, bay, level, bin, slot)
                ?: throw BadRequestException("inventory.errors.locationNotFound")
            detail.location = newLoc
        }

        detail.updatedAt = Instant.now()
        val saved = locationDetailRepo.save(detail)

        // Re-aggregate items
        reAggregateItems(stocktake, username)

        recordEvent(stocktakeId, "UPDATE_DETAIL", username,
            summary = "Updated location detail for ${detail.sku}",
            oldData = oldData,
            newData = mapOf("sku" to detail.sku, "qtyPerBox" to detail.qtyPerBox, "numOfBox" to detail.numOfBox),
        )

        return saved
    }

    @Transactional
    fun deleteLocationDetail(stocktakeId: Long, detailId: Long, username: String) {
        val stocktake = findOne(stocktakeId)
        val detail = locationDetailRepo.findById(detailId).orElseThrow {
            NotFoundException("inventory.errors.locationDetailNotFound")
        }
        require(detail.stocktakeId == stocktakeId) { "Detail does not belong to this stocktake" }

        recordEvent(stocktakeId, "DELETE_DETAIL", username,
            summary = "Deleted location detail for ${detail.sku}",
            oldData = mapOf("sku" to detail.sku, "qtyPerBox" to detail.qtyPerBox, "numOfBox" to detail.numOfBox),
        )

        locationDetailRepo.delete(detail)
        em.flush()

        // Re-aggregate items
        reAggregateItems(stocktake, username)
    }

    @Transactional
    fun addLocationDetail(stocktakeId: Long, dto: AddLocationDetailRequest, username: String): StocktakeLocationDetail {
        val stocktake = findOne(stocktakeId)

        val wh = dto.warehouse.trim().uppercase()
        val aisle = dto.aisle.trim().uppercase()
        val level = dto.level.trim().uppercase()
        val bin = dto.bin.trim().uppercase()
        val slot = dto.slot.trim().uppercase()

        val location = locationRepo.findByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(wh, aisle, dto.bay, level, bin, slot)
            ?: throw BadRequestException("inventory.errors.locationNotFound")

        val detail = StocktakeLocationDetail(
            stocktake = stocktake,
            location = location,
            sku = dto.sku.trim().uppercase(),
            qtyPerBox = dto.qtyPerBox,
            numOfBox = dto.numOfBox,
        )
        val saved = locationDetailRepo.save(detail)
        em.flush()

        // Re-aggregate items
        reAggregateItems(stocktake, username)

        recordEvent(stocktakeId, "ADD_DETAIL", username,
            summary = "Added location detail for ${dto.sku}",
            newData = mapOf("sku" to dto.sku, "qtyPerBox" to dto.qtyPerBox, "numOfBox" to dto.numOfBox, "warehouse" to wh),
        )

        return saved
    }

    // ─── Legacy item single-record operations ───

    @Transactional
    fun updateStocktakeItem(stocktakeId: Long, itemId: Long, dto: UpdateStocktakeItemRequest, username: String): StocktakeItem {
        val stocktake = findOne(stocktakeId)
        val item = stocktake.items.find { it.id == itemId }
            ?: throw NotFoundException("inventory.errors.stocktakeItemNotFound")

        val oldQty = item.countedQty
        item.countedQty = dto.countedQty
        stocktake.updatedAt = Instant.now()
        stocktake.updatedBy = username
        stocktakeRepo.save(stocktake)

        recordEvent(stocktakeId, "UPDATE_ITEM", username,
            summary = "Updated ${item.sku}: $oldQty → ${dto.countedQty}",
            oldData = mapOf("sku" to item.sku, "countedQty" to oldQty),
            newData = mapOf("sku" to item.sku, "countedQty" to dto.countedQty),
        )

        return item
    }

    @Transactional
    fun deleteStocktakeItem(stocktakeId: Long, itemId: Long, username: String) {
        val stocktake = findOne(stocktakeId)
        val item = stocktake.items.find { it.id == itemId }
            ?: throw NotFoundException("inventory.errors.stocktakeItemNotFound")

        recordEvent(stocktakeId, "DELETE_ITEM", username,
            summary = "Deleted ${item.sku} (qty: ${item.countedQty})",
            oldData = mapOf("sku" to item.sku, "countedQty" to item.countedQty),
        )

        stocktake.items.remove(item)
        itemRepo.delete(item)
        stocktake.updatedAt = Instant.now()
        stocktake.updatedBy = username
        stocktakeRepo.save(stocktake)
    }

    @Transactional
    fun addStocktakeItem(stocktakeId: Long, dto: AddStocktakeItemRequest, username: String): StocktakeItem {
        val stocktake = findOne(stocktakeId)
        val sku = dto.sku.trim().uppercase()

        // Check duplicate
        val existing = stocktake.items.find { it.sku == sku }
        if (existing != null) {
            throw ConflictException("inventory.errors.skuAlreadyExists")
        }

        val item = StocktakeItem(
            stocktake = stocktake,
            sku = sku,
            countedQty = dto.countedQty,
        )
        stocktake.items.add(item)
        stocktake.updatedAt = Instant.now()
        stocktake.updatedBy = username
        stocktakeRepo.save(stocktake)

        recordEvent(stocktakeId, "ADD_ITEM", username,
            summary = "Added $sku (qty: ${dto.countedQty})",
            newData = mapOf("sku" to sku, "countedQty" to dto.countedQty),
        )

        return item
    }

    /**
     * Re-aggregate stocktake_items from location_details.
     * Called after any single-record location detail operation.
     */
    private fun reAggregateItems(stocktake: Stocktake, username: String) {
        val details = locationDetailRepo.findAllByStocktakeId(stocktake.id)
        val skuTotals = details.groupBy { it.sku }.mapValues { (_, items) -> items.sumOf { it.qtyPerBox * it.numOfBox } }

        // Clear and rebuild items
        itemRepo.deleteAllByStocktakeId(stocktake.id)
        em.flush()
        em.clear()

        val fresh = findOne(stocktake.id)
        skuTotals.forEach { (sku, total) ->
            val item = StocktakeItem(stocktake = fresh, sku = sku, countedQty = total)
            fresh.items.add(item)
        }
        fresh.updatedAt = Instant.now()
        fresh.updatedBy = username
        stocktakeRepo.save(fresh)
    }

    // ═══════════ Delete ═══════════

    @Transactional
    fun delete(id: Long, username: String? = null) {
        val stocktake = findOne(id)

        // Record event before deletion
        recordEvent(stocktake.id, "DELETE", username,
            summary = "Deleted stocktake ${stocktake.stocktakeDate}",
            oldData = mapOf(
                "stocktakeDate" to stocktake.stocktakeDate.toString(),
                "itemCount" to stocktake.items.size,
            ),
        )

        // Clean up location inventory snapshot for affected locations
        val details = locationDetailRepo.findAllByStocktakeId(stocktake.id)
        val affectedLocationIds = details.map { it.locationId }.distinct()
        affectedLocationIds.forEach { locId ->
            resetLocationInventory(locId)
        }

        stocktakeRepo.delete(stocktake) // CASCADE deletes items + location details
    }

    // ═══════════ Location Detail Processing ═══════════

    private fun processLocationDetails(
        stocktake: Stocktake,
        details: List<CreateStocktakeLocationDetailRequest>,
        username: String,
    ) {
        val affectedLocationIds = mutableSetOf<Long>()
        val affectedWarehouses = mutableSetOf<String>()

        for (detail in details) {
            // Resolve warehouse location
            val warehouse = detail.warehouse.trim().uppercase()
            val aisle = detail.aisle.trim().uppercase()
            val level = detail.level.trim().uppercase()
            val bin = detail.bin.trim().uppercase()
            val slot = detail.slot.trim().uppercase()

            var location = locationRepo.findByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(
                warehouse, aisle, detail.bay, level, bin, slot
            )
            // Fallback: if slot is empty and exact match fails, find first slot under this bin
            if (location == null && slot.isEmpty()) {
                location = locationRepo.findByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(
                    warehouse, aisle, detail.bay, level, bin, "L"
                ) ?: locationRepo.findByWarehouseAndAisleAndBayAndLevelAndBinAndSlot(
                    warehouse, aisle, detail.bay, level, bin, "R"
                )
            }
            if (location == null) {
                throw BadRequestException("inventory.errors.locationNotFound")
            }

            val locationDetail = StocktakeLocationDetail(
                stocktake = stocktake,
                location = location,
                sku = detail.sku.trim().uppercase(),
                qtyPerBox = detail.qtyPerBox,
                numOfBox = detail.numOfBox,
            )
            locationDetailRepo.save(locationDetail)

            affectedLocationIds.add(location.id)
            affectedWarehouses.add(warehouse)
        }

        // Refresh warehouse_location_inventory for affected warehouses
        for (warehouse in affectedWarehouses) {
            refreshWarehouseInventory(stocktake, warehouse, username)
        }

        log.info("Processed {} location details for stocktake {}, affecting {} locations in {} warehouses",
            details.size, stocktake.id, affectedLocationIds.size, affectedWarehouses.size)
    }

    private fun refreshWarehouseInventory(stocktake: Stocktake, warehouse: String, username: String) {
        // Delete existing inventory for this warehouse
        locationInventoryRepo.deleteAllByWarehouse(warehouse)
        em.flush()

        // Use native SQL to copy from stocktake_location_details → warehouse_location_inventory
        // This avoids JPA lazy-loading issues with the location reference
        val inserted = em.createNativeQuery("""
            INSERT INTO warehouse_location_inventory (location_id, sku, qty_per_box, num_of_box, last_stocktake_id, updated_by, updated_at)
            SELECT sld.location_id, sld.sku, sld.qty_per_box, sld.num_of_box, :stocktakeId, :username, NOW()
            FROM stocktake_location_details sld
            JOIN warehouse_locations wl ON sld.location_id = wl.id
            WHERE sld.stocktake_id = :stocktakeId AND wl.warehouse = :warehouse
        """)
            .setParameter("stocktakeId", stocktake.id)
            .setParameter("username", username)
            .setParameter("warehouse", warehouse)
            .executeUpdate()

        // Mark affected locations as having inventory
        em.createNativeQuery("""
            UPDATE warehouse_locations SET has_inventory = true
            WHERE warehouse = :warehouse
              AND id IN (
                SELECT DISTINCT sld.location_id FROM stocktake_location_details sld
                WHERE sld.stocktake_id = :stocktakeId
              )
        """)
            .setParameter("warehouse", warehouse)
            .setParameter("stocktakeId", stocktake.id)
            .executeUpdate()

        em.flush()

        log.info("Refreshed warehouse inventory for {}: {} records inserted", warehouse, inserted)
    }

    private fun resetLocationInventory(locationId: Long) {
        // Check if this location still has inventory from other stocktakes
        val hasOtherInventory = locationInventoryRepo.existsByLocationId(locationId)
        if (!hasOtherInventory) {
            val location = locationRepo.findById(locationId).orElse(null) ?: return
            location.hasInventory = false
            locationRepo.save(location)
        }
    }

    // ═══════════ Event Recording ═══════════

    private fun recordEvent(
        stocktakeId: Long,
        eventType: String,
        username: String?,
        summary: String? = null,
        oldData: Map<String, Any?>? = null,
        newData: Map<String, Any?>? = null,
    ) {
        val event = StocktakeEvent(
            stocktakeId = stocktakeId,
            eventType = eventType,
            summary = summary,
            oldData = oldData?.let { objectMapper.writeValueAsString(it) },
            newData = newData?.let { objectMapper.writeValueAsString(it) },
            createdBy = username,
        )
        eventRepo.save(event)
    }
}
