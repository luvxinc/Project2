package com.mgmt.modules.purchase.application.usecase

import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import com.mgmt.modules.purchase.domain.model.ReceiveDiffEvent
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.model.ShipmentItem
import com.mgmt.modules.purchase.domain.repository.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * AbnormalUseCase — Business logic for receive-diff (入库异常) management.
 *
 * Extracted from AbnormalController per V3 architecture §6 rule:
 * "Controller 禁止写业务逻辑 — 只做入参校验 + 调用 UseCase + 返回结果"
 *
 * V1 parity: abnormal.py — 4 strategies (M1-M4) + rollback
 */
@Service
class AbnormalUseCase(
    private val diffRepo: ReceiveDiffRepository,
    private val receiveRepo: ReceiveRepository,
    private val strategyRepo: PurchaseOrderStrategyRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val shipmentRepo: ShipmentRepository,
    private val diffEventRepo: ReceiveDiffEventRepository,
) {
    private val log = LoggerFactory.getLogger(AbnormalUseCase::class.java)

    // ═══════════ Query: List ═══════════

    @Transactional(readOnly = true)
    fun list(sortOrder: String, status: String): List<AbnormalListResponse> {
        val allDiffs = diffRepo.findAll()

        // Pre-load receives for all receiveIds in ONE query (N+1 fix)
        val allReceiveIds = allDiffs.map { it.receiveId }.distinct()
        val receiveDateMap = receiveRepo.findAllById(allReceiveIds)
            .filter { it.deletedAt == null }
            .associate { it.id to it.receiveDate.toString() }

        // Group by logisticNum
        val grouped = allDiffs.groupBy { it.logisticNum }

        val items = grouped.map { (logisticNum, diffs) ->
            val derivedStatus = deriveGroupStatus(diffs)

            // Lookup receiveDate from pre-loaded map
            val receiveDate = diffs.firstNotNullOfOrNull { d ->
                receiveDateMap[d.receiveId]
            } ?: ""

            // Aggregate
            val skuCount = diffs.map { it.sku }.distinct().size
            val totalDiff = diffs.sumOf { it.diffQuantity }
            val note = diffs.mapNotNull { it.resolutionNote }.distinct().joinToString("; ").ifEmpty { null }

            AbnormalListResponse(
                logisticNum = logisticNum,
                receiveDate = receiveDate,
                status = derivedStatus,
                skuCount = skuCount,
                totalDiff = totalDiff,
                note = note,
            )
        }

        // Filter by status
        val filtered = when (status.lowercase()) {
            "pending" -> items.filter { it.status == "pending" }
            "done", "resolved" -> items.filter { it.status == "resolved" }
            "deleted" -> items.filter { it.status == "deleted" }
            else -> items
        }

        // Sort by receiveDate
        return if (sortOrder.lowercase() == "asc") {
            filtered.sortedBy { it.receiveDate }
        } else {
            filtered.sortedByDescending { it.receiveDate }
        }
    }

    // ═══════════ Query: Detail ═══════════

    @Transactional(readOnly = true)
    fun detail(logisticNum: String): AbnormalDetailResponse {
        val diffs = diffRepo.findAllByLogisticNum(logisticNum)
        if (diffs.isEmpty()) {
            return AbnormalDetailResponse(
                logisticNum = logisticNum,
                receiveDate = "",
                overallStatus = "pending",
                items = emptyList(),
                summary = AbnormalSummary(0, 0, 0, 0),
            )
        }

        // Get receiveDate from linked Receive
        val receiveDate = diffs.firstNotNullOfOrNull { d ->
            receiveRepo.findByIdAndDeletedAtIsNull(d.receiveId)?.receiveDate?.toString()
        } ?: ""

        // Build price map: (poNum, sku) → unitPrice from Receive
        val receives = receiveRepo.findAllByLogisticNumOrderBySkuAsc(logisticNum)
        val priceMap = receives.groupBy { it.poNum to it.sku }
            .mapValues { (_, list) -> list.first().unitPrice.toDouble() }

        // Build currency map: poNum → currency from PurchaseOrderStrategy (batch N+1 fix)
        val poNums = diffs.map { it.poNum }.distinct()
        val currencyMap = try {
            strategyRepo.findAllByPoNumIn(poNums)
                .associate { it.poNum to it.currency }
                .toMutableMap()
                .also { map -> poNums.forEach { map.putIfAbsent(it, "RMB") } }
        } catch (_: Exception) {
            poNums.associateWith { "RMB" }.toMutableMap()
        }

        // Build item responses
        val items = diffs.map { d ->
            AbnormalDetailItemResponse(
                id = d.id,
                poNum = d.poNum,
                sku = d.sku,
                poQuantity = d.poQuantity,
                sentQuantity = d.sentQuantity,
                receiveQuantity = d.receiveQuantity,
                diffQuantity = d.diffQuantity,
                status = d.status,
                resolutionNote = d.resolutionNote,
                unitPrice = priceMap[d.poNum to d.sku],
                currency = currencyMap[d.poNum],
            )
        }.sortedWith(compareBy({ it.poNum }, { it.sku }))

        // Summary
        val overReceived = items.filter { it.diffQuantity < 0 }.sumOf { -it.diffQuantity }
        val underReceived = items.filter { it.diffQuantity > 0 }.sumOf { it.diffQuantity }
        val overallStatus = deriveGroupStatus(diffs)

        return AbnormalDetailResponse(
            logisticNum = logisticNum,
            receiveDate = receiveDate,
            overallStatus = overallStatus,
            items = items,
            summary = AbnormalSummary(
                totalSkus = items.size,
                totalDiff = items.sumOf { it.diffQuantity },
                overReceived = overReceived,
                underReceived = underReceived,
            ),
        )
    }

    // ═══════════ Query: History ═══════════

    @Transactional(readOnly = true)
    fun history(logisticNum: String): List<Map<String, Any?>> {
        val events = diffEventRepo.findAllByLogisticNumOrderByEventSeqAsc(logisticNum)
        return events.map { e ->
            mapOf(
                "id" to e.id,
                "diffId" to e.diffId,
                "logisticNum" to e.logisticNum,
                "eventType" to e.eventType,
                "eventSeq" to e.eventSeq,
                "changes" to e.changes,
                "note" to e.note,
                "operator" to e.operator,
                "createdAt" to e.createdAt.toString(),
            )
        }
    }

    // ═══════════ Command: Process ═══════════

    @Transactional
    fun process(request: ProcessAbnormalRequest): Map<String, Any> {
        val diffs = diffRepo.findAllByLogisticNum(request.logisticNum)
            .filter { it.status == "pending" }

        if (diffs.isEmpty()) {
            throw IllegalArgumentException("No pending diffs for logistic ${request.logisticNum}")
        }

        val processed = mutableListOf<String>()
        val notePrefix = request.note ?: "差异校正修改"

        for (diff in diffs) {
            val poMethod = request.poMethods[diff.poNum] ?: continue
            val strategy = if (diff.diffQuantity > 0) poMethod.positive else poMethod.negative
            if (strategy == null) continue

            when (strategy) {
                1 -> processM1(diff, notePrefix)
                2 -> processM2(diff, notePrefix)
                3 -> processM3(diff, notePrefix, request.delayDate)
                4 -> processM4(diff, notePrefix)
                else -> continue
            }
            processed.add("${diff.sku}:M$strategy")
        }

        log.info("[Abnormal:PROCESS] logistic={} count={} details={}", request.logisticNum, processed.size, processed)

        return mapOf(
            "logisticNum" to request.logisticNum,
            "processedCount" to processed.size,
            "details" to processed,
        )
    }

    // ═══════════ Command: Delete (Rollback) ═══════════

    @Transactional
    fun delete(request: DeleteAbnormalRequest): Map<String, Any> {
        val diffs = diffRepo.findAllByLogisticNum(request.logisticNum)
            .filter { it.status == "resolved" }

        if (diffs.isEmpty()) {
            throw IllegalArgumentException("No resolved diffs to delete for ${request.logisticNum}")
        }

        var rolledBackCount = 0
        for (diff in diffs) {
            val strategy = parseStrategy(diff.resolutionNote)
            val originalDiffQuantity = findOriginalDiffQuantity(diff)
            rollbackStrategy(diff, strategy)

            val beforeSnapshot = diffSnapshot(diff)
            diff.status = "pending"
            diff.diffQuantity = originalDiffQuantity
            diff.resolutionNote = null
            diff.updatedAt = Instant.now()
            diffRepo.save(diff)

            recordDiffEvent(diff, "ROLLBACK", beforeSnapshot, "撤销异常处理 (原策略: M$strategy)")
            rolledBackCount++
        }

        log.info("[Abnormal:ROLLBACK] logistic={} count={}", request.logisticNum, rolledBackCount)

        return mapOf(
            "logisticNum" to request.logisticNum,
            "deletedCount" to rolledBackCount,
        )
    }

    // ═══════════ M1-M4 Processing Strategies ═══════════

    /** M1: Fix shipment only — set shipment_item.quantity = receive_quantity */
    private fun processM1(diff: ReceiveDiff, notePrefix: String) {
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.receiveQuantity
            si.note = "$notePrefix #M1"
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.receiveQuantity
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }

        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.diffQuantity = 0
        diff.resolutionNote = "$notePrefix #M1"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M1", beforeSnapshot, "$notePrefix #M1")
    }

    /** M2: Fix shipment + PO — M1 + update PO item quantity */
    private fun processM2(diff: ReceiveDiff, notePrefix: String) {
        processM1Partial(diff, notePrefix)

        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = diff.receiveQuantity
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.diffQuantity = 0
        diff.resolutionNote = "$notePrefix #M2"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M2", beforeSnapshot, "$notePrefix #M2")
    }

    /** M3: Delay — create a future receive for the shortage */
    private fun processM3(diff: ReceiveDiff, notePrefix: String, delayDate: String?) {
        if (diff.diffQuantity <= 0) return

        val delayLocalDate = delayDate?.let { LocalDate.parse(it) }
            ?: LocalDate.now().plusDays(30)

        val delayLogistic = "${diff.logisticNum}_delay_V01"
        val shipment = Shipment().apply {
            logisticNum = delayLogistic
            sentDate = delayLocalDate
            status = "pending"
            pallets = 0
            totalWeight = BigDecimal.ZERO
            priceKg = BigDecimal.ZERO
            logisticsCost = BigDecimal.ZERO
            exchangeRate = BigDecimal.ONE
            rateMode = "M"
            createdBy = "system"
            updatedBy = "system"
            note = "$notePrefix #M3 delay from ${diff.logisticNum}"
        }
        shipmentRepo.save(shipment)

        val si = ShipmentItem().apply {
            shipmentId = shipment.id
            logisticNum = delayLogistic
            poId = receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
                .firstOrNull { it.poNum == diff.poNum }?.poId ?: 0
            poNum = diff.poNum
            sku = diff.sku
            quantity = diff.diffQuantity
            unitPrice = BigDecimal.ZERO
            poChange = false
            note = "$notePrefix #M3"
            createdBy = "system"
            updatedBy = "system"
        }
        shipmentItemRepo.save(si)

        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.resolutionNote = "$notePrefix #M3 → delay shipment $delayLogistic"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M3", beforeSnapshot, "$notePrefix #M3 → $delayLogistic")
    }

    /** M4: Vendor error — adjust PO, shipment, and receive to reconcile */
    private fun processM4(diff: ReceiveDiff, notePrefix: String) {
        val adjustQty = diff.diffQuantity
        val isOverage = adjustQty < 0

        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = pi.quantity - adjustQty
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.receiveQuantity
            si.note = "$notePrefix #M4"
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.receiveQuantity
                if (isOverage) {
                    r.note = "$notePrefix #M4 vendor overage, extra units at cost=0"
                }
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }

        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.diffQuantity = 0
        diff.resolutionNote = "$notePrefix #M4"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M4", beforeSnapshot, "$notePrefix #M4")
    }

    /** M1 partial — used by M2 to avoid double-resolving */
    private fun processM1Partial(diff: ReceiveDiff, notePrefix: String) {
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.receiveQuantity
            si.note = "$notePrefix #M2"
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.receiveQuantity
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }
    }

    // ═══════════ Rollback Strategies ═══════════

    private fun rollbackStrategy(diff: ReceiveDiff, strategy: Int) {
        when (strategy) {
            1 -> rollbackM1(diff)
            2 -> rollbackM2(diff)
            3 -> rollbackM3(diff)
            4 -> rollbackM4(diff)
        }
    }

    private fun rollbackM1(diff: ReceiveDiff) {
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.sentQuantity
            si.note = null
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.sentQuantity
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }
    }

    private fun rollbackM2(diff: ReceiveDiff) {
        rollbackM1(diff)

        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = diff.poQuantity
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }
    }

    private fun rollbackM3(diff: ReceiveDiff) {
        val delayPattern = "${diff.logisticNum}_delay_"
        val allShipments = shipmentRepo.findAll()
        val delayShipments = allShipments.filter { s ->
            s.logisticNum.startsWith(delayPattern) && s.deletedAt == null
        }

        for (delayShipment in delayShipments) {
            val delayItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(delayShipment.logisticNum)
            val matchingItems = delayItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }
            matchingItems.forEach { si ->
                si.deletedAt = Instant.now()
                si.updatedAt = Instant.now()
                shipmentItemRepo.save(si)
            }

            val remainingItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(delayShipment.logisticNum)
            if (remainingItems.isEmpty()) {
                delayShipment.deletedAt = Instant.now()
                delayShipment.updatedAt = Instant.now()
                shipmentRepo.save(delayShipment)
            }
        }
    }

    private fun rollbackM4(diff: ReceiveDiff) {
        val originalDiffQuantity = findOriginalDiffQuantity(diff)
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = pi.quantity + originalDiffQuantity
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.sentQuantity
            si.note = null
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.sentQuantity
                r.note = null
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }
    }

    // ═══════════ Helpers ═══════════

    fun deriveGroupStatus(diffs: List<ReceiveDiff>): String {
        val allResolved = diffs.all { it.status == "resolved" }
        return if (allResolved) "resolved" else "pending"
    }

    private fun parseStrategy(note: String?): Int {
        if (note == null) return 1
        val match = Regex("#M(\\d)").find(note) ?: return 1
        return match.groupValues[1].toIntOrNull() ?: 1
    }

    private fun findOriginalDiffQuantity(diff: ReceiveDiff): Int {
        val events = diffEventRepo.findAllByDiffIdOrderByEventSeqAsc(diff.id)
        val processEvent = events.lastOrNull { e ->
            e.eventType.startsWith("PROCESS_M")
        }
        if (processEvent != null) {
            try {
                val changesJson = processEvent.changes
                val beforeMatch = Regex(""""diffQuantity"\s*:\s*(-?\d+)""")
                    .find(changesJson.substringBefore(""""after""""))
                if (beforeMatch != null) {
                    return beforeMatch.groupValues[1].toInt()
                }
            } catch (_: Exception) {
                // Fall through to calculation
            }
        }
        return diff.sentQuantity - diff.receiveQuantity
    }

    private fun recordDiffEvent(
        diff: ReceiveDiff, eventType: String,
        beforeSnapshot: String, note: String,
        operator: String = diff.updatedBy ?: "system",
    ) {
        val nextSeq = diffEventRepo.findMaxEventSeq(diff.id) + 1
        val afterSnapshot = diffSnapshot(diff)
        val changes = """{"before":$beforeSnapshot,"after":$afterSnapshot}"""
        diffEventRepo.save(ReceiveDiffEvent(
            diffId = diff.id,
            logisticNum = diff.logisticNum,
            eventType = eventType,
            eventSeq = nextSeq,
            changes = changes,
            note = note,
            operator = operator,
        ))
    }

    private fun diffSnapshot(diff: ReceiveDiff): String {
        val note = diff.resolutionNote?.let { "\"${it.replace("\"", "\\\"")}\"" } ?: "null"
        return """{"status":"${diff.status}","diffQuantity":${diff.diffQuantity},"sentQuantity":${diff.sentQuantity},"receiveQuantity":${diff.receiveQuantity},"poQuantity":${diff.poQuantity},"resolutionNote":$note}"""
    }
}
