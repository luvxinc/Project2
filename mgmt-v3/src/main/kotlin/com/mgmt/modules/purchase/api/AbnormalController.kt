package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import com.mgmt.modules.purchase.domain.model.ReceiveDiffEvent
import com.mgmt.modules.purchase.domain.repository.*
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Instant

/**
 * AbnormalController — Receive-diff (入库异常) management REST API.
 *
 * V1 parity endpoints:
 *   abnormal.py:abnormal_list_api      → GET  /purchase/abnormal               (异常列表)
 *   abnormal.py:abnormal_detail_api    → GET  /purchase/abnormal/{logisticNum}  (异常详情)
 *   abnormal.py:abnormal_history_api   → GET  /purchase/abnormal/{logisticNum}/history
 *   abnormal.py:abnormal_process_api   → POST /purchase/abnormal/process       (Phase 2)
 *   abnormal.py:abnormal_delete_api    → POST /purchase/abnormal/delete        (Phase 2)
 */
@RestController
@RequestMapping("/purchase/abnormal")
class AbnormalController(
    private val diffRepo: ReceiveDiffRepository,
    private val receiveRepo: ReceiveRepository,
    private val strategyRepo: PurchaseOrderStrategyRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val shipmentRepo: ShipmentRepository,
    private val diffEventRepo: ReceiveDiffEventRepository,
) {

    // ═══════════════════════════════════════
    // LIST — V1: abnormal_list_api
    // Groups receive_diffs by logisticNum.
    // Status logic:
    //   - If resolutionNote LIKE '删除异常处理%' → 'deleted'
    //   - If SUM(ABS(diffQuantity)) == 0       → 'resolved'
    //   - Else                                  → 'pending'
    // ═══════════════════════════════════════
    @GetMapping
    @RequirePermission("module.purchase.receive.mgmt")
    fun list(
        @RequestParam(defaultValue = "desc") sortOrder: String,
        @RequestParam(defaultValue = "") status: String,
    ): ApiResponse<List<AbnormalListResponse>> {
        val allDiffs = diffRepo.findAll()

        // Group by logisticNum
        val grouped = allDiffs.groupBy { it.logisticNum }

        val items = grouped.map { (logisticNum, diffs) ->
            val derivedStatus = deriveGroupStatus(diffs)

            // Get receiveDate from the first Receive linked to this logisticNum
            val receiveDate = diffs.firstNotNullOfOrNull { d ->
                receiveRepo.findByIdAndDeletedAtIsNull(d.receiveId)?.receiveDate?.toString()
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
        val sorted = if (sortOrder.lowercase() == "asc") {
            filtered.sortedBy { it.receiveDate }
        } else {
            filtered.sortedByDescending { it.receiveDate }
        }

        return ApiResponse.ok(sorted)
    }

    // ═══════════════════════════════════════
    // DETAIL — V1: abnormal_detail_api
    // Returns per-SKU diff items with price + currency enrichment.
    // ═══════════════════════════════════════
    @GetMapping("/{logisticNum}")
    @RequirePermission("module.purchase.receive.mgmt")
    fun detail(@PathVariable logisticNum: String): ApiResponse<AbnormalDetailResponse> {
        val diffs = diffRepo.findAllByLogisticNum(logisticNum)
        if (diffs.isEmpty()) {
            return ApiResponse.ok(AbnormalDetailResponse(
                logisticNum = logisticNum,
                receiveDate = "",
                overallStatus = "pending",
                items = emptyList(),
                summary = AbnormalSummary(0, 0, 0, 0),
            ))
        }

        // Get receiveDate from linked Receive
        val receiveDate = diffs.firstNotNullOfOrNull { d ->
            receiveRepo.findByIdAndDeletedAtIsNull(d.receiveId)?.receiveDate?.toString()
        } ?: ""

        // Build price map: (poNum, sku) → unitPrice from Receive
        val receives = receiveRepo.findAllByLogisticNumOrderBySkuAsc(logisticNum)
        val priceMap = receives.groupBy { it.poNum to it.sku }
            .mapValues { (_, list) -> list.first().unitPrice.toDouble() }

        // Build currency map: poNum → currency from PurchaseOrderStrategy
        // V1: SELECT cur_currency FROM in_po_strategy WHERE po_num = :po_num
        // V3: PurchaseOrderStrategy has poNum + currency directly
        val poNums = diffs.map { it.poNum }.distinct()
        val currencyMap = mutableMapOf<String, String>()
        try {
            for (poNum in poNums) {
                val strategy = strategyRepo.findByPoNum(poNum)
                currencyMap[poNum] = strategy?.currency ?: "RMB"
            }
        } catch (_: Exception) {
            // Best-effort — if strategy lookup fails, default to RMB
            poNums.forEach { currencyMap.putIfAbsent(it, "RMB") }
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

        return ApiResponse.ok(AbnormalDetailResponse(
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
        ))
    }

    // ═══════════════════════════════════════
    // HISTORY — V1: abnormal_history_api
    // Returns append-only event trail from receive_diff_events.
    // V1: reads from in_diff (log table).
    // V3: reads from receive_diff_events (append-only audit trail).
    // ═══════════════════════════════════════
    @GetMapping("/{logisticNum}/history")
    @RequirePermission("module.purchase.receive.mgmt")
    fun history(@PathVariable logisticNum: String): ApiResponse<List<Map<String, Any?>>> {
        val events = diffEventRepo.findAllByLogisticNumOrderByEventSeqAsc(logisticNum)

        val items = events.map { e ->
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

        return ApiResponse.ok(items)
    }

    // ═══════════════════════════════════════
    // PROCESS — V1: abnormal_process_api
    // Applies one of 4 strategies per PO:
    //   M1: Fix shipment only
    //   M2: Fix shipment + PO
    //   M3: Delay (future receive for shortage)
    //   M4: Vendor error (adjust all tables)
    // ═══════════════════════════════════════
    @PostMapping("/process")
    @RequirePermission("module.purchase.receive.mgmt")
    @AuditLog(module = "PURCHASE", action = "PROCESS_ABNORMAL", riskLevel = "HIGH")
    @SecurityLevel(level = "L3", actionKey = "btn_abnormal_process")
    fun process(@RequestBody request: ProcessAbnormalRequest): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val diffs = diffRepo.findAllByLogisticNum(request.logisticNum)
            .filter { it.status == "pending" }

        if (diffs.isEmpty()) {
            return ResponseEntity.badRequest().body(
                ApiResponse.error("No pending diffs for logistic ${request.logisticNum}")
            )
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

        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "logisticNum" to request.logisticNum,
            "processedCount" to processed.size,
            "details" to processed,
        )))
    }

    /**
     * M1: Fix shipment only — set shipment_item.quantity = receive_quantity
     * V1: _process_method_1 — modifies in_send_list, in_send_final, in_receive_final.sent_quantity
     */
    private fun processM1(diff: ReceiveDiff, notePrefix: String) {
        // Update shipment_items: set quantity = receive_quantity
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.receiveQuantity
            si.note = "$notePrefix #M1"
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        // Update receive.sentQuantity to match
        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.receiveQuantity
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }

        // Resolve diff
        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.diffQuantity = 0
        diff.resolutionNote = "$notePrefix #M1"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M1", beforeSnapshot, "$notePrefix #M1")
    }

    /**
     * M2: Fix shipment + PO — M1 + update PO item quantity
     * V1: _process_method_2
     */
    private fun processM2(diff: ReceiveDiff, notePrefix: String) {
        // First do everything M1 does
        processM1Partial(diff, notePrefix)

        // Also update PO item quantity
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = diff.receiveQuantity
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        // Resolve diff
        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.diffQuantity = 0
        diff.resolutionNote = "$notePrefix #M2"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M2", beforeSnapshot, "$notePrefix #M2")
    }

    /**
     * M3: Delay — create a future receive for the shortage
     * V1: _process_method_3 — only for diff > 0 (under-received)
     */
    private fun processM3(diff: ReceiveDiff, notePrefix: String, delayDate: String?) {
        if (diff.diffQuantity <= 0) return  // M3 only for shortage

        val delayLocalDate = delayDate?.let { java.time.LocalDate.parse(it) }
            ?: java.time.LocalDate.now().plusDays(30)

        // Create a new shipment for the delay shipment
        val delayLogistic = "${diff.logisticNum}_delay_V01"
        val shipment = com.mgmt.modules.purchase.domain.model.Shipment().apply {
            logisticNum = delayLogistic
            sentDate = delayLocalDate
            status = "pending"
            pallets = 0
            totalWeight = java.math.BigDecimal.ZERO
            priceKg = java.math.BigDecimal.ZERO
            logisticsCost = java.math.BigDecimal.ZERO
            exchangeRate = java.math.BigDecimal.ONE
            rateMode = "M"
            createdBy = "system"
            updatedBy = "system"
            note = "$notePrefix #M3 delay from ${diff.logisticNum}"
        }
        shipmentRepo.save(shipment)

        // Create shipment item
        val si = com.mgmt.modules.purchase.domain.model.ShipmentItem().apply {
            shipmentId = shipment.id
            logisticNum = delayLogistic
            poId = receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
                .firstOrNull { it.poNum == diff.poNum }?.poId ?: 0
            poNum = diff.poNum
            sku = diff.sku
            quantity = diff.diffQuantity   // shortage amount
            unitPrice = java.math.BigDecimal.ZERO
            poChange = false
            note = "$notePrefix #M3"
            createdBy = "system"
            updatedBy = "system"
        }
        shipmentItemRepo.save(si)

        // Resolve diff
        val beforeSnapshot = diffSnapshot(diff)
        diff.status = "resolved"
        diff.resolutionNote = "$notePrefix #M3 → delay shipment $delayLogistic"
        diff.updatedAt = Instant.now()
        diffRepo.save(diff)
        recordDiffEvent(diff, "PROCESS_M3", beforeSnapshot, "$notePrefix #M3 → $delayLogistic")
    }

    /**
     * M4: Vendor error — adjust PO, shipment, and receive to reconcile
     * V1: _process_method_4
     */
    private fun processM4(diff: ReceiveDiff, notePrefix: String) {
        val adjustQty = diff.diffQuantity  // positive=shortage, negative=overage
        val isOverage = adjustQty < 0

        // Adjust PO item: add/subtract the diff
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = pi.quantity - adjustQty   // shortage: +diff, overage: -(-diff) = +|diff|
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        // Adjust shipment item: set to receive_quantity
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.receiveQuantity
            si.note = "$notePrefix #M4"
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        // Adjust receive: set sentQuantity = receiveQuantity
        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.receiveQuantity
                // For overage at unit price 0 (free goods)
                if (isOverage) {
                    r.note = "$notePrefix #M4 vendor overage, extra units at cost=0"
                }
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }

        // Resolve diff
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

    // ═══════════════════════════════════════
    // DELETE (ROLLBACK) — V1: abnormal_delete_api
    // Full V1-parity rollback: revert all changes made by process strategies,
    // reset diff to pending, and record ROLLBACK audit event.
    // More audit-compliant than V1 (which physically deleted log records).
    // ═══════════════════════════════════════
    @PostMapping("/delete")
    @RequirePermission("module.purchase.receive.mgmt")
    @AuditLog(module = "PURCHASE", action = "ROLLBACK_ABNORMAL", riskLevel = "HIGH")
    @SecurityLevel(level = "L3", actionKey = "btn_abnormal_delete")
    fun delete(@RequestBody request: DeleteAbnormalRequest): ResponseEntity<ApiResponse<Map<String, Any>>> {
        val diffs = diffRepo.findAllByLogisticNum(request.logisticNum)
            .filter { it.status == "resolved" }

        if (diffs.isEmpty()) {
            return ResponseEntity.badRequest().body(
                ApiResponse.error("No resolved diffs to delete for ${request.logisticNum}")
            )
        }

        var rolledBackCount = 0
        for (diff in diffs) {
            // 1. Parse which strategy was used from resolutionNote (#M1/#M2/#M3/#M4)
            val strategy = parseStrategy(diff.resolutionNote)

            // 2. Find the original diffQuantity from the PROCESS event's before-snapshot
            val originalDiffQuantity = findOriginalDiffQuantity(diff)

            // 3. Rollback related table changes based on strategy
            rollbackStrategy(diff, strategy)

            // 4. Record ROLLBACK event BEFORE mutating (captures resolved→pending transition)
            val beforeSnapshot = diffSnapshot(diff)

            // 5. Reset diff to pending state with original diffQuantity
            diff.status = "pending"
            diff.diffQuantity = originalDiffQuantity
            diff.resolutionNote = null
            diff.updatedAt = Instant.now()
            diffRepo.save(diff)

            recordDiffEvent(diff, "ROLLBACK", beforeSnapshot, "撤销异常处理 (原策略: M$strategy)")
            rolledBackCount++
        }

        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "logisticNum" to request.logisticNum,
            "deletedCount" to rolledBackCount,
        )))
    }

    /**
     * Parse strategy number from resolutionNote.
     * Expected format: "...#M1", "...#M2", "...#M3", "...#M4"
     * Returns 1 as default if parsing fails.
     */
    private fun parseStrategy(note: String?): Int {
        if (note == null) return 1
        val match = Regex("#M(\\d)").find(note) ?: return 1
        return match.groupValues[1].toIntOrNull() ?: 1
    }

    /**
     * Find the original diffQuantity from the PROCESS event's before-snapshot.
     * Reads the append-only event trail to recover the pre-process state.
     */
    private fun findOriginalDiffQuantity(diff: ReceiveDiff): Int {
        val events = diffEventRepo.findAllByDiffIdOrderByEventSeqAsc(diff.id)
        // Find the PROCESS event (PROCESS_M1..M4) — take the latest one
        val processEvent = events.lastOrNull { e ->
            e.eventType.startsWith("PROCESS_M")
        }
        if (processEvent != null) {
            try {
                // Parse changes JSON: {"before":{...},"after":{...}}
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
        // Fallback: recalculate from sent - received
        return diff.sentQuantity - diff.receiveQuantity
    }

    /**
     * Rollback changes based on the strategy that was applied during processing.
     * Reverts shipment_items, receives, and po_items to pre-process state.
     */
    private fun rollbackStrategy(diff: ReceiveDiff, strategy: Int) {
        when (strategy) {
            1 -> rollbackM1(diff)
            2 -> rollbackM2(diff)
            3 -> rollbackM3(diff)
            4 -> rollbackM4(diff)
        }
    }

    /**
     * Rollback M1: Restore shipment_item.quantity and receive.sentQuantity
     * to their original values (sentQuantity from the diff record).
     */
    private fun rollbackM1(diff: ReceiveDiff) {
        // Restore shipment items: quantity back to original sentQuantity
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.sentQuantity
            si.note = null  // Clear the process note
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        // Restore receives: sentQuantity back to original
        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.sentQuantity
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }
    }

    /**
     * Rollback M2: M1 rollback + restore PO item quantity.
     */
    private fun rollbackM2(diff: ReceiveDiff) {
        // Do M1 rollback first
        rollbackM1(diff)

        // Restore PO item quantity: undo the receive_quantity overwrite
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = diff.poQuantity  // Restore to original PO quantity
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }
    }

    /**
     * Rollback M3: Soft-delete the delay shipment and its items.
     * M3 created a new shipment "{logisticNum}_delay_V##".
     */
    private fun rollbackM3(diff: ReceiveDiff) {
        // Find delay shipments matching the pattern
        val delayPattern = "${diff.logisticNum}_delay_"
        val allShipments = shipmentRepo.findAll()
        val delayShipments = allShipments.filter { s ->
            s.logisticNum.startsWith(delayPattern) && s.deletedAt == null
        }

        for (delayShipment in delayShipments) {
            // Soft-delete delay shipment items matching this diff's poNum+sku
            val delayItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(delayShipment.logisticNum)
            val matchingItems = delayItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }
            matchingItems.forEach { si ->
                si.deletedAt = Instant.now()
                si.updatedAt = Instant.now()
                shipmentItemRepo.save(si)
            }

            // If no active items remain, soft-delete the shipment itself
            val remainingItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(delayShipment.logisticNum)
            if (remainingItems.isEmpty()) {
                delayShipment.deletedAt = Instant.now()
                delayShipment.updatedAt = Instant.now()
                shipmentRepo.save(delayShipment)
            }
        }
    }

    /**
     * Rollback M4: Restore PO, shipment, and receive changes.
     * M4 adjusted PO item quantity and set shipment/receive to receiveQuantity.
     */
    private fun rollbackM4(diff: ReceiveDiff) {
        // Restore PO item: undo the quantity adjustment
        // M4 did: pi.quantity = pi.quantity - adjustQty
        // Rollback: pi.quantity = pi.quantity + adjustQty (where adjustQty = original diffQuantity)
        val originalDiffQuantity = findOriginalDiffQuantity(diff)
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(diff.poNum)
        poItems.filter { it.sku == diff.sku }.forEach { pi ->
            pi.quantity = pi.quantity + originalDiffQuantity  // Undo the M4 PO adjustment
            pi.updatedAt = Instant.now()
            poItemRepo.save(pi)
        }

        // Restore shipment items: quantity back to original sentQuantity
        val shipItems = shipmentItemRepo.findAllByLogisticNumAndDeletedAtIsNull(diff.logisticNum)
        shipItems.filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { si ->
            si.quantity = diff.sentQuantity
            si.note = null
            si.updatedAt = Instant.now()
            shipmentItemRepo.save(si)
        }

        // Restore receives: sentQuantity back to original
        receiveRepo.findAllByLogisticNumOrderBySkuAsc(diff.logisticNum)
            .filter { it.poNum == diff.poNum && it.sku == diff.sku }.forEach { r ->
                r.sentQuantity = diff.sentQuantity
                r.note = null
                r.updatedAt = Instant.now()
                receiveRepo.save(r)
            }
    }

    // ═══════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════

    /**
     * Status derivation:
     *   - If ALL diffs have status='resolved' → 'resolved'
     *   - Else → 'pending'
     *
     * Note: 'deleted' status removed — we now do full rollbacks instead
     * of marking as deleted. The append-only event trail (ROLLBACK events)
     * provides complete audit history.
     */
    private fun deriveGroupStatus(diffs: List<ReceiveDiff>): String {
        val allResolved = diffs.all { it.status == "resolved" }
        return if (allResolved) "resolved" else "pending"
    }

    /** Record an append-only audit event — mirrors ShipmentUseCase.recordEvent */
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

    /** Snapshot current diff state as compact JSON string */
    private fun diffSnapshot(diff: ReceiveDiff): String {
        val note = diff.resolutionNote?.let { "\"${it.replace("\"", "\\\"")}\"" } ?: "null"
        return """{"status":"${diff.status}","diffQuantity":${diff.diffQuantity},"sentQuantity":${diff.sentQuantity},"receiveQuantity":${diff.receiveQuantity},"poQuantity":${diff.poQuantity},"resolutionNote":$note}"""
    }
}
