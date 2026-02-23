package com.mgmt.modules.purchase.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.model.ShipmentEvent
import com.mgmt.modules.purchase.domain.model.ShipmentItem
import com.mgmt.modules.purchase.domain.repository.*
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate

/**
 * ShipmentUseCase — logistics shipment management.
 *
 * V1 parity: send_submit, send_list, send_detail, send_modify, send_delete/undelete.
 */
@Service
class ShipmentUseCase(
    private val shipmentRepo: ShipmentRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poRepo: PurchaseOrderRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val eventRepo: ShipmentEventRepository,
    private val receiveRepo: ReceiveRepository,
    private val objectMapper: ObjectMapper,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(params: ShipmentQueryParams): Pair<List<Shipment>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("sentDate").descending())
        val result = shipmentRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): Shipment =
        shipmentRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.shipmentNotFound")

    @Transactional(readOnly = true)
    fun getItems(shipmentId: Long): List<ShipmentItem> =
        shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipmentId)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreateShipmentRequest, username: String): Shipment {
        if (shipmentRepo.existsByLogisticNumAndDeletedAtIsNull(dto.logisticNum)) {
            throw ConflictException("Logistic number '${dto.logisticNum}' already exists")
        }

        val shipment = Shipment(
            logisticNum = dto.logisticNum.trim(),
            sentDate = dto.sentDate,
            etaDate = dto.etaDate,
            pallets = dto.pallets,
            totalWeight = dto.totalWeight,
            priceKg = dto.priceKg,
            logisticsCost = dto.logisticsCost,
            exchangeRate = dto.exchangeRate,
            rateMode = dto.rateMode,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        val saved = shipmentRepo.save(shipment)

        val savedItems = mutableListOf<Map<String, Any?>>()
        dto.items.forEach { itemDto ->
            val po = poRepo.findByPoNumAndDeletedAtIsNull(itemDto.poNum)
                ?: throw NotFoundException("purchase.errors.poNotFound: ${itemDto.poNum}")

            val item = ShipmentItem(
                shipmentId = saved.id,
                logisticNum = saved.logisticNum,
                poId = po.id,
                poNum = po.poNum,
                sku = itemDto.sku.trim().uppercase(),
                quantity = itemDto.quantity,
                unitPrice = itemDto.unitPrice,
                poChange = itemDto.poChange,
                note = itemDto.note,
                createdBy = username,
                updatedBy = username,
            )
            shipmentItemRepo.save(item)
            savedItems.add(mapOf("poNum" to item.poNum, "sku" to item.sku, "quantity" to item.quantity, "unitPrice" to item.unitPrice.toDouble()))
        }

        // Record CREATE event (include priceKg + totalWeight for history audit)
        val changes = objectMapper.writeValueAsString(mapOf(
            "logisticNum" to saved.logisticNum,
            "sentDate" to saved.sentDate.toString(),
            "etaDate" to saved.etaDate?.toString(),
            "pallets" to saved.pallets,
            "priceKg" to saved.priceKg.toDouble(),
            "totalWeight" to saved.totalWeight.toDouble(),
            "logisticsCost" to saved.logisticsCost.toDouble(),
            "exchangeRate" to saved.exchangeRate.toDouble(),
            "items" to savedItems,
        ))
        recordEvent(saved.id, saved.logisticNum, "CREATE", changes, "Initial shipment", username)

        return saved
    }

    // ═══════════ Update ═══════════

    /**
     * V1 parity: edit.py + edit_items/ — logistics + items modification.
     * Creates a new version event. Supports both params and item editing in one call.
     * Editable params: etaDate, pallets, totalWeight, priceKg, exchangeRate, note.
     * Editable items: quantity, poChange. Can add new items and soft-delete removed ones.
     * logisticsCost is recomputed: ceil(totalWeight) * priceKg, rounded to 5 decimals.
     *
     * Guard: edits are BLOCKED once any receiving has been submitted (total receiveQty > 0).
     * IN_TRANSIT → editable. ALL_RECEIVED / DIFF_* → locked.
     */
    @Transactional
    fun update(id: Long, dto: UpdateShipmentRequest, username: String): Shipment {
        val shipment = findOne(id)

        // ── Business rule guard ─────────────────────────────────
        // Re-use the receive repo to check if goods have already been received.
        // receiveStatus != IN_TRANSIT means total receiveQty > 0 → locked.
        val receivedQty = receiveRepo.sumReceiveQuantityByLogisticNum(shipment.logisticNum)
        if (receivedQty > 0) {
            throw IllegalStateException("purchase.errors.shipmentNotModifiable")
        }
        // ────────────────────────────────────────────────────────
        val logisticsChanges = mutableMapOf<String, Any?>()

        dto.etaDate?.let {
            if (it != shipment.etaDate) {
                logisticsChanges["etaDate"] = mapOf("before" to shipment.etaDate?.toString(), "after" to it.toString())
                shipment.etaDate = it
            }
        }
        dto.pallets?.let {
            if (it != shipment.pallets) {
                logisticsChanges["pallets"] = mapOf("before" to shipment.pallets, "after" to it)
                shipment.pallets = it
            }
        }
        dto.totalWeight?.let {
            if (it.compareTo(shipment.totalWeight) != 0) {
                logisticsChanges["totalWeight"] = mapOf("before" to shipment.totalWeight.toDouble(), "after" to it.toDouble())
                shipment.totalWeight = it
            }
        }
        dto.priceKg?.let {
            if (it.compareTo(shipment.priceKg) != 0) {
                logisticsChanges["priceKg"] = mapOf("before" to shipment.priceKg.toDouble(), "after" to it.toDouble())
                shipment.priceKg = it
            }
        }
        dto.exchangeRate?.let {
            if (it.compareTo(shipment.exchangeRate) != 0) {
                logisticsChanges["exchangeRate"] = mapOf("before" to shipment.exchangeRate.toDouble(), "after" to it.toDouble())
                shipment.exchangeRate = it
            }
        }
        dto.note?.let {
            if (it != shipment.note) {
                logisticsChanges["note"] = mapOf("before" to shipment.note, "after" to it)
                shipment.note = it
            }
        }

        // Recompute logisticsCost = ceil(totalWeight) * priceKg (V1: round(price_kg * total_weight, 5))
        val newCost = java.math.BigDecimal(
            Math.round(Math.ceil(shipment.totalWeight.toDouble()) * shipment.priceKg.toDouble() * 100000.0) / 100000.0
        )
        if (newCost.compareTo(shipment.logisticsCost) != 0) {
            logisticsChanges["logisticsCost"] = mapOf("before" to shipment.logisticsCost.toDouble(), "after" to newCost.toDouble())
            shipment.logisticsCost = newCost
        }

        shipment.updatedAt = Instant.now()
        shipment.updatedBy = username
        val saved = shipmentRepo.save(shipment)

        if (logisticsChanges.isNotEmpty()) {
            recordEvent(saved.id, saved.logisticNum, "UPDATE_LOGISTICS",
                objectMapper.writeValueAsString(logisticsChanges), null, username)
        }

        // ── V1 parity: item-level editing (send_mgmt/edit_items) ──
        dto.items?.let { incomingItems ->
            val existing = shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(saved.id)
            val existingById = existing.associateBy { it.id }
            val incomingIds = incomingItems.mapNotNull { it.id }.toSet()
            val itemChanges = mutableListOf<Map<String, Any?>>()

            // Soft-delete items not in incoming list
            existing.filter { it.id !in incomingIds }.forEach { removed ->
                removed.deletedAt = Instant.now()
                removed.updatedBy = username
                shipmentItemRepo.save(removed)
                itemChanges.add(mapOf("action" to "DELETE", "poNum" to removed.poNum, "sku" to removed.sku, "quantity" to removed.quantity))
            }

            // Update existing + add new
            incomingItems.forEach { itemDto ->
                if (itemDto.id != null && existingById.containsKey(itemDto.id)) {
                    // Update existing item
                    val item = existingById[itemDto.id]!!
                    val changed = mutableMapOf<String, Any?>()
                    if (item.quantity != itemDto.quantity) {
                        changed["quantity"] = mapOf("before" to item.quantity, "after" to itemDto.quantity)
                        item.quantity = itemDto.quantity
                    }
                    if (item.poChange != itemDto.poChange) {
                        changed["poChange"] = mapOf("before" to item.poChange, "after" to itemDto.poChange)
                        item.poChange = itemDto.poChange
                    }
                    if (changed.isNotEmpty()) {
                        item.updatedAt = Instant.now()
                        item.updatedBy = username
                        shipmentItemRepo.save(item)
                        itemChanges.add(mapOf("action" to "UPDATE", "poNum" to item.poNum, "sku" to item.sku) + changed)
                    }
                } else {
                    // New item
                    val po = poRepo.findByPoNumAndDeletedAtIsNull(itemDto.poNum)
                        ?: throw NotFoundException("purchase.errors.poNotFound: ${itemDto.poNum}")
                    val newItem = ShipmentItem(
                        shipmentId = saved.id,
                        logisticNum = saved.logisticNum,
                        poId = po.id,
                        poNum = po.poNum,
                        sku = itemDto.sku.trim().uppercase(),
                        quantity = itemDto.quantity,
                        unitPrice = itemDto.unitPrice,
                        poChange = itemDto.poChange,
                        createdBy = username,
                        updatedBy = username,
                    )
                    shipmentItemRepo.save(newItem)
                    itemChanges.add(mapOf("action" to "ADD", "poNum" to newItem.poNum, "sku" to newItem.sku, "quantity" to newItem.quantity, "unitPrice" to newItem.unitPrice.toDouble()))
                }
            }

            if (itemChanges.isNotEmpty()) {
                recordEvent(saved.id, saved.logisticNum, "UPDATE_ITEMS",
                    objectMapper.writeValueAsString(itemChanges), null, username)
            }
        }

        return saved
    }

    // ═══════════ Available POs ═══════════

    @Transactional(readOnly = true)
    fun getAvailablePos(sentDate: LocalDate?): List<ShipmentAvailablePo> {
        val pos = if (sentDate != null) {
            poRepo.findAllByDeletedAtIsNullOrderByPoDateDesc().filter { it.poDate <= sentDate }
        } else {
            poRepo.findAllByDeletedAtIsNullOrderByPoDateDesc()
        }

        return pos.mapNotNull { po ->
            val poItems = poItemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(po.id)
            val availableItems = poItems.mapNotNull { poItem ->
                val shippedQty = shipmentItemRepo.findAllByPoIdAndSkuAndDeletedAtIsNull(po.id, poItem.sku)
                    .sumOf { it.quantity }
                val remainingQty = poItem.quantity - shippedQty
                if (remainingQty > 0) {
                    ShipmentAvailablePoItem(
                        sku = poItem.sku,
                        orderedQty = poItem.quantity,
                        shippedQty = shippedQty,
                        remainingQty = remainingQty,
                        unitPrice = poItem.unitPrice.toDouble(),
                        currency = poItem.currency,
                    )
                } else null
            }
            if (availableItems.isNotEmpty()) {
                ShipmentAvailablePo(
                    poId = po.id,
                    poNum = po.poNum,
                    supplierCode = po.supplierCode,
                    poDate = po.poDate,
                    items = availableItems,
                )
            } else null
        }
    }

    // ═══════════ Export Context ═══════════

    /**
     * V1 parity: detail.py → prepare data for MGMT/warehouse export.
     * For each item: poDate, currency, orderedQty, alreadySent(excl current), isAdjusted.
     */
    @Transactional(readOnly = true)
    fun prepareExportContexts(shipmentId: Long): List<com.mgmt.modules.purchase.infrastructure.excel.ShipmentExcelService.ItemExportContext> {
        val items = getItems(shipmentId)
        return items.map { item ->
            val po = poRepo.findByPoNumAndDeletedAtIsNull(item.poNum)
            val poItem = po?.let {
                poItemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(it.id)
                    .find { pi -> pi.sku == item.sku }
            }

            // Total sent across ALL shipments for (poNum, sku)
            val totalSent = shipmentItemRepo.sumSentByPoNumAndSku(item.poNum, item.sku)
            // Already sent = total - current shipment's quantity
            val alreadySentExclCurrent = totalSent - item.quantity

            com.mgmt.modules.purchase.infrastructure.excel.ShipmentExcelService.ItemExportContext(
                item = item,
                poDate = po?.poDate,
                currency = poItem?.currency ?: "USD",
                orderedQty = poItem?.quantity ?: 0,
                alreadySentExclCurrent = maxOf(0, alreadySentExclCurrent),
                isAdjusted = item.poChange,
            )
        }
    }

    @Transactional(readOnly = true)
    fun getLatestEvent(shipmentId: Long): com.mgmt.modules.purchase.domain.model.ShipmentEvent? {
        val events = eventRepo.findAllByShipmentIdOrderByEventSeqAsc(shipmentId)
        return events.lastOrNull()
    }

    // ═══════════ History ═══════════

    @Transactional(readOnly = true)
    fun getHistory(shipmentId: Long): List<ShipmentEvent> {
        val events = eventRepo.findAllByShipmentIdOrderByEventSeqAsc(shipmentId)

        // If a CREATE event already exists, return as-is
        val hasCreate = events.any { it.eventType == "CREATE" }
        if (hasCreate) return events

        // ETL-migrated shipments: no CREATE event was recorded at import time.
        // Synthesise a transient CREATE entry from the shipment itself so
        // the History tab always shows at least the initial version (V1 parity:
        // in_send always has at least one S01 row per logistic_num).
        val shipment = shipmentRepo.findById(shipmentId).orElse(null) ?: return events
        val syntheticCreate = ShipmentEvent(
            id = -1,                              // transient — never persisted
            shipmentId = shipmentId,
            logisticNum = shipment.logisticNum,
            eventType = "CREATE",
            eventSeq = 0,                         // seq 0 so it sorts before real events
            changes = "{}",                       // no field-level diff for initial import
            note = shipment.note ?: "原始发货单",
            operator = shipment.createdBy ?: "system",
            createdAt = shipment.createdAt,
        )
        return listOf(syntheticCreate) + events
    }

    // ═══════════ Delete / Restore ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val shipment = findOne(id)
        shipment.deletedAt = Instant.now()
        shipment.status = "cancelled"
        shipment.updatedBy = username
        shipmentRepo.save(shipment)

        recordEvent(shipment.id, shipment.logisticNum, "DELETE",
            objectMapper.writeValueAsString(mapOf("status" to "cancelled")),
            "Deleted by $username", username)

        return true
    }

    @Transactional
    fun restore(id: Long, username: String): Shipment {
        val shipment = shipmentRepo.findById(id).orElseThrow { NotFoundException("purchase.errors.shipmentNotFound") }
        shipment.deletedAt = null
        shipment.status = "pending"
        shipment.updatedAt = Instant.now()
        shipment.updatedBy = username
        val saved = shipmentRepo.save(shipment)

        recordEvent(saved.id, saved.logisticNum, "RESTORE",
            objectMapper.writeValueAsString(mapOf("status" to "pending")),
            "Restored by $username", username)

        return saved
    }

    // ═══════════ Helpers ═══════════

    private fun recordEvent(shipmentId: Long, logisticNum: String, eventType: String, changes: String, note: String?, operator: String) {
        val nextSeq = eventRepo.findMaxEventSeq(shipmentId) + 1
        eventRepo.save(ShipmentEvent(
            shipmentId = shipmentId,
            logisticNum = logisticNum,
            eventType = eventType,
            eventSeq = nextSeq,
            changes = changes,
            note = note,
            operator = operator,
        ))
    }

    private fun buildSpec(params: ShipmentQueryParams): Specification<Shipment> {
        @Suppress("DEPRECATION")
        var spec = if (params.includeDeleted) {
            Specification.where<Shipment>(null)
        } else {
            Specification.where<Shipment> { root, _, cb ->
                cb.isNull(root.get<Instant>("deletedAt"))
            }
        }

        if (params.search != null) {
            spec = spec.and { root, _, cb ->
                cb.like(cb.lower(root.get("logisticNum")), "%${params.search.lowercase()}%")
            }
        }
        if (params.status != null) {
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("status"), params.status) }
        }
        if (params.dateFrom != null) {
            spec = spec.and { root, _, cb ->
                cb.greaterThanOrEqualTo(root.get("sentDate"), params.dateFrom)
            }
        }
        if (params.dateTo != null) {
            spec = spec.and { root, _, cb ->
                cb.lessThanOrEqualTo(root.get("sentDate"), params.dateTo)
            }
        }

        return spec
    }
}
