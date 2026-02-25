package com.mgmt.modules.inventory.application.usecase

import com.mgmt.domain.inventory.*
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import com.mgmt.modules.sales.domain.repository.CleanedTransactionRepository
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/**
 * SalesFifoSyncUseCase — 销售 FIFO 出入库引擎。
 *
 * V1 对应: sales_sync.py SalesSyncService
 * 职责:
 *   NN  → FIFO 出库 (in_date ASC, layer_id ASC — 严格 FIFO)
 *   CA  → 100% 精确还原原层 (_fifo_return_full)
 *   RE  → 60% 部分还原 (unit_cost DESC — 最贵先恢复)
 *   CR  → 50% 部分还原
 *   CC  → 30% 部分还原
 *   PD  → 0% (跳过)
 *
 * 不变量: FIFO 规则完全复刻 V1。数字必须一致。
 */
@Service
class SalesFifoSyncUseCase(
    private val fifoTranRepo: FifoTransactionRepository,
    private val fifoLayerRepo: FifoLayerRepository,
    private val fifoAllocRepo: FifoAllocationRepository,
    private val cleanedRepo: CleanedTransactionRepository,
    private val batchRepo: EtlBatchRepository,
) {
    private val log = LoggerFactory.getLogger(SalesFifoSyncUseCase::class.java)

    data class SyncResult(
        val outCount: Int,
        val returnCount: Int,
        val skippedCount: Int,
        val errors: List<String>,
    )

    /**
     * Sync a batch: process all cleaned_transactions for the batch's date range.
     * V1 parity: sales_sync.py process_batch()
     *
     * @param ratios map of action → percentage (0-100). CA/PD are fixed.
     */
    @Transactional
    fun syncBatch(batchId: String, ratios: Map<SalesAction, Int> = emptyMap()): SyncResult {
        val batch = batchRepo.findByBatchId(batchId)
            ?: throw IllegalArgumentException("Batch not found: $batchId")

        batch.status = "syncing"
        batch.progress = 85
        batch.stageMessage = "FIFO sync in progress..."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        // Build return ratio map (V1 parity: sales_sync.py return_ratios)
        val returnRatios = mapOf(
            SalesAction.NN to 100,
            SalesAction.CA to 100,  // Fixed
            SalesAction.RE to (ratios[SalesAction.RE] ?: batch.fifoRatioRe),
            SalesAction.CR to (ratios[SalesAction.CR] ?: batch.fifoRatioCr),
            SalesAction.CC to (ratios[SalesAction.CC] ?: batch.fifoRatioCc),
            SalesAction.PD to 0,    // Fixed
        )

        // Get cleaned transactions for this batch date range
        val dateMin = batch.dateMin?.atStartOfDay(java.time.ZoneId.of("America/Los_Angeles"))
            ?.plusHours(12)?.toInstant()
        val dateMax = batch.dateMax?.plusDays(1)?.atStartOfDay(java.time.ZoneId.of("America/Los_Angeles"))
            ?.plusHours(12)?.toInstant()

        if (dateMin == null || dateMax == null) {
            batch.status = "done"
            batch.progress = 100
            batch.stageMessage = "No date range — FIFO sync skipped."
            batch.updatedAt = Instant.now()
            batchRepo.save(batch)
            return SyncResult(0, 0, 0, emptyList())
        }

        // Process NN (outbound) first, then returns
        var outCount = 0
        var returnCount = 0
        var skippedCount = 0
        val errors = mutableListOf<String>()

        // Get all cleaned transactions in date range
        val cleaned = cleanedRepo.findAll().filter {
            it.orderDate >= dateMin && it.orderDate <= dateMax
        }

        // Sort: NN first, then returns
        val sorted = cleaned.sortedWith(compareBy<CleanedTransaction> {
            if (it.action == SalesAction.NN) 0 else 1
        }.thenBy { it.orderDate })

        for (ct in sorted) {
            val ratio = returnRatios[ct.action] ?: 0
            if (ratio == 0) {
                skippedCount++
                continue
            }

            try {
                val skuSlots = extractSkuSlots(ct)

                for ((sku, qtyp) in skuSlots) {
                    if (sku.isBlank() || qtyp <= 0) continue

                    when (ct.action) {
                        SalesAction.NN -> {
                            processOutbound(sku, qtyp, ct)
                            outCount++
                        }
                        SalesAction.CA -> {
                            // V1 parity: _fifo_return_full() — 100% exact restore to original layers
                            processCancelRestore(sku, qtyp, ct)
                            returnCount++
                        }
                        else -> {
                            // V1 parity: _fifo_return_partial() — int() truncation, NOT round()
                            val returnQty = qtyp * ratio / 100
                            if (returnQty > 0) {
                                processReturn(sku, returnQty, ct)
                                returnCount++
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                errors.add("Order ${ct.orderNumber}: ${e.message}")
                log.warn("FIFO sync error for order {}: {}", ct.orderNumber, e.message)
            }
        }

        // Update batch
        batch.status = "done"
        batch.progress = 100
        batch.stageMessage = "FIFO sync complete. Out: $outCount, Return: $returnCount."
        batch.stats = """{"fifo_out":$outCount,"fifo_return":$returnCount,"skipped":$skippedCount}"""
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        log.info("ETL batch {} FIFO synced: out={}, return={}, skipped={}", batchId, outCount, returnCount, skippedCount)
        return SyncResult(outCount, returnCount, skippedCount, errors)
    }

    /**
     * Build ref_key in V1 format: SALES:{seller}:{order_number}:{item_id}:{action}
     * V1 parity: sales_sync.py _build_ref_key()
     */
    private fun buildRefKey(ct: CleanedTransaction): String {
        val seller = (ct.seller ?: "").trim()
        val orderNumber = (ct.orderNumber ?: "").trim()
        val itemId = (ct.itemId ?: "").trim()
        val action = ct.action.name
        return "SALES:$seller:$orderNumber:$itemId:$action"
    }

    /**
     * FIFO outbound: consume from oldest layers first.
     * V1 parity: sales_sync.py _process_outbound()
     * Order: in_date ASC, layer_id ASC
     */
    private fun processOutbound(sku: String, qty: Int, ct: CleanedTransaction) {
        val refKey = buildRefKey(ct)

        // Skip if already processed (idempotent)
        if (fifoTranRepo.findByRefKey(refKey) != null) return

        val layers = fifoLayerRepo.findActiveLayersBySku(sku)
        var remaining = qty

        // Create FIFO transaction
        val fifoTran = FifoTransaction(
            transactionDate = ct.orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "out",
            tranType = "sale",
            refKey = refKey,
            note = "Sale order ${ct.orderNumber}",
        )
        fifoTranRepo.save(fifoTran)

        for (layer in layers) {
            if (remaining <= 0) break
            val alloc = minOf(remaining, layer.qtyRemaining)
            if (alloc <= 0) continue

            layer.qtyRemaining -= alloc
            if (layer.qtyRemaining == 0) {
                layer.closedAt = Instant.now()
            }
            fifoLayerRepo.save(layer)

            // V1 parity: uses unit_cost directly, no landedCost fallback
            val unitCost = layer.unitCost
            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = ct.orderDate,
                qtyAlloc = alloc,
                unitCost = unitCost,
                costAlloc = unitCost.multiply(BigDecimal(alloc)).setScale(5, RoundingMode.HALF_UP),
            ))

            remaining -= alloc
        }

        if (remaining > 0) {
            log.warn("FIFO insufficient stock for SKU {} — {} units unallocated", sku, remaining)
        }
    }

    /**
     * CA cancel restore: 100% exact restore to original NN allocation layers.
     * V1 parity: sales_sync.py _fifo_return_full()
     *
     * Finds the original NN outbound transaction's allocations and restores
     * the EXACT quantities to the EXACT same layers.
     */
    private fun processCancelRestore(sku: String, qty: Int, ct: CleanedTransaction) {
        val refKey = buildRefKey(ct)

        // Skip if already processed (idempotent)
        if (fifoTranRepo.findByRefKey(refKey) != null) return

        // V1 parity: find original NN transaction by constructing NN ref_key
        val seller = (ct.seller ?: "").trim()
        val orderNumber = (ct.orderNumber ?: "").trim()
        val itemId = (ct.itemId ?: "").trim()
        val nnRefKey = "SALES:$seller:$orderNumber:$itemId:NN"

        val nnTran = fifoTranRepo.findByRefKey(nnRefKey)
        if (nnTran == null) {
            log.warn("CA restore: no NN transaction found for ref_key={}, falling back to generic return", nnRefKey)
            processReturn(sku, qty, ct)
            return
        }

        // Get original NN allocations
        val allocations = fifoAllocRepo.findByOutTranId(nnTran.id)
        if (allocations.isEmpty()) {
            log.warn("CA restore: no allocations found for NN tran_id={}, falling back to generic return", nnTran.id)
            processReturn(sku, qty, ct)
            return
        }

        // Create return FIFO transaction
        val fifoTran = FifoTransaction(
            transactionDate = ct.orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "in",
            tranType = "return",
            refKey = refKey,
            note = "Cancel restore CA order ${ct.orderNumber}",
        )
        fifoTranRepo.save(fifoTran)

        // V1 parity: restore EXACT quantities to EXACT original layers
        for (alloc in allocations) {
            val layer = fifoLayerRepo.findById(alloc.layerId).orElse(null)
            if (layer == null) {
                log.warn("CA restore: layer {} not found, skipping", alloc.layerId)
                continue
            }

            layer.qtyRemaining += alloc.qtyAlloc
            layer.closedAt = null // Re-open if it was closed
            fifoLayerRepo.save(layer)

            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = ct.orderDate,
                qtyAlloc = alloc.qtyAlloc,
                unitCost = alloc.unitCost,
                costAlloc = alloc.unitCost.multiply(BigDecimal(alloc.qtyAlloc)).setScale(5, RoundingMode.HALF_UP),
            ))
        }
    }

    /**
     * FIFO return: restore to most expensive layers first.
     * V1 parity: sales_sync.py _fifo_return_partial()
     * Order: unit_cost DESC
     */
    private fun processReturn(sku: String, qty: Int, ct: CleanedTransaction) {
        val refKey = buildRefKey(ct)

        // Skip if already processed (idempotent)
        if (fifoTranRepo.findByRefKey(refKey) != null) return

        val layers = fifoLayerRepo.findReturnCandidatesBySku(sku)
        var remaining = qty

        // Create FIFO transaction
        val fifoTran = FifoTransaction(
            transactionDate = ct.orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "in",
            tranType = "return",
            refKey = refKey,
            note = "Return ${ct.action.name} order ${ct.orderNumber}",
        )
        fifoTranRepo.save(fifoTran)

        for (layer in layers) {
            if (remaining <= 0) break
            val space = layer.qtyIn - layer.qtyRemaining
            val alloc = minOf(remaining, space)
            if (alloc <= 0) continue

            layer.qtyRemaining += alloc
            layer.closedAt = null // Re-open if it was closed
            fifoLayerRepo.save(layer)

            // V1 parity: uses unit_cost directly, no landedCost fallback
            val unitCost = layer.unitCost
            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = ct.orderDate,
                qtyAlloc = alloc,
                unitCost = unitCost,
                costAlloc = unitCost.multiply(BigDecimal(alloc)).setScale(5, RoundingMode.HALF_UP),
            ))

            remaining -= alloc
        }

        if (remaining > 0) {
            log.warn("FIFO return: no layers with space for SKU {} — {} units unrestored", sku, remaining)
        }
    }

    /**
     * Extract (sku, qtyp) pairs from CleanedTransaction's 10 slots.
     * V1 parity: qtyp = qty * quantity (already computed during transform)
     */
    private fun extractSkuSlots(ct: CleanedTransaction): List<Pair<String, Int>> {
        val result = mutableListOf<Pair<String, Int>>()
        ct.sku1?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp1 ?: 0)) }
        ct.sku2?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp2 ?: 0)) }
        ct.sku3?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp3 ?: 0)) }
        ct.sku4?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp4 ?: 0)) }
        ct.sku5?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp5 ?: 0)) }
        ct.sku6?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp6 ?: 0)) }
        ct.sku7?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp7 ?: 0)) }
        ct.sku8?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp8 ?: 0)) }
        ct.sku9?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp9 ?: 0)) }
        ct.sku10?.let { if (it.isNotBlank()) result.add(it to (ct.qtyp10 ?: 0)) }
        return result
    }
}
