package com.mgmt.modules.vma

import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * VmaInventoryTransactionService — 库存事务管理
 *
 * V2 parity: inventory-transaction.service.ts (505 lines)
 *
 * Available = REC_CN + REC_CASE - OUT_CASE - OUT_CN - MOVE_DEMO + RETURN_DEMO
 * WIP       = OUT_CASE - REC_CASE - USED_CASE
 */
@Service
@Transactional
class VmaInventoryTransactionService(
    private val txnRepo: VmaInventoryTransactionRepository,
    private val batchRepo: VmaReceivingBatchRepository,
    private val pvRepo: VmaPValveProductRepository,
    private val dsRepo: VmaDeliverySystemProductRepository,
    private val employeeRepo: VmaEmployeeRepository,
    private val fridgeSlotRepo: VmaFridgeSlotRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)
    private val pacific = ZoneId.of("America/Los_Angeles")

    private fun parsePacificDate(dateStr: String): LocalDate =
        LocalDate.parse(dateStr)  // Date strings from frontend are already in Pacific locale (R1 compliance)

    // ═══════════ CRUD ═══════════

    fun findAll(productType: String? = null): List<VmaInventoryTransaction> =
        if (productType != null) {
            txnRepo.findAllByProductTypeAndDeletedAtIsNullOrderByDateDesc(VmaProductType.valueOf(productType))
        } else {
            txnRepo.findAllByDeletedAtIsNullOrderByDateDesc()
        }

    fun findOne(id: String): VmaInventoryTransaction =
        txnRepo.findById(id).filter { it.deletedAt == null }
            .orElseThrow { NotFoundException("Transaction $id not found") }

    fun getActiveOperators(): List<String> {
        val employees = employeeRepo.findAll()
            .filter { it.status == VmaEmployeeStatus.ACTIVE && it.deletedAt == null }
            .sortedWith(compareBy({ it.lastName }, { it.firstName }))
        return employees.map { "${it.firstName} ${it.lastName}" }
    }

    fun create(dto: CreateInventoryTransactionRequest): VmaInventoryTransaction {
        val txn = txnRepo.save(VmaInventoryTransaction(
            id = UUID.randomUUID().toString(),
            date = parsePacificDate(dto.date),
            action = VmaInventoryAction.valueOf(dto.action),
            productType = VmaProductType.valueOf(dto.productType),
            specNo = dto.specNo,
            serialNo = dto.serialNo,
            qty = dto.qty,
            expDate = dto.expDate?.let { parsePacificDate(it) },
            inspection = dto.inspection?.let { VmaInspectionResult.valueOf(it) },
            notes = dto.notes,
            caseId = dto.caseId,
            operator = dto.operator,
            location = dto.location,
            batchNo = dto.batchNo,
            condition = dto.condition?.toTypedArray() ?: arrayOf(),
        ))

        // Auto-remove from fridge when product leaves inventory
        val action = VmaInventoryAction.valueOf(dto.action)
        if (action == VmaInventoryAction.OUT_CASE || action == VmaInventoryAction.OUT_CN) {
            clearFridgeSlotBySerial(dto.specNo, dto.serialNo)
        }

        return txn
    }

    fun update(id: String, dto: UpdateInventoryTransactionRequest): VmaInventoryTransaction {
        val txn = findOne(id)
        dto.date?.let { txn.date = parsePacificDate(it) }
        dto.action?.let { txn.action = VmaInventoryAction.valueOf(it) }
        dto.productType?.let { txn.productType = VmaProductType.valueOf(it) }
        dto.specNo?.let { txn.specNo = it }
        dto.serialNo?.let { txn.serialNo = it }
        dto.qty?.let { txn.qty = it }
        dto.expDate?.let { txn.expDate = parsePacificDate(it) }
        dto.inspection?.let { txn.inspection = VmaInspectionResult.valueOf(it) }
        dto.notes?.let { txn.notes = it }
        dto.caseId?.let { txn.caseId = it }
        dto.operator?.let { txn.operator = it }
        dto.location?.let { txn.location = it }
        dto.batchNo?.let { txn.batchNo = it }
        dto.condition?.let { txn.condition = it.toTypedArray() }
        txn.updatedAt = Instant.now()
        return txnRepo.save(txn)
    }

    fun remove(id: String): VmaInventoryTransaction {
        val txn = findOne(id)
        require(txn.action == VmaInventoryAction.OUT_CN) {
            "Only Return to China (OUT_CN) transactions can be deleted. This transaction is ${txn.action}."
        }
        txn.deletedAt = Instant.now()
        log.info("Soft-deleted OUT_CN transaction {} — specNo={}, serialNo={}, qty={}",
            txn.id, txn.specNo, txn.serialNo, txn.qty)
        return txnRepo.save(txn)
    }

    // ═══════════ Batch Operations ═══════════

    fun upsertReceivingBatch(dto: ReceiveFromChinaRequest): VmaReceivingBatch {
        val dateReceived = parsePacificDate(dto.dateTimeReceived.take(10))
        val timeReceived = if (dto.dateTimeReceived.length > 10) dto.dateTimeReceived.substring(11) else null

        val existing = batchRepo.findByBatchNo(dto.batchNo)
        val batch = if (existing != null) {
            existing.poNo = dto.poNo
            existing.dateShipped = parsePacificDate(dto.dateShipped)
            existing.dateReceived = dateReceived
            existing.timeReceived = timeReceived
            existing.operator = dto.operator
            existing.comments = dto.comments
            existing.updatedAt = Instant.now()
            batchRepo.save(existing)
        } else {
            batchRepo.save(VmaReceivingBatch(
                id = UUID.randomUUID().toString(),
                batchNo = dto.batchNo,
                poNo = dto.poNo,
                dateShipped = parsePacificDate(dto.dateShipped),
                dateReceived = dateReceived,
                timeReceived = timeReceived,
                operator = dto.operator,
                comments = dto.comments,
            ))
        }
        return batch
    }

    fun findBatchWithTransactions(batchNo: String): Map<String, Any> {
        val batch = batchRepo.findByBatchNo(batchNo)
            ?: throw NotFoundException("Batch $batchNo not found")
        val txns = txnRepo.findAllByBatchNoAndDeletedAtIsNull(batchNo)
            .filter { it.action == VmaInventoryAction.REC_CN }
        return mapOf("batch" to batch, "transactions" to txns)
    }

    fun findBatchByBatchNo(batchNo: String): VmaReceivingBatch? =
        batchRepo.findByBatchNo(batchNo)

    fun findAllByBatchNo(batchNo: String): List<VmaInventoryTransaction> =
        txnRepo.findAllByBatchNoAndDeletedAtIsNull(batchNo)

    // ═══════════ Spec Options ═══════════

    fun getSpecOptions(productType: String): List<Map<String, String>> {
        return if (productType == "PVALVE") {
            pvRepo.findAllByIsActiveTrueOrderByModelAscSpecificationAsc()
                .map { mapOf("specification" to it.specification, "model" to it.model) }
        } else {
            dsRepo.findAllByIsActiveTrueOrderByModelAscSpecificationAsc()
                .map { mapOf("specification" to it.specification, "model" to it.model) }
        }
    }

    // ═══════════ Inventory Summary ═══════════

    fun getInventorySummary(productType: String): List<Map<String, Any>> {
        val pt = VmaProductType.valueOf(productType)
        val txns = txnRepo.findAllByProductTypeAndDeletedAtIsNullOrderByDateDesc(pt)

        val availMult = mapOf(
            VmaInventoryAction.REC_CN to 1, VmaInventoryAction.REC_CASE to 1,
            VmaInventoryAction.OUT_CASE to -1, VmaInventoryAction.OUT_CN to -1,
            VmaInventoryAction.MOVE_DEMO to -1, VmaInventoryAction.USED_CASE to 0,
            VmaInventoryAction.RETURN_DEMO to 1,
        )
        val wipMult = mapOf(
            VmaInventoryAction.OUT_CASE to 1, VmaInventoryAction.REC_CASE to -1,
            VmaInventoryAction.USED_CASE to -1,
            VmaInventoryAction.REC_CN to 0, VmaInventoryAction.OUT_CN to 0,
            VmaInventoryAction.MOVE_DEMO to 0, VmaInventoryAction.RETURN_DEMO to 0,
        )

        val today = LocalDate.now()
        val in30Days = today.plusDays(30)

        data class Entry(var available: Int = 0, var wip: Int = 0, var nearExp: Int = 0, var expired: Int = 0, var used: Int = 0, var returned: Int = 0)
        val specMap = mutableMapOf<String, Entry>()

        // Pass 1: totals per (specNo, action)
        val grouped = txns.groupBy { it.specNo to it.action }
        for ((key, group) in grouped) {
            val (specNo, action) = key
            val entry = specMap.getOrPut(specNo) { Entry() }
            val totalQty = group.sumOf { it.qty }
            entry.available += totalQty * (availMult[action] ?: 0)
            entry.wip += totalQty * (wipMult[action] ?: 0)
            if (action == VmaInventoryAction.USED_CASE) entry.used += totalQty
            if (action == VmaInventoryAction.OUT_CN) entry.returned += totalQty
        }

        // Pass 2: expiry tracking
        val shelfActions = setOf(
            VmaInventoryAction.REC_CN, VmaInventoryAction.REC_CASE,
            VmaInventoryAction.OUT_CASE, VmaInventoryAction.OUT_CN,
            VmaInventoryAction.MOVE_DEMO, VmaInventoryAction.RETURN_DEMO,
        )
        val expMap = mutableMapOf<String, Int>()  // "specNo|expDate" → net qty
        for (txn in txns) {
            if (txn.action !in shelfActions || txn.expDate == null) continue
            val am = availMult[txn.action] ?: 0
            if (am == 0) continue
            val key = "${txn.specNo}|${txn.expDate}"
            expMap[key] = (expMap[key] ?: 0) + txn.qty * am
        }

        for ((key, net) in expMap) {
            if (net <= 0) continue
            val (specNo, dateStr) = key.split("|")
            val expDate = LocalDate.parse(dateStr)
            val entry = specMap.getOrPut(specNo) { Entry() }
            when {
                expDate < today -> entry.expired += net
                expDate <= in30Days -> entry.nearExp += net
            }
        }

        return specMap.entries
            .sortedBy { it.key }
            .map { (specNo, data) ->
                mapOf(
                    "specNo" to specNo as Any,
                    "available" to maxOf(0, data.available),
                    "wip" to maxOf(0, data.wip),
                    "approachingExp" to maxOf(0, data.nearExp),
                    "expired" to maxOf(0, data.expired),
                    "used" to data.used,
                    "returned" to data.returned,
                )
            }
    }

    // ═══════════ Inventory Detail ═══════════

    fun getInventoryDetail(specNo: String, productType: String): Map<String, List<InventoryDetailRow>> {
        val pt = VmaProductType.valueOf(productType)
        val txns = txnRepo.findAllBySpecNoAndProductTypeAndDeletedAtIsNull(specNo, pt)
            .filter { it.action != VmaInventoryAction.MOVE_DEMO && it.action != VmaInventoryAction.RETURN_DEMO }

        val today = LocalDate.now()
        val in30Days = today.plusDays(30)

        // Group by serialNo
        val serialMap = txns.groupBy { it.serialNo ?: "__no_serial__" }

        val available = mutableListOf<InventoryDetailRow>()
        val wip = mutableListOf<InventoryDetailRow>()
        val nearExp = mutableListOf<InventoryDetailRow>()
        val expired = mutableListOf<InventoryDetailRow>()
        val returnedToCn = mutableListOf<InventoryDetailRow>()

        for ((serialKey, serialTxns) in serialMap) {
            var recCn = 0; var outCase = 0; var recCase = 0; var usedCase = 0; var outCn = 0
            var recDate: LocalDate? = null; var outCnDate: LocalDate? = null
            var batchNo = ""; var operator = ""; var expDate: LocalDate? = null

            for (txn in serialTxns) {
                when (txn.action) {
                    VmaInventoryAction.REC_CN -> {
                        recCn += txn.qty
                        if (recDate == null || txn.date < recDate) {
                            recDate = txn.date; batchNo = txn.batchNo ?: ""
                            operator = txn.operator ?: ""; expDate = txn.expDate
                        }
                    }
                    VmaInventoryAction.OUT_CASE -> outCase += txn.qty
                    VmaInventoryAction.REC_CASE -> recCase += txn.qty
                    VmaInventoryAction.USED_CASE -> usedCase += txn.qty
                    VmaInventoryAction.OUT_CN -> {
                        outCn += txn.qty
                        if (outCnDate == null || txn.date > outCnDate) outCnDate = txn.date
                    }
                    else -> {}
                }
            }

            val sn = if (serialKey == "__no_serial__") null else serialKey
            val txnIds = serialTxns.map { it.id }

            val baseRow = InventoryDetailRow(
                batchNo = batchNo.ifEmpty { null },
                specNo = specNo,
                recDate = recDate?.toString(),
                serialNo = sn,
                expDate = expDate?.toString(),
                quantity = 0,
                actionDate = null,
                operator = operator.ifEmpty { null },
                transactionIds = txnIds,
            )

            if (outCn > 0) {
                returnedToCn.add(baseRow.copy(quantity = outCn, actionDate = outCnDate?.toString()))
            }

            val inWip = maxOf(0, outCase - recCase - usedCase)
            if (inWip > 0) wip.add(baseRow.copy(quantity = inWip))

            val onShelf = maxOf(0, recCn + recCase - outCase - outCn)
            if (onShelf > 0) {
                when {
                    expDate != null && expDate < today -> expired.add(baseRow.copy(quantity = onShelf))
                    expDate != null && expDate <= in30Days -> nearExp.add(baseRow.copy(quantity = onShelf))
                    else -> available.add(baseRow.copy(quantity = onShelf))
                }
            }
        }

        return mapOf(
            "available" to available, "wip" to wip,
            "nearExp" to nearExp, "expired" to expired, "returnedToCn" to returnedToCn,
        )
    }

    // ═══════════ Returnable Inventory (for Return to China) ═══════════

    /**
     * Returns items that can be returned to China, grouped by serialNo.
     * Includes: Available + NearExp + Expired + Demo (all types)
     * Excludes: WIP (items currently out for case)
     */
    fun getReturnableInventory(productType: String, specNo: String): List<Map<String, Any?>> {
        val pt = VmaProductType.valueOf(productType)
        val allTxns = txnRepo.findAllBySpecNoAndProductTypeAndDeletedAtIsNull(specNo, pt)
        val today = LocalDate.now()

        // Group by serialNo
        val serialMap = allTxns.groupBy { it.serialNo ?: "__no_serial__" }
        val result = mutableListOf<Map<String, Any?>>()

        for ((serialKey, serialTxns) in serialMap) {
            var recCn = 0; var outCase = 0; var recCase = 0; var usedCase = 0
            var outCn = 0; var moveDemo = 0; var returnDemo = 0
            var recDate: LocalDate? = null; var batchNo = ""; var expDate: LocalDate? = null

            for (txn in serialTxns) {
                when (txn.action) {
                    VmaInventoryAction.REC_CN -> {
                        recCn += txn.qty
                        if (recDate == null || txn.date < recDate) {
                            recDate = txn.date; batchNo = txn.batchNo ?: ""; expDate = txn.expDate
                        }
                    }
                    VmaInventoryAction.OUT_CASE -> outCase += txn.qty
                    VmaInventoryAction.OUT_TRIP -> outCase += txn.qty  // Trip checkout = same as case checkout
                    VmaInventoryAction.REC_CASE -> recCase += txn.qty
                    VmaInventoryAction.USED_CASE -> usedCase += txn.qty
                    VmaInventoryAction.OUT_CN -> outCn += txn.qty
                    VmaInventoryAction.MOVE_DEMO -> moveDemo += txn.qty
                    VmaInventoryAction.RETURN_DEMO -> returnDemo += txn.qty
                }
            }

            val sn = if (serialKey == "__no_serial__") null else serialKey

            // On-shelf (available, not in WIP) = REC_CN + REC_CASE - OUT_CASE - OUT_CN - MOVE_DEMO + RETURN_DEMO
            // But we want to INCLUDE items in demo, so: total physically present = on-shelf + in-demo
            // on-shelf = recCn + recCase - outCase - outCn - moveDemo + returnDemo
            // in-demo = moveDemo - returnDemo
            // physically present = on-shelf + in-demo = recCn + recCase - outCase - outCn
            // Exclude WIP: wip = outCase - recCase - usedCase → physically present excluding WIP:
            // = recCn - outCn - usedCase - (outCase - recCase - usedCase) ... let's reason differently:
            //
            // Total received = recCn
            // Returned to CN = outCn
            // Used in case = usedCase
            // In WIP = max(0, outCase - recCase - usedCase)
            // Returnable = recCn - outCn - usedCase - inWip
            val inWip = maxOf(0, outCase - recCase - usedCase)
            val returnable = recCn - outCn - usedCase - inWip

            if (returnable <= 0) continue

            result.add(mapOf(
                "serialNo" to (sn ?: ""),
                "batchNo" to batchNo,
                "recDate" to (recDate?.toString() ?: ""),
                "expDate" to (expDate?.toString() ?: ""),
                "quantity" to returnable,
                "specNo" to specNo,
                "productType" to productType,
            ))
        }

        // Sort by expDate ascending (earliest first), nulls/empty last
        return result.sortedBy {
            val ed = it["expDate"] as? String
            if (ed.isNullOrEmpty()) "9999-12-31" else ed
        }
    }

    // ═══════════ Demo Inventory ═══════════

    fun getDemoInventory(): List<Map<String, Any?>> {
        val today = LocalDate.now()
        val rows = mutableListOf<Map<String, Any?>>()

        // Single load — partition in memory (was 2x findAll before P-1 fix)
        val allTxns = txnRepo.findAllByDeletedAtIsNullOrderByDateDesc()

        // Build a set of RETURN_DEMO "cancellation keys" to exclude returned items
        // Key = "productType|specNo|serialNo" — a RETURN_DEMO cancels a MOVE_DEMO of the same product
        val returnDemoKeys = mutableMapOf<String, Int>()  // key → total returned qty
        for (txn in allTxns) {
            if (txn.action != VmaInventoryAction.RETURN_DEMO) continue
            val key = "${txn.productType}|${txn.specNo}|${txn.serialNo ?: ""}"
            returnDemoKeys[key] = (returnDemoKeys[key] ?: 0) + txn.qty
        }

        // Source 1: Explicit MOVE_DEMO transactions (exclude returned ones)
        val demoTxns = allTxns.filter { it.action == VmaInventoryAction.MOVE_DEMO }

        // Track remaining return budget per key
        val returnBudget = returnDemoKeys.toMutableMap()

        for (tx in demoTxns) {
            val key = "${tx.productType}|${tx.specNo}|${tx.serialNo ?: ""}"
            val budget = returnBudget[key] ?: 0
            if (budget >= tx.qty) {
                // This MOVE_DEMO is fully offset by RETURN_DEMO — skip it
                returnBudget[key] = budget - tx.qty
                continue
            }
            val effectiveQty = tx.qty - budget
            if (budget > 0) returnBudget[key] = 0

            val status = when {
                tx.notes?.startsWith("RECEIVING_AUTO") == true -> "Rejected (Receiving)"
                tx.notes?.startsWith("COMPLETION_AUTO") == true -> "Rejected (Case)"
                else -> "Manually Moved"
            }
            rows.add(mapOf(
                "id" to tx.id, "batchNo" to (tx.batchNo ?: ""),
                "productType" to tx.productType.name, "specNo" to tx.specNo,
                "recDate" to tx.date.toString(), "serialNo" to (tx.serialNo ?: ""),
                "expDate" to (tx.expDate?.toString() ?: ""), "qty" to effectiveQty,
                "status" to status, "notes" to (tx.notes ?: ""),
                "condition" to tx.condition.toList(),
                "date" to tx.date.toString(),
                "operator" to (tx.operator ?: ""),
                "location" to (tx.location ?: ""),
                "inspection" to (tx.inspection?.name ?: ""),
                "createdAt" to tx.createdAt.toString(),
            ))
        }

        // Source 2: Expired on-shelf (reuse same allTxns)
        val availMult = mapOf(
            VmaInventoryAction.REC_CN to 1, VmaInventoryAction.REC_CASE to 1,
            VmaInventoryAction.OUT_CASE to -1, VmaInventoryAction.OUT_CN to -1,
            VmaInventoryAction.MOVE_DEMO to -1, VmaInventoryAction.RETURN_DEMO to 1,
        )

        data class ShelfGroup(
            var onShelf: Int = 0, var batchNo: String? = null,
            var expDate: LocalDate? = null, var recDate: LocalDate? = null,
            var productType: VmaProductType = VmaProductType.PVALVE,
        )

        val shelfMap = mutableMapOf<String, ShelfGroup>()  // "pt|spec|serial"
        for (txn in allTxns) {
            val am = availMult[txn.action] ?: continue
            val key = "${txn.productType}|${txn.specNo}|${txn.serialNo ?: ""}"
            val g = shelfMap.getOrPut(key) { ShelfGroup(productType = txn.productType) }
            g.onShelf += txn.qty * am
            if (txn.action == VmaInventoryAction.REC_CN) {
                if (g.recDate == null || txn.date < g.recDate!!) {
                    g.recDate = txn.date; g.batchNo = txn.batchNo; g.expDate = txn.expDate
                }
            }
        }

        for ((key, g) in shelfMap) {
            if (g.onShelf <= 0 || g.expDate == null || g.expDate!! >= today) continue
            val parts = key.split("|")
            val sn = if (parts.size > 2) parts[2] else ""
            rows.add(mapOf(
                "id" to "expired-${parts[0]}-${parts[1]}-${sn.ifEmpty { "no-sn" }}",
                "batchNo" to (g.batchNo ?: ""),
                "productType" to parts[0], "specNo" to parts[1],
                "recDate" to (g.recDate?.toString() ?: ""), "serialNo" to sn,
                "expDate" to (g.expDate?.toString() ?: ""), "qty" to g.onShelf,
                "status" to "Expired", "notes" to "",
                "condition" to emptyList<Int>(),
                "date" to (g.expDate?.toString() ?: ""),
                "operator" to "",
                "location" to "",
                "inspection" to "",
                "createdAt" to "",
            ))
        }

        return rows.sortedByDescending { it["date"] as? String ?: "" }
    }

    // ═══════════ Fridge Shelf ═══════════

    fun getAllFridgeSlots(): List<FridgeSlotResponse> =
        fridgeSlotRepo.findAllByOrderByShelfNoAscRowNoAscColNoAsc().map { toFridgeSlotResponse(it) }

    fun placeFridgeSlot(dto: PlaceFridgeSlotRequest): FridgeSlotResponse {
        // Validate shelf range
        require(dto.shelfNo in 1..10) { "Shelf number must be 1-10" }
        require(dto.rowNo in 1..3) { "Row must be 1-3" }
        require(dto.colNo in 1..4) { "Column must be 1-4" }

        // Check slot is not occupied
        val existing = fridgeSlotRepo.findByShelfNoAndRowNoAndColNo(dto.shelfNo, dto.rowNo, dto.colNo)
        require(existing == null) { "Slot ${dto.shelfNo}-${dto.rowNo}-${dto.colNo} is already occupied" }

        val slot = VmaFridgeSlot(
            id = java.util.UUID.randomUUID().toString(),
            shelfNo = dto.shelfNo,
            rowNo = dto.rowNo,
            colNo = dto.colNo,
            productType = VmaProductType.valueOf(dto.productType),
            specNo = dto.specNo,
            serialNo = dto.serialNo,
            placedBy = dto.placedBy,
            placedAt = Instant.now(),
            createdAt = Instant.now(),
        )
        fridgeSlotRepo.save(slot)
        log.info("Placed product {} (SN: {}) in fridge slot {}-{}-{}", dto.specNo, dto.serialNo, dto.shelfNo, dto.rowNo, dto.colNo)
        return toFridgeSlotResponse(slot)
    }

    fun removeFridgeSlot(id: String) {
        val slot = fridgeSlotRepo.findById(id).orElseThrow { NotFoundException("Fridge slot not found: $id") }
        fridgeSlotRepo.delete(slot)
        log.info("Removed product from fridge slot {}-{}-{}", slot.shelfNo, slot.rowNo, slot.colNo)
    }

    /**
     * Auto-cleanup: remove product from fridge when it leaves inventory.
     * Called when OUT_CASE (WIP) or OUT_CN (return to China) transaction is created.
     */
    fun clearFridgeSlotBySerial(specNo: String, serialNo: String?) {
        if (serialNo == null) return
        val slots = fridgeSlotRepo.findAllBySpecNoAndSerialNo(specNo, serialNo)
        if (slots.isNotEmpty()) {
            fridgeSlotRepo.deleteAll(slots)
            log.info("Auto-cleared {} fridge slot(s) for {} SN:{}", slots.size, specNo, serialNo)
        }
    }

    private fun toFridgeSlotResponse(slot: VmaFridgeSlot): FridgeSlotResponse {
        // Look up batch/exp from the latest inventory transaction with matching serialNo
        val inv = slot.serialNo?.let {
            txnRepo.findFirstBySerialNoAndDeletedAtIsNullOrderByDateDesc(it)
        }
        return FridgeSlotResponse(
            id = slot.id,
            shelfNo = slot.shelfNo,
            rowNo = slot.rowNo,
            colNo = slot.colNo,
            productType = slot.productType.name,
            specNo = slot.specNo,
            serialNo = slot.serialNo,
            batchNo = inv?.batchNo,
            expDate = inv?.expDate?.toString(),
            placedAt = slot.placedAt,
            placedBy = slot.placedBy,
        )
    }

    /**
     * Returns all P-Valve products eligible for fridge placement.
     * Eligible statuses: Available, NearExp, Expired, Demo.
     * Each product includes whether it's already placed in the fridge.
     */
    fun getEligibleFridgeProducts(): Map<String, List<FridgeEligibleProduct>> {
        val today = LocalDate.now()
        val in30Days = today.plusDays(30)
        val results = mutableListOf<FridgeEligibleProduct>()

        // Get all fridge slots to mark "already in fridge"
        val fridgeSerials = fridgeSlotRepo.findAllByOrderByShelfNoAscRowNoAscColNoAsc()
            .filter { it.serialNo != null }
            .map { "${it.specNo}|${it.serialNo}" }
            .toSet()

        // ─── Source 1: On-shelf inventory (Available + NearExp + Expired) ───
        val allTxns = txnRepo.findAllByProductTypeAndDeletedAtIsNullOrderByDateDesc(VmaProductType.PVALVE)
        val nonDemoTxns = allTxns.filter {
            it.action != VmaInventoryAction.MOVE_DEMO && it.action != VmaInventoryAction.RETURN_DEMO
        }
        val serialMap = nonDemoTxns.groupBy { "${it.specNo}|${it.serialNo ?: "__none__"}" }

        for ((key, txns) in serialMap) {
            val parts = key.split("|")
            val specNo = parts[0]
            val serialNo = parts.getOrElse(1) { "__none__" }
            if (serialNo == "__none__") continue  // Skip products without serial number

            var recCn = 0; var outCase = 0; var recCase = 0; var usedCase = 0; var outCn = 0
            var expDate: LocalDate? = null; var batchNo: String? = null

            for (txn in txns) {
                when (txn.action) {
                    VmaInventoryAction.REC_CN -> { recCn += txn.qty; if (expDate == null) { expDate = txn.expDate; batchNo = txn.batchNo } }
                    VmaInventoryAction.OUT_CASE -> outCase += txn.qty
                    VmaInventoryAction.REC_CASE -> recCase += txn.qty
                    VmaInventoryAction.USED_CASE -> usedCase += txn.qty
                    VmaInventoryAction.OUT_CN -> outCn += txn.qty
                    else -> {}
                }
            }

            val onShelf = maxOf(0, recCn + recCase - outCase - outCn)
            if (onShelf <= 0) continue

            val status = when {
                expDate != null && expDate < today -> "EXPIRED"
                expDate != null && expDate <= in30Days -> "NEAR_EXP"
                else -> "AVAILABLE"
            }

            results.add(FridgeEligibleProduct(
                specNo = specNo,
                serialNo = serialNo,
                expDate = expDate?.toString(),
                batchNo = batchNo,
                status = status,
                alreadyInFridge = "$specNo|$serialNo" in fridgeSerials,
            ))
        }

        // ─── Source 2: Demo products ───
        val returnDemoKeys = mutableMapOf<String, Int>()
        for (txn in allTxns) {
            if (txn.action != VmaInventoryAction.RETURN_DEMO) continue
            val dk = "${txn.specNo}|${txn.serialNo ?: ""}"
            returnDemoKeys[dk] = (returnDemoKeys[dk] ?: 0) + txn.qty
        }

        val demoTxns = allTxns.filter { it.action == VmaInventoryAction.MOVE_DEMO }
        val returnBudget = returnDemoKeys.toMutableMap()

        for (tx in demoTxns) {
            if (tx.serialNo == null) continue
            val dk = "${tx.specNo}|${tx.serialNo}"
            val budget = returnBudget[dk] ?: 0
            if (budget >= tx.qty) { returnBudget[dk] = budget - tx.qty; continue }
            if (budget > 0) returnBudget[dk] = 0

            results.add(FridgeEligibleProduct(
                specNo = tx.specNo,
                serialNo = tx.serialNo!!,
                expDate = tx.expDate?.toString(),
                batchNo = tx.batchNo,
                status = "DEMO",
                alreadyInFridge = "${tx.specNo}|${tx.serialNo}" in fridgeSerials,
            ))
        }

        // Group by specNo for the frontend dropdown
        return results.groupBy { it.specNo }
    }
}
