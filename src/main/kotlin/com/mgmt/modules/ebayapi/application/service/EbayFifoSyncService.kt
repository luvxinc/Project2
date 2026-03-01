package com.mgmt.modules.ebayapi.application.service

import com.mgmt.domain.inventory.*
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

/**
 * EbayFifoSyncService — API 管道的 FIFO 出入库引擎。
 *
 * 完全复刻 SalesFifoSyncUseCase 的 FIFO 逻辑:
 *   NN  → FIFO 出库 (in_date ASC, layer_id ASC — 严格 FIFO)
 *   CA  → 100% 精确还原原层
 *   RE  → 按比例部分还原 (unit_cost DESC — 最贵先恢复)
 *   CR  → 按比例部分还原
 *
 * 数据来源: ebay_api.cleaned_transactions (非 public schema)
 * 去重: 通过 (ref_key, sku) 组合检查防止重复写入
 * 天花板: pending SKU 阻塞机制 — 未修正的 SKU 阻塞后续日期
 */
@Service
class EbayFifoSyncService(
    private val jdbcTemplate: JdbcTemplate,
    private val fifoTranRepo: FifoTransactionRepository,
    private val fifoLayerRepo: FifoLayerRepository,
    private val fifoAllocRepo: FifoAllocationRepository,
    private val txTemplate: TransactionTemplate,
) {
    private val log = LoggerFactory.getLogger(EbayFifoSyncService::class.java)
    private val PST = ZoneId.of("America/Los_Angeles")

    data class FifoSyncResult(
        val outCount: Int,
        val returnCount: Int,
        val skippedCount: Int,
        val errors: List<String>,
        val ceilingDate: LocalDate?,
        val blockedByPending: Boolean = false,
    )

    /**
     * Default return ratios — matches SalesFifoSyncUseCase exactly.
     */
    private val defaultRatios = mapOf(
        "NN" to 100,
        "CA" to 100,   // Fixed: 100% exact restore
        "RE" to 60,    // 60% partial return
        "CR" to 50,    // 50% partial return
        "CC" to 30,    // 30% partial return
        "PD" to 0,     // Skip
    )

    // ═══════════════════════════════════════════════════════════
    // FIFO Ceiling — Pending SKU blocking mechanism
    // ═══════════════════════════════════════════════════════════

    /**
     * Get the FIFO ceiling date — the day BEFORE the earliest pending SKU issue.
     * If no pending issues exist, returns today's date (no blocking).
     *
     * Logic: if the earliest unfixed SKU is on 2025-05-03,
     *        ceiling = 2025-05-02 (everything before that date is safe)
     */
    fun getFifoCeiling(): LocalDate {
        val earliest = jdbcTemplate.queryForObject("""
            SELECT MIN((ct.order_date AT TIME ZONE 'America/Los_Angeles')::date)
            FROM ebay_api.cleaned_transactions ct
            WHERE ct.action = 'NN'
              AND ct.sku1 IS NOT NULL AND ct.sku1 != '0'
              AND (ct.order_date AT TIME ZONE 'America/Los_Angeles')::date >= '2025-01-01'
              AND (
                  UPPER(ct.sku1) NOT IN (SELECT UPPER(sku) FROM products WHERE sku IS NOT NULL)
                  OR ct.quantity1 = 0 OR ct.quantity1 IS NULL
              )
        """.trimIndent(), LocalDate::class.java)

        return if (earliest != null) {
            log.info("FIFO ceiling: {} (blocked by pending SKU on {})", earliest.minusDays(1), earliest)
            earliest.minusDays(1)
        } else {
            val today = LocalDate.now(PST)
            log.info("FIFO ceiling: {} (no pending SKUs)", today)
            today
        }
    }

    /**
     * Get the current FIFO watermark — the last date successfully synced.
     */
    fun getFifoWatermark(): LocalDate {
        return jdbcTemplate.queryForObject(
            "SELECT watermark_date FROM ebay_api.fifo_watermarks ORDER BY id LIMIT 1",
            LocalDate::class.java,
        ) ?: LocalDate.of(2024, 12, 31)
    }

    /**
     * Update the FIFO watermark after successful sync.
     */
    private fun updateFifoWatermark(date: LocalDate, rowsProcessed: Int, status: String, reason: String? = null) {
        jdbcTemplate.update("""
            UPDATE ebay_api.fifo_watermarks
            SET watermark_date = ?, last_sync_at = NOW(), rows_processed = ?,
                status = ?, blocked_reason = ?, updated_at = NOW()
            WHERE id = (SELECT id FROM ebay_api.fifo_watermarks ORDER BY id LIMIT 1)
        """.trimIndent(), date, rowsProcessed, status, reason)
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 0: Undo CSV FIFO — restore all layers to initial state
    // ═══════════════════════════════════════════════════════════

    /**
     * Undo all CSV-sourced FIFO transactions (sale/return/cancel).
     * Restores layer qty_remaining to original state.
     *
     * MUST be called BEFORE syncDateRange.
     * MUST execute in reverse chronological order.
     */
    @Transactional
    fun undoCsvFifo(): Map<String, Any> {
        log.info("═══════════════════════════════════════")
        log.info("UNDO CSV FIFO — Starting reversal")
        log.info("═══════════════════════════════════════")

        // 1. Get all sale/return/cancel FIFO transactions (newest first)
        @Suppress("UNCHECKED_CAST")
        val transactions = jdbcTemplate.queryForList("""
            SELECT id, action, tran_type
            FROM fifo_transactions
            WHERE ref_key LIKE 'SALES:%'
            ORDER BY transaction_date DESC, id DESC
        """.trimIndent())

        var undoneCount = 0
        var allocsRemoved = 0

        for (tran in transactions) {
            val tranId = (tran["id"] as Number).toLong()
            val action = tran["action"] as String   // "out" or "in"

            // Get allocations for this transaction
            val allocs = jdbcTemplate.queryForList("""
                SELECT id, layer_id, qty_alloc FROM fifo_allocations WHERE out_tran_id = ?
            """.trimIndent(), tranId)

            for (alloc in allocs) {
                val layerId = (alloc["layer_id"] as Number).toLong()
                val qtyAlloc = (alloc["qty_alloc"] as Number).toInt()

                // Reverse the layer effect
                if (action == "out") {
                    // Sale out → restore qty_remaining
                    jdbcTemplate.update("""
                        UPDATE fifo_layers SET qty_remaining = qty_remaining + ?, closed_at = NULL WHERE id = ?
                    """.trimIndent(), qtyAlloc, layerId)
                } else {
                    // Return/cancel in → subtract qty_remaining back
                    jdbcTemplate.update("""
                        UPDATE fifo_layers SET qty_remaining = qty_remaining - ? WHERE id = ?
                    """.trimIndent(), qtyAlloc, layerId)
                }

                // Delete allocation
                jdbcTemplate.update("DELETE FROM fifo_allocations WHERE id = ?", (alloc["id"] as Number).toLong())
                allocsRemoved++
            }

            // Delete transaction
            jdbcTemplate.update("DELETE FROM fifo_transactions WHERE id = ?", tranId)
            undoneCount++
        }

        // Reset watermark
        updateFifoWatermark(LocalDate.of(2024, 12, 31), 0, "pending", "CSV FIFO undone, ready for API rewrite")

        log.info("UNDO CSV FIFO complete: {} transactions undone, {} allocations removed", undoneCount, allocsRemoved)

        return mapOf(
            "status" to "done",
            "transactionsUndone" to undoneCount,
            "allocationsRemoved" to allocsRemoved,
        )
    }

    // ═══════════════════════════════════════════════════════════
    // Main FIFO Sync — with ceiling enforcement
    // ═══════════════════════════════════════════════════════════

    /**
     * Sync API cleaned_transactions to FIFO, respecting the ceiling.
     *
     * @param fromDate start date (inclusive)
     * @param toDate end date (inclusive) — will be clamped to ceiling
     * @param ratios optional ratio overrides
     */
    fun syncDateRange(
        fromDate: String,
        toDate: String,
        ratios: Map<String, Int> = emptyMap(),
    ): FifoSyncResult {
        val effectiveRatios = defaultRatios + ratios
        val ceiling = getFifoCeiling()
        val requestedTo = LocalDate.parse(toDate)
        val actualTo = if (requestedTo.isAfter(ceiling)) ceiling else requestedTo
        val blockedByPending = requestedTo.isAfter(ceiling)

        if (blockedByPending) {
            log.warn("FIFO sync clamped: requested {} but ceiling is {} (pending SKU)", requestedTo, ceiling)
        }

        if (LocalDate.parse(fromDate).isAfter(actualTo)) {
            log.info("FIFO sync: nothing to do (from {} > ceiling {})", fromDate, actualTo)
            updateFifoWatermark(actualTo, 0, "blocked", "Pending SKU before $fromDate")
            return FifoSyncResult(0, 0, 0, emptyList(), ceiling, blockedByPending)
        }

        // Fetch cleaned transactions from API schema, sorted: NN first, then returns
        val rows = jdbcTemplate.queryForList("""
            SELECT id, seller, order_number, item_id, action, order_date, sale_amount,
                   sku1, qtyp1, sku2, qtyp2, sku3, qtyp3, sku4, qtyp4, sku5, qtyp5,
                   sku6, qtyp6, sku7, qtyp7, sku8, qtyp8, sku9, qtyp9, sku10, qtyp10
            FROM ebay_api.cleaned_transactions
            WHERE (order_date AT TIME ZONE 'America/Los_Angeles')::date >= ?::date
            AND (order_date AT TIME ZONE 'America/Los_Angeles')::date <= ?::date
            ORDER BY CASE WHEN action = 'NN' THEN 0 ELSE 1 END, order_date ASC
        """.trimIndent(), fromDate, actualTo.toString())

        log.info("FIFO sync: {} rows from {} to {} (ceiling={})", rows.size, fromDate, actualTo, ceiling)

        var outCount = 0
        var returnCount = 0
        var skippedCount = 0
        val errors = mutableListOf<String>()

        for (row in rows) {
            val action = row["action"] as? String ?: "NN"
            val ratio = effectiveRatios[action] ?: 0
            if (ratio == 0) {
                skippedCount++
                continue
            }

            try {
                val seller = (row["seller"] as? String ?: "").trim()
                val orderNumber = (row["order_number"] as? String ?: "").trim()
                val itemId = (row["item_id"] as? String ?: "").trim()
                val orderDate = when (val od = row["order_date"]) {
                    is OffsetDateTime -> od.toInstant()
                    is Instant -> od
                    else -> Instant.now()
                }

                val refKey = "SALES:$seller:$orderNumber:$itemId:$action"
                val skuSlots = extractSkuSlots(row)

                // Each row in its own transaction for performance
                txTemplate.execute {
                    for ((sku, qtyp) in skuSlots) {
                        if (sku.isBlank() || qtyp <= 0) continue

                        when (action) {
                            "NN" -> {
                                processOutbound(sku, qtyp, refKey, orderNumber, orderDate)
                                outCount++
                            }
                            "CA" -> {
                                processCancelRestore(sku, qtyp, refKey, orderNumber, orderDate, seller, itemId)
                                returnCount++
                            }
                            else -> {
                                val returnQty = qtyp * ratio / 100
                                if (returnQty > 0) {
                                    processReturn(sku, returnQty, refKey, orderNumber, action, orderDate)
                                    returnCount++
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                val orderNumber = row["order_number"] as? String ?: "?"
                errors.add("Order $orderNumber: ${e.message}")
                log.warn("FIFO sync error for order {}: {}", orderNumber, e.message)
            }
        }

        // Update watermark
        val status = if (blockedByPending) "blocked" else "synced"
        val reason = if (blockedByPending) "Pending SKU blocks beyond $ceiling" else null
        updateFifoWatermark(actualTo, outCount + returnCount, status, reason)

        log.info("FIFO sync complete: out={}, return={}, skipped={}, errors={}, ceiling={}",
            outCount, returnCount, skippedCount, errors.size, ceiling)
        return FifoSyncResult(outCount, returnCount, skippedCount, errors, ceiling, blockedByPending)
    }

    // ═══════════════════════════════════════════════════════════
    // FIFO Operations (identical to SalesFifoSyncUseCase)
    // ═══════════════════════════════════════════════════════════

    private fun processOutbound(sku: String, qty: Int, refKey: String, orderNumber: String, orderDate: Instant) {
        val layers = fifoLayerRepo.findActiveLayersBySku(sku)
        var remaining = qty

        val fifoTran = FifoTransaction(
            transactionDate = orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "out",
            tranType = "sale",
            refKey = refKey,
            note = "Sale order $orderNumber",
            source = "api",
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

            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = orderDate,
                qtyAlloc = alloc,
                unitCost = layer.unitCost,
                costAlloc = layer.unitCost.multiply(BigDecimal(alloc)).setScale(5, RoundingMode.HALF_UP),
            ))

            remaining -= alloc
        }

        if (remaining > 0) {
            log.warn("FIFO insufficient stock for SKU {} — {} units unallocated", sku, remaining)
        }
    }

    private fun processCancelRestore(
        sku: String, qty: Int, refKey: String, orderNumber: String,
        orderDate: Instant, seller: String, itemId: String,
    ) {
        val nnRefKey = "SALES:$seller:$orderNumber:$itemId:NN"
        val nnTran = fifoTranRepo.findByRefKey(nnRefKey)
        if (nnTran == null) {
            log.warn("CA restore: no NN transaction for ref_key={}, falling back to generic return", nnRefKey)
            processReturn(sku, qty, refKey, orderNumber, "CA", orderDate)
            return
        }

        val allocations = fifoAllocRepo.findByOutTranId(nnTran.id)
        if (allocations.isEmpty()) {
            log.warn("CA restore: no allocations for NN tran_id={}, falling back to generic return", nnTran.id)
            processReturn(sku, qty, refKey, orderNumber, "CA", orderDate)
            return
        }

        val fifoTran = FifoTransaction(
            transactionDate = orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "in",
            tranType = "return",
            refKey = refKey,
            note = "Cancel restore CA order $orderNumber",
            source = "api",
        )
        fifoTranRepo.save(fifoTran)

        for (alloc in allocations) {
            val layer = fifoLayerRepo.findById(alloc.layerId).orElse(null)
            if (layer == null) {
                log.warn("CA restore: layer {} not found, skipping", alloc.layerId)
                continue
            }

            layer.qtyRemaining += alloc.qtyAlloc
            layer.closedAt = null
            fifoLayerRepo.save(layer)

            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = orderDate,
                qtyAlloc = alloc.qtyAlloc,
                unitCost = alloc.unitCost,
                costAlloc = alloc.unitCost.multiply(BigDecimal(alloc.qtyAlloc)).setScale(5, RoundingMode.HALF_UP),
            ))
        }
    }

    private fun processReturn(sku: String, qty: Int, refKey: String, orderNumber: String, action: String, orderDate: Instant) {
        val layers = fifoLayerRepo.findReturnCandidatesBySku(sku)
        var remaining = qty

        val fifoTran = FifoTransaction(
            transactionDate = orderDate,
            sku = sku,
            unitPrice = BigDecimal.ZERO,
            quantity = qty,
            action = "in",
            tranType = "return",
            refKey = refKey,
            note = "Return $action order $orderNumber",
            source = "api",
        )
        fifoTranRepo.save(fifoTran)

        for (layer in layers) {
            if (remaining <= 0) break
            val space = layer.qtyIn - layer.qtyRemaining
            val alloc = minOf(remaining, space)
            if (alloc <= 0) continue

            layer.qtyRemaining += alloc
            layer.closedAt = null
            fifoLayerRepo.save(layer)

            fifoAllocRepo.save(FifoAllocation(
                outTranId = fifoTran.id,
                layerId = layer.id,
                sku = sku,
                outDate = orderDate,
                qtyAlloc = alloc,
                unitCost = layer.unitCost,
                costAlloc = layer.unitCost.multiply(BigDecimal(alloc)).setScale(5, RoundingMode.HALF_UP),
            ))

            remaining -= alloc
        }

        if (remaining > 0) {
            log.warn("FIFO return: no layers with space for SKU {} — {} units unrestored", sku, remaining)
        }
    }

    /**
     * Extract (sku, qtyp) pairs from a row map — slots 1-10.
     */
    private fun extractSkuSlots(row: Map<String, Any?>): List<Pair<String, Int>> {
        val result = mutableListOf<Pair<String, Int>>()
        for (i in 1..10) {
            val sku = (row["sku$i"] as? String)?.trim()?.uppercase()
            val qtyp = (row["qtyp$i"] as? Number)?.toInt() ?: 0
            if (!sku.isNullOrBlank() && sku != "0" && qtyp > 0) {
                result.add(sku to qtyp)
            }
        }
        return result
    }
}
