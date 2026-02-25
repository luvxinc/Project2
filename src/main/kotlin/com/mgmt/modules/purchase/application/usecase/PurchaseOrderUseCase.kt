package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import com.mgmt.modules.purchase.domain.model.PurchaseOrderEvent
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderEventRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentItemRepository
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * PurchaseOrderUseCase — PO lifecycle management.
 *
 * V3: auto-generates po_num from supplier_code + date + sequence.
 */
@Service
class PurchaseOrderUseCase(
    private val poRepo: PurchaseOrderRepository,
    private val itemRepo: PurchaseOrderItemRepository,
    private val strategyRepo: PurchaseOrderStrategyRepository,
    private val supplierRepo: SupplierRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val eventRepo: PurchaseOrderEventRepository,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(PurchaseOrderUseCase::class.java)

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(params: PurchaseOrderQueryParams): Pair<List<PurchaseOrder>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("poDate").descending())
        val result = poRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): PurchaseOrder =
        poRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.poNotFound")

    @Transactional(readOnly = true)
    fun findByPoNum(poNum: String): PurchaseOrder =
        poRepo.findByPoNumAndDeletedAtIsNull(poNum)
            ?: throw NotFoundException("purchase.errors.poNotFound")

    @Transactional(readOnly = true)
    fun getItems(poId: Long): List<PurchaseOrderItem> =
        itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(poId)

    @Transactional(readOnly = true)
    fun getStrategy(poId: Long): PurchaseOrderStrategy? =
        strategyRepo.findByPoId(poId)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreatePurchaseOrderRequest, username: String): PurchaseOrder {
        // Resolve supplier
        val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(dto.supplierCode.uppercase())
            ?: throw NotFoundException("purchase.errors.supplierNotFound")

        // Generate PO number: XX20260103-S01
        val poNum = generatePoNum(dto.supplierCode.uppercase(), dto.poDate)

        // Create PO header
        val po = PurchaseOrder(
            poNum = poNum,
            supplierId = supplier.id,
            supplierCode = supplier.supplierCode,
            poDate = dto.poDate,
            createdBy = username,
            updatedBy = username,
        )
        val savedPo = poRepo.save(po)

        // Create items
        dto.items.forEach { itemDto ->
            val item = PurchaseOrderItem(
                poId = savedPo.id,
                poNum = poNum,
                sku = itemDto.sku.trim().uppercase(),
                quantity = itemDto.quantity,
                unitPrice = itemDto.unitPrice,
                currency = itemDto.currency,
                exchangeRate = itemDto.exchangeRate,
                note = itemDto.note,
                createdBy = username,
                updatedBy = username,
            )
            itemRepo.save(item)
        }

        // Create strategy snapshot
        val strat = dto.strategy
        val strategy = PurchaseOrderStrategy(
            poId = savedPo.id,
            poNum = poNum,
            strategyDate = strat.strategyDate,
            currency = strat.currency,
            exchangeRate = strat.exchangeRate,
            rateMode = strat.rateMode,
            floatEnabled = strat.floatEnabled,
            floatThreshold = strat.floatThreshold,
            requireDeposit = strat.requireDeposit,
            depositRatio = strat.depositRatio,
            note = strat.note,
            createdBy = username,
            updatedBy = username,
        )
        strategyRepo.save(strategy)

        // Audit: record CREATE event
        val createdItems = itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(savedPo.id)
        recordEvent(savedPo.id, poNum, "CREATE", mapOf(
            "items" to itemsToMap(createdItems),
            "strategy" to strategyToMap(strategy),
        ), "原始订单", username)

        log.info("[PO:CREATE] poNum={} supplier={} items={} by={}", poNum, dto.supplierCode, dto.items.size, username)
        return savedPo
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdatePurchaseOrderRequest, username: String): PurchaseOrder {
        val po = findOne(id)
        val (canModify, shippingStatus) = canModifyOrDelete(id)
        if (!canModify) {
            throw IllegalStateException("Cannot modify order with shipping status: $shippingStatus")
        }

        dto.status?.let { po.status = it }
        po.updatedAt = Instant.now()
        po.updatedBy = username

        // Capture before state for audit
        val oldItems = itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(id)
        val oldStrategy = strategyRepo.findByPoId(id)
        val beforeItems = itemsToMap(oldItems)
        val beforeStrategy = strategyToMap(oldStrategy)

        // If items provided, replace all items + increment detailSeq
        dto.items?.let { newItems ->
            oldItems.forEach {
                it.deletedAt = Instant.now()
                it.updatedBy = username
                itemRepo.save(it)
            }
            newItems.forEach { itemDto ->
                val item = PurchaseOrderItem(
                    poId = po.id, poNum = po.poNum,
                    sku = itemDto.sku.trim().uppercase(), quantity = itemDto.quantity,
                    unitPrice = itemDto.unitPrice, currency = itemDto.currency,
                    exchangeRate = itemDto.exchangeRate, note = itemDto.note,
                    createdBy = username, updatedBy = username,
                )
                itemRepo.save(item)
            }
            po.detailSeq += 1
        }

        // If strategy update provided, update + increment strategySeq
        dto.strategy?.let { stratDto ->
            val existing = strategyRepo.findByPoId(id)
            if (existing != null) {
                existing.currency = stratDto.currency
                existing.exchangeRate = stratDto.exchangeRate
                existing.rateMode = stratDto.rateMode
                existing.floatEnabled = stratDto.floatEnabled
                existing.floatThreshold = stratDto.floatThreshold
                existing.requireDeposit = stratDto.requireDeposit
                existing.depositRatio = stratDto.depositRatio
                existing.note = stratDto.note
                existing.updatedBy = username
                existing.updatedAt = Instant.now()
                existing.strategySeq += 1
                strategyRepo.save(existing)
            }
        }

        val savedPo = poRepo.save(po)

        // Audit: record UPDATE event with before/after diff
        val afterItems = itemsToMap(itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(id))
        val afterStrategy = strategyToMap(strategyRepo.findByPoId(id))
        val changes = mutableMapOf<String, Any?>()
        if (dto.items != null) changes["items"] = mapOf("before" to beforeItems, "after" to afterItems)
        if (dto.strategy != null) changes["strategy"] = mapOf("before" to beforeStrategy, "after" to afterStrategy)
        val eventType = when {
            dto.items != null && dto.strategy != null -> "UPDATE_ITEMS_AND_STRATEGY"
            dto.items != null -> "UPDATE_ITEMS"
            dto.strategy != null -> "UPDATE_STRATEGY"
            else -> "UPDATE_STATUS"
        }
        recordEvent(po.id, po.poNum, eventType, changes, null, username)

        log.info("[PO:UPDATE] poNum={} type={} by={}", po.poNum, eventType, username)
        return savedPo
    }

    // ═══════════ Shipping Status ═══════════

    /**
     * Returns: "not_shipped" | "partially_shipped" | "fully_shipped"
     */
    @Transactional(readOnly = true)
    fun calculateShippingStatus(poId: Long): String {
        val poItems = itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(poId)
        if (poItems.isEmpty()) return "not_shipped"

        val totalOrdered = poItems.sumOf { it.quantity.toLong() }
        if (totalOrdered == 0L) return "not_shipped"

        val shippedItems = shipmentItemRepo.findAllByPoIdAndDeletedAtIsNull(poId)
        val totalShipped = shippedItems.sumOf { it.quantity.toLong() }

        return when {
            totalShipped == 0L -> "not_shipped"
            totalShipped >= totalOrdered -> "fully_shipped"
            else -> "partially_shipped"
        }
    }

    /**
     * Cannot delete if any items have been shipped.
     */
    @Transactional(readOnly = true)
    fun canModifyOrDelete(poId: Long): Pair<Boolean, String> {
        val status = calculateShippingStatus(poId)
        return when (status) {
            "not_shipped" -> true to status
            else -> false to status
        }
    }

    // ═══════════ Delete / Restore ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val po = findOne(id)
        val (canDelete, shippingStatus) = canModifyOrDelete(id)
        if (!canDelete) {
            throw IllegalStateException("Cannot delete order with shipping status: $shippingStatus")
        }
        // Capture items before deletion for audit
        val itemsAtDeletion = itemsToMap(itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(id))

        po.deletedAt = Instant.now()
        po.status = "cancelled"
        po.updatedBy = username
        poRepo.save(po)

        // Audit: record DELETE event (V1: note="删除订单_{operator}_{date}")
        val today = java.time.LocalDate.now().toString()
        recordEvent(po.id, po.poNum, "DELETE", mapOf(
            "items_at_deletion" to itemsAtDeletion,
        ), "删除订单_${username}_${today}", username)

        log.info("[PO:DELETE] poNum={} by={}", po.poNum, username)
        return true
    }

    @Transactional
    fun restore(id: Long, username: String): PurchaseOrder {
        val po = poRepo.findById(id).orElseThrow { NotFoundException("purchase.errors.poNotFound") }

        // Capture current state for audit
        val restoredItems = itemsToMap(itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(id))

        po.deletedAt = null
        po.status = "active"
        po.updatedAt = Instant.now()
        po.updatedBy = username
        val saved = poRepo.save(po)

        // Audit: record RESTORE event (V1: note="恢复删除_{operator}_{date}")
        val today = java.time.LocalDate.now().toString()
        recordEvent(po.id, po.poNum, "RESTORE", mapOf(
            "restored_items" to restoredItems,
        ), "恢复删除_${username}_${today}", username)

        log.info("[PO:RESTORE] poNum={} by={}", po.poNum, username)
        return saved
    }

    // ═══════════ Event History ═══════════

    @Transactional(readOnly = true)
    fun getHistory(poId: Long): List<PurchaseOrderEvent> =
        eventRepo.findAllByPoIdOrderByEventSeqAsc(poId)

    /**
     * Record an audit event. Append-only — never updated or deleted.
     */
    private fun recordEvent(
        poId: Long, poNum: String, eventType: String,
        changes: Map<String, Any?>, note: String?, operator: String,
    ) {
        val nextSeq = eventRepo.findMaxEventSeq(poId) + 1
        val event = PurchaseOrderEvent(
            poId = poId,
            poNum = poNum,
            eventType = eventType,
            eventSeq = nextSeq,
            changes = objectMapper.writeValueAsString(changes),
            note = note,
            operator = operator,
        )
        eventRepo.save(event)
    }

    private fun itemsToMap(items: List<PurchaseOrderItem>): List<Map<String, Any?>> =
        items.map { mapOf("sku" to it.sku, "qty" to it.quantity, "price" to it.unitPrice.toDouble()) }

    private fun strategyToMap(s: PurchaseOrderStrategy?): Map<String, Any?>? =
        s?.let { mapOf("currency" to it.currency, "exchangeRate" to it.exchangeRate.toDouble(),
            "floatEnabled" to it.floatEnabled, "floatThreshold" to it.floatThreshold.toDouble(),
            "requireDeposit" to it.requireDeposit, "depositRatio" to it.depositRatio.toDouble()) }

    // ═══════════ Helpers ═══════════

    /** V1 pattern: XX20260103-S01 (supplier_code + date + seq) */
    private fun generatePoNum(supplierCode: String, poDate: LocalDate): String {
        val dateStr = poDate.format(DateTimeFormatter.BASIC_ISO_DATE)  // 20260103
        val prefix = "${supplierCode}${dateStr}-S"
        // Count existing POs with same prefix in DB (was: findAll + filter in memory)
        val existingCount = poRepo.countByPoNumStartingWithAndDeletedAtIsNull(prefix)
        val seq = existingCount + 1
        return "$prefix${String.format("%02d", seq)}"
    }

    private fun buildSpec(params: PurchaseOrderQueryParams): Specification<PurchaseOrder> {
        @Suppress("DEPRECATION")
        return Specification.where<PurchaseOrder> { root, _, cb ->
            if (params.includeDeleted) cb.conjunction()
            else cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (params.search != null) {
                spec.and { root, _, cb ->
                    val pattern = "%${params.search.lowercase()}%"
                    cb.or(
                        cb.like(cb.lower(root.get("poNum")), pattern),
                        cb.like(cb.lower(root.get("supplierCode")), pattern),
                    )
                }
            } else spec
        }.let { spec ->
            if (params.supplierCode != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("supplierCode"), params.supplierCode.uppercase()) }
            } else spec
        }.let { spec ->
            if (params.status != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("status"), params.status) }
            } else spec
        }.let { spec ->
            if (params.dateFrom != null) {
                spec.and { root, _, cb -> cb.greaterThanOrEqualTo(root.get("poDate"), params.dateFrom) }
            } else spec
        }.let { spec ->
            if (params.dateTo != null) {
                spec.and { root, _, cb -> cb.lessThanOrEqualTo(root.get("poDate"), params.dateTo) }
            } else spec
        }
    }
}
