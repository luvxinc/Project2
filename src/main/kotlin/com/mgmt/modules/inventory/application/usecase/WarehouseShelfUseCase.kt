package com.mgmt.modules.inventory.application.usecase

import com.mgmt.common.exception.BadRequestException
import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.domain.model.WarehouseLocation
import com.mgmt.modules.inventory.domain.repository.WarehouseLocationRepository
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * WarehouseShelfUseCase — batch warehouse location management.
 *
 * Generates locations via Cartesian product:
 *   warehouse × aisle × bay × level × bin × slot
 *
 * Max 10,000 locations per batch to prevent runaway generation.
 */
@Service
class WarehouseShelfUseCase(
    private val repo: WarehouseLocationRepository,
    private val em: EntityManager,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        const val MAX_LOCATIONS = 10_000
    }

    // ═══════════ Batch Create ═══════════

    @Transactional
    fun batchCreate(request: BatchCreateWarehouseRequest, username: String): List<WarehouseLocation> {
        val warehouseName = request.warehouse.trim().uppercase()
        if (warehouseName.isBlank()) {
            throw BadRequestException("inventory.errors.warehouseNameRequired")
        }

        if (repo.existsByWarehouse(warehouseName)) {
            throw ConflictException("inventory.errors.warehouseAlreadyExists")
        }

        val locations = generateLocations(warehouseName, request.aisles, username)

        if (locations.size > MAX_LOCATIONS) {
            throw BadRequestException("inventory.errors.tooManyLocations")
        }

        try {
            val saved = repo.saveAll(locations)
            // Flush to trigger DB constraints and GENERATED columns
            em.flush()
            // Refresh all to read back generated barcode column
            saved.forEach { em.refresh(it) }

            log.info("Batch created {} warehouse locations for {}", saved.size, warehouseName)
            return saved
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("inventory.errors.warehouseLocationExists")
        }
    }

    // ═══════════ Tree ═══════════

    @Transactional(readOnly = true)
    fun getWarehouseTree(): WarehouseTreeResponse {
        val allLocations = repo.findAll()
        val grouped = allLocations.groupBy { it.warehouse }

        val warehouseList = mutableListOf<WarehouseNode>()

        for ((whName, locations) in grouped.toSortedMap()) {
            val aisleList = mutableListOf<AisleNode>()

            val byAisle = locations.groupBy { it.aisle }
            for ((aisleName, aisleLocations) in byAisle.toSortedMap()) {
                val bayList = mutableListOf<BayNode>()
                val byBay = aisleLocations.groupBy { it.bay }

                for ((bayNum, bayLocations) in byBay.toSortedMap()) {
                    val levelList = mutableListOf<LevelNode>()
                    val byLevel = bayLocations.groupBy { it.level }

                    for ((lvl, levelLocations) in byLevel.toSortedMap()) {
                        val binList = mutableListOf<BinNode>()
                        val byBin = levelLocations.groupBy { it.bin }

                        for ((binName, binLocations) in byBin.toSortedMap()) {
                            val slots = binLocations.map { it.slot }.filter { it.isNotEmpty() }.sorted()
                            val binNum = binName.toIntOrNull() ?: 0
                            binList.add(BinNode(bin = binNum, slots = slots))
                        }

                        levelList.add(LevelNode(level = lvl, bins = binList))
                    }

                    bayList.add(BayNode(bay = bayNum, levels = levelList))
                }

                aisleList.add(AisleNode(aisle = aisleName, bays = bayList))
            }

            warehouseList.add(WarehouseNode(
                warehouse = whName,
                totalLocations = locations.size,
                aisles = aisleList,
            ))
        }

        return WarehouseTreeResponse(
            warehouses = warehouseList,
            totalWarehouses = warehouseList.size,
            totalLocations = allLocations.size,
        )
    }

    // ═══════════ Warehouse Names ═══════════

    @Transactional(readOnly = true)
    fun getWarehouseNames(): List<String> = repo.findDistinctWarehouseNames()

    // ═══════════ Update Warehouse ═══════════

    @Transactional
    fun updateWarehouse(warehouse: String, request: BatchCreateWarehouseRequest, username: String): List<WarehouseLocation> {
        val warehouseName = warehouse.trim().uppercase()
        if (!repo.existsByWarehouse(warehouseName)) {
            throw NotFoundException("inventory.errors.warehouseNotFound")
        }

        // Delete old locations
        val deleted = repo.deleteAllByWarehouse(warehouseName)
        em.flush()
        log.info("Deleted {} existing locations for warehouse {}", deleted, warehouseName)

        // Regenerate
        val locations = generateLocations(warehouseName, request.aisles, username)

        if (locations.size > MAX_LOCATIONS) {
            throw BadRequestException("inventory.errors.tooManyLocations")
        }

        try {
            val saved = repo.saveAll(locations)
            em.flush()
            saved.forEach { em.refresh(it) }

            log.info("Rebuilt {} warehouse locations for {}", saved.size, warehouseName)
            return saved
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("inventory.errors.warehouseLocationExists")
        }
    }

    // ═══════════ Delete Warehouse ═══════════

    @Transactional
    fun deleteWarehouse(warehouse: String): Int {
        val warehouseName = warehouse.trim().uppercase()
        if (!repo.existsByWarehouse(warehouseName)) {
            throw NotFoundException("inventory.errors.warehouseNotFound")
        }

        val deleted = repo.deleteAllByWarehouse(warehouseName)
        log.info("Deleted warehouse {} ({} locations)", warehouseName, deleted)
        return deleted
    }

    // ═══════════ Helpers ═══════════

    private fun generateLocations(
        warehouse: String,
        aisles: Map<String, AisleConfig>,
        username: String,
    ): List<WarehouseLocation> {
        val now = Instant.now()
        val locations = mutableListOf<WarehouseLocation>()

        for ((aisleName, aisleConfig) in aisles) {
            val normalizedAisle = aisleName.trim().uppercase()

            for (bayNum in 1..aisleConfig.bayCount) {
                val bayKey = bayNum.toString()
                val customBay = aisleConfig.customBays?.get(bayKey)

                val levels = customBay?.levels ?: aisleConfig.levels
                val binCount = customBay?.binCount ?: aisleConfig.binCount
                val slotCount = customBay?.slotCount ?: aisleConfig.slotCount

                for (level in levels) {
                    val normalizedLevel = level.trim().uppercase()

                    if (binCount == 0 && slotCount == 0) {
                        // No bins, no slots — just the level
                        locations.add(WarehouseLocation(
                            warehouse = warehouse,
                            aisle = normalizedAisle,
                            bay = bayNum,
                            level = normalizedLevel,
                            bin = "",
                            slot = "",
                            createdBy = username,
                            updatedBy = username,
                            createdAt = now,
                            updatedAt = now,
                        ))
                    } else if (binCount > 0 && slotCount == 0) {
                        // Bins without slots
                        for (b in 1..binCount) {
                            locations.add(WarehouseLocation(
                                warehouse = warehouse,
                                aisle = normalizedAisle,
                                bay = bayNum,
                                level = normalizedLevel,
                                bin = b.toString(),
                                slot = "",
                                createdBy = username,
                                updatedBy = username,
                                createdAt = now,
                                updatedAt = now,
                            ))
                        }
                    } else if (binCount == 0 && slotCount > 0) {
                        // Slots without bins
                        for (s in 1..slotCount) {
                            locations.add(WarehouseLocation(
                                warehouse = warehouse,
                                aisle = normalizedAisle,
                                bay = bayNum,
                                level = normalizedLevel,
                                bin = "",
                                slot = s.toString(),
                                createdBy = username,
                                updatedBy = username,
                                createdAt = now,
                                updatedAt = now,
                            ))
                        }
                    } else {
                        // Both bins and slots
                        for (b in 1..binCount) {
                            for (s in 1..slotCount) {
                                locations.add(WarehouseLocation(
                                    warehouse = warehouse,
                                    aisle = normalizedAisle,
                                    bay = bayNum,
                                    level = normalizedLevel,
                                    bin = b.toString(),
                                    slot = s.toString(),
                                    createdBy = username,
                                    updatedBy = username,
                                    createdAt = now,
                                    updatedAt = now,
                                ))
                            }
                        }
                    }

                    // Early exit if we're already over the limit
                    if (locations.size > MAX_LOCATIONS) {
                        throw BadRequestException("inventory.errors.tooManyLocations")
                    }
                }
            }
        }

        return locations
    }
}
