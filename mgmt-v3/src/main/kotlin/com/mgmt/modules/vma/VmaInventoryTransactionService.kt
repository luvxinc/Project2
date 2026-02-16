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
 * Available = REC_CN + REC_CASE - OUT_CASE - OUT_CN - MOVE_DEMO
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

    fun create(dto: CreateInventoryTransactionRequest): VmaInventoryTransaction =
        txnRepo.save(VmaInventoryTransaction(
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
        txn.deletedAt = Instant.now()
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
        )
        val wipMult = mapOf(
            VmaInventoryAction.OUT_CASE to 1, VmaInventoryAction.REC_CASE to -1,
            VmaInventoryAction.USED_CASE to -1,
            VmaInventoryAction.REC_CN to 0, VmaInventoryAction.OUT_CN to 0,
            VmaInventoryAction.MOVE_DEMO to 0,
        )

        val today = LocalDate.now()
        val in30Days = today.plusDays(30)

        data class Entry(var available: Int = 0, var wip: Int = 0, var nearExp: Int = 0, var expired: Int = 0)
        val specMap = mutableMapOf<String, Entry>()

        // Pass 1: totals per (specNo, action)
        val grouped = txns.groupBy { it.specNo to it.action }
        for ((key, group) in grouped) {
            val (specNo, action) = key
            val entry = specMap.getOrPut(specNo) { Entry() }
            val totalQty = group.sumOf { it.qty }
            entry.available += totalQty * (availMult[action] ?: 0)
            entry.wip += totalQty * (wipMult[action] ?: 0)
        }

        // Pass 2: expiry tracking
        val shelfActions = setOf(
            VmaInventoryAction.REC_CN, VmaInventoryAction.REC_CASE,
            VmaInventoryAction.OUT_CASE, VmaInventoryAction.OUT_CN,
            VmaInventoryAction.MOVE_DEMO,
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
                )
            }
    }

    // ═══════════ Inventory Detail ═══════════

    fun getInventoryDetail(specNo: String, productType: String): Map<String, List<InventoryDetailRow>> {
        val pt = VmaProductType.valueOf(productType)
        val txns = txnRepo.findAllBySpecNoAndProductTypeAndDeletedAtIsNull(specNo, pt)
            .filter { it.action != VmaInventoryAction.MOVE_DEMO }

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

    // ═══════════ Demo Inventory ═══════════

    fun getDemoInventory(): List<Map<String, Any?>> {
        val today = LocalDate.now()
        val rows = mutableListOf<Map<String, Any?>>()

        // Single load — partition in memory (was 2x findAll before P-1 fix)
        val allTxns = txnRepo.findAllByDeletedAtIsNullOrderByDateDesc()

        // Source 1: Explicit MOVE_DEMO transactions
        val demoTxns = allTxns.filter { it.action == VmaInventoryAction.MOVE_DEMO }

        for (tx in demoTxns) {
            val status = when {
                tx.notes?.startsWith("RECEIVING_AUTO") == true -> "Rejected (Receiving)"
                tx.notes?.startsWith("COMPLETION_AUTO") == true -> "Rejected (Case)"
                else -> "Manually Moved"
            }
            rows.add(mapOf(
                "id" to tx.id, "batchNo" to (tx.batchNo ?: ""),
                "productType" to tx.productType.name, "specNo" to tx.specNo,
                "recDate" to tx.date.toString(), "serialNo" to (tx.serialNo ?: ""),
                "expDate" to (tx.expDate?.toString() ?: ""), "qty" to tx.qty,
                "status" to status, "notes" to (tx.notes ?: ""),
                "condition" to tx.condition.toList(),
                "date" to tx.date.toString(),
            ))
        }

        // Source 2: Expired on-shelf (reuse same allTxns)
        val availMult = mapOf(
            VmaInventoryAction.REC_CN to 1, VmaInventoryAction.REC_CASE to 1,
            VmaInventoryAction.OUT_CASE to -1, VmaInventoryAction.OUT_CN to -1,
            VmaInventoryAction.MOVE_DEMO to -1,
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
            ))
        }

        return rows.sortedByDescending { it["date"] as? String ?: "" }
    }
}
