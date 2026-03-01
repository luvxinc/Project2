package com.mgmt.modules.ebayapi.api

import com.mgmt.modules.ebayapi.application.service.EbayDataSyncService
import com.mgmt.modules.ebayapi.application.service.EbayFifoSyncService
import com.mgmt.modules.ebayapi.application.service.EbaySyncScheduler
import com.mgmt.modules.ebayapi.application.service.EbayTransformService
import com.mgmt.modules.ebayapi.application.service.SalesActionLogService
import com.mgmt.modules.ebayapi.domain.model.EbaySyncBatch
import com.mgmt.modules.ebayapi.domain.repository.*
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

/**
 * EbayDataSyncController — eBay 数据同步管理。
 *
 * 端点:
 *   POST /api/v1/ebay/sync            → 指定卖家+日期范围同步
 *   POST /api/v1/ebay/sync/auto       → 手动触发全量增量同步 (同每日自动同步)
 *   POST /api/v1/ebay/sync/transform  → 触发数据转换
 *   POST /api/v1/ebay/sync/fifo       → 触发 FIFO 同步 (API管道测试)
 *   GET  /api/v1/ebay/sync/stats      → 获取数据统计
 */
@RestController
@RequestMapping("/ebay/sync")
class EbayDataSyncController(
    private val syncService: EbayDataSyncService,
    private val transformService: EbayTransformService,
    private val fifoSyncService: EbayFifoSyncService,
    private val syncScheduler: EbaySyncScheduler,
    private val syncBatchRepo: EbaySyncBatchRepository,
    private val finTxnRepo: EbayFinTransactionRepository,
    private val fulOrderRepo: EbayFulOrderRepository,
    private val finPayoutRepo: EbayFinPayoutRepository,
    private val actionLog: SalesActionLogService,
) {
    private val log = LoggerFactory.getLogger(EbayDataSyncController::class.java)

    @PersistenceContext
    private lateinit var em: EntityManager

    @Value("\${app.sales-data-source:api}")
    private lateinit var salesDataSource: String

    /**
     * 触发数据同步。
     *
     * POST /api/v1/ebay/sync?seller=espartsplus&from=2025-11-01&to=2025-11-30
     */
    @PostMapping
    fun triggerSync(
        @RequestParam seller: String,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): ResponseEntity<SyncResultResponse> {
        log.info("Sync triggered: seller={}, from={}, to={}", seller, from, to)
        val startMs = System.currentTimeMillis()
        val batch = syncService.syncDateRange(seller, from, to)
        val durationMs = System.currentTimeMillis() - startMs
        actionLog.logDataSync(
            triggerType = "MANUAL",
            seller = seller,
            fromDate = from.toString(),
            toDate = to.toString(),
            txnFetched = batch.transactionsFetched,
            ordersFetched = batch.ordersFetched,
            cleanedProduced = 0,
            durationMs = durationMs,
        )
        return ResponseEntity.ok(batch.toResponse())
    }

    /**
     * 触发数据转换 (raw API data → cleaned_transactions)。
     *
     * POST /api/v1/ebay/sync/transform?from=2025-11-01&to=2025-11-30
     */
    @PostMapping("/transform")
    fun triggerTransform(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): ResponseEntity<Map<String, Any>> {
        log.info("Transform triggered: from={}, to={}", from, to)
        val startMs = System.currentTimeMillis()
        val count = transformService.transformDateRange(from.toString(), to.toString())
        val durationMs = System.currentTimeMillis() - startMs
        actionLog.log(
            module = "SALES",
            actionType = "TRANSFORM",
            triggerType = "MANUAL",
            summary = "ETL transform: $count rows inserted ($from to $to)",
            totalCount = count,
            successCount = count,
            durationMs = durationMs,
        )
        return ResponseEntity.ok(mapOf(
            "status" to "done",
            "fromDate" to from.toString(),
            "toDate" to to.toString(),
            "rowsInserted" to count,
        ))
    }

    /**
     * 触发 FIFO 同步 (从 ebay_api.cleaned_transactions)。
     *
     * ⚠️ 测试端点: 仅用于验证 API → FIFO 流程。
     * 使用 dry-run=true 参数可以只统计不执行。
     *
     * POST /api/v1/ebay/sync/fifo?from=2025-11-01&to=2025-11-30
     */
    @PostMapping("/fifo")
    fun triggerFifoSync(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): ResponseEntity<Map<String, Any>> {
        log.info("FIFO sync triggered from API data: from={}, to={}", from, to)
        val result = fifoSyncService.syncDateRange(from.toString(), to.toString())
        return ResponseEntity.ok(mapOf(
            "status" to "done",
            "fromDate" to from.toString(),
            "toDate" to to.toString(),
            "outCount" to result.outCount,
            "returnCount" to result.returnCount,
            "skippedCount" to result.skippedCount,
            "errors" to result.errors,
        ))
    }

    /**
     * 手动触发全量增量同步 (同每日 23:59:59 自动同步逻辑)。
     *
     * POST /api/v1/ebay/sync/auto
     * 基于水位线增量拉取所有卖家的最新数据。
     */
    @PostMapping("/auto")
    fun triggerAutoSync(): ResponseEntity<Map<String, Any>> {
        log.info("Manual auto-sync triggered via API")
        val startMs = System.currentTimeMillis()
        val reports = syncScheduler.manualSyncAll()
        val durationMs = System.currentTimeMillis() - startMs
        for (r in reports) {
            actionLog.logDataSync(
                triggerType = "MANUAL",
                seller = r.seller,
                fromDate = r.fromDate.toString(),
                toDate = r.toDate.toString(),
                txnFetched = r.transactionsFetched,
                ordersFetched = r.ordersFetched,
                cleanedProduced = r.cleanedProduced,
                durationMs = durationMs,
                success = r.status == "success",
                errorMessage = r.error,
            )
        }
        return ResponseEntity.ok(mapOf(
            "status" to "done",
            "sellers" to reports.map { mapOf(
                "seller" to it.seller,
                "fromDate" to it.fromDate.toString(),
                "toDate" to it.toDate.toString(),
                "transactionsFetched" to it.transactionsFetched,
                "ordersFetched" to it.ordersFetched,
                "cleanedProduced" to it.cleanedProduced,
                "status" to it.status,
                "error" to (it.error ?: ""),
            ) },
        ))
    }

    /**
     * 获取数据统计。
     */
    @GetMapping("/stats")
    fun getStats(@RequestParam(required = false) seller: String?): ResponseEntity<SyncStatsResponse> {
        val txnCount = if (seller != null) finTxnRepo.findAllBySellerUsername(seller).size.toLong()
                       else finTxnRepo.count()
        val orderCount = if (seller != null) fulOrderRepo.findAllBySellerUsername(seller).size.toLong()
                         else fulOrderRepo.count()
        val payoutCount = finPayoutRepo.count()
        val batches = syncBatchRepo.findAll().map { it.toResponse() }

        return ResponseEntity.ok(SyncStatsResponse(
            totalTransactions = txnCount,
            totalOrders = orderCount,
            totalPayouts = payoutCount,
            syncBatches = batches,
        ))
    }

    /**
     * 获取数据覆盖范围 — 前端状态栏使用。
     *
     * GET /api/v1/ebay/sync/data-range
     */
    @GetMapping("/data-range")
    fun getDataRange(): ResponseEntity<Map<String, Any?>> {
        @Suppress("UNCHECKED_CAST")
        val apiRow = em.createNativeQuery("""
            SELECT MIN(order_date) AS min_date, MAX(order_date) AS max_date, COUNT(*) AS total
            FROM ebay_api.cleaned_transactions WHERE action = 'NN'
        """).resultList as List<Array<Any?>>

        @Suppress("UNCHECKED_CAST")
        val csvRow = em.createNativeQuery("""
            SELECT MIN(order_date) AS min_date, MAX(order_date) AS max_date, COUNT(*) AS total
            FROM cleaned_transactions WHERE action = 'NN'
        """).resultList as List<Array<Any?>>

        return ResponseEntity.ok(mapOf(
            "dataSource" to salesDataSource,
            "api" to mapOf(
                "minDate" to apiRow[0][0]?.toString(),
                "maxDate" to apiRow[0][1]?.toString(),
                "totalRows" to apiRow[0][2],
            ),
            "csv" to mapOf(
                "minDate" to csvRow[0][0]?.toString(),
                "maxDate" to csvRow[0][1]?.toString(),
                "totalRows" to csvRow[0][2],
            ),
        ))
    }

    /**
     * 获取 API 管道中未解析/错误的 SKU 列表。
     * 包含：自动校正预填 + 5个近似匹配建议。
     *
     * GET /api/v1/ebay/sync/pending-skus
     */
    @GetMapping("/pending-skus")
    fun getPendingSkus(): ResponseEntity<Map<String, Any>> {
        // 1. Load all valid SKUs
        @Suppress("UNCHECKED_CAST")
        val validSkus = em.createNativeQuery(
            "SELECT UPPER(sku) FROM products WHERE sku IS NOT NULL ORDER BY sku"
        ).resultList as List<String>
        val validSet = validSkus.toSet()

        // 2. Load all correction rules (custom_label + bad_sku → correct_sku)
        @Suppress("UNCHECKED_CAST")
        val corrections = em.createNativeQuery(
            "SELECT custom_label, bad_sku, correct_sku FROM sku_corrections ORDER BY created_at DESC"
        ).resultList as List<Array<Any?>>
        val corrMap = corrections.associate {
            "${(it[0] as? String)?.trim()}|${(it[1] as? String)?.trim()?.uppercase()}" to
                (it[2] as? String)?.trim()?.uppercase()
        }

        // 3. Find pending rows: bad SKU OR zero quantity
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT ct.id, ct.order_number, ct.full_sku, ct.sku1, ct.item_title,
                   ct.order_date, ct.seller, ct.quantity, ct.quantity1
            FROM ebay_api.cleaned_transactions ct
            WHERE ct.action = 'NN'
              AND ct.sku1 IS NOT NULL
              AND ct.sku1 != '0'
              AND (
                  UPPER(ct.sku1) NOT IN (
                      SELECT UPPER(sku) FROM products WHERE sku IS NOT NULL
                  )
                  OR ct.quantity1 = 0
                  OR ct.quantity1 IS NULL
              )
            ORDER BY ct.sku1, ct.order_date DESC
        """).resultList as List<Array<Any?>>

        // Group by (sku1, issueType): show one representative row per group
        data class GroupKey(val sku: String, val issueType: String)
        val groups = mutableMapOf<GroupKey, MutableList<Array<Any?>>>()
        for (row in rows) {
            val currentSku = ((row[3] as? String) ?: "").trim().uppercase()
            val qty1 = (row[8] as? Number)?.toInt() ?: 0
            val skuValid = validSet.contains(currentSku)
            val issueType = if (!skuValid) "bad_sku" else if (qty1 == 0) "bad_qty" else "bad_sku"
            groups.getOrPut(GroupKey(currentSku, issueType)) { mutableListOf() }.add(row)
        }

        val pending = groups.map { (key, groupRows) ->
            val row = groupRows.first() // representative row
            val fullSku = (row[2] as? String) ?: ""
            val currentSku = (row[3] as? String) ?: ""
            val qty1 = (row[8] as? Number)?.toInt() ?: 0

            // Auto-fix lookup: match by (custom_label, bad_sku)
            val autoFixKey = "${fullSku.trim()}|${currentSku.trim().uppercase()}"
            val autoFix = corrMap[autoFixKey]

            // Fuzzy suggestions
            val suggestions = if (key.issueType == "bad_qty") {
                emptyList()
            } else if (autoFix != null && validSet.contains(autoFix)) {
                listOf(autoFix) + validSkus.filter { it != autoFix }
                    .sortedBy { levenshtein(currentSku.uppercase(), it) }
                    .take(4)
            } else {
                validSkus.sortedBy { levenshtein(currentSku.uppercase(), it) }.take(5)
            }

            mapOf(
                "id" to row[0],
                "orderNumber" to row[1],
                "fullSku" to fullSku,
                "currentSku1" to currentSku,
                "itemTitle" to row[4],
                "orderDate" to row[5]?.toString(),
                "seller" to row[6],
                "quantity" to row[7],
                "quantity1" to qty1,
                "autoFix" to autoFix,
                "suggestions" to suggestions,
                "issueType" to key.issueType,
                "affectedCount" to groupRows.size,
            )
        }.sortedByDescending { (it["affectedCount"] as? Int) ?: 0 }

        return ResponseEntity.ok(mapOf(
            "count" to rows.size,  // total affected rows
            "groups" to pending.size,  // unique groups to fix
            "pending" to pending,
            "validSkus" to validSkus,
        ))
    }

    /**
     * 修正 API 管道中的错误 SKU。
     * 同时写入 sku_corrections 校正记录。
     *
     * POST /api/v1/ebay/sync/fix-sku
     */
    @Transactional
    @PostMapping("/fix-sku")
    fun fixSkus(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        @Suppress("UNCHECKED_CAST")
        val fixes = body["fixes"] as? List<Map<String, Any>> ?: emptyList()
        var fixedCount = 0
        var batchCount = 0

        // Collect unique (badSku → correctSku, correctQty) for batch propagation
        val batchFixes = mutableMapOf<String, Pair<String, Int>>()

        for (fix in fixes) {
            val fullSku = fix["fullSku"] as? String ?: continue
            val badSku = fix["badSku"] as? String ?: continue
            val correctSku = fix["correctSku"] as? String ?: continue
            val correctQty = fix["correctQty"] as? String ?: "1"
            val qtyInt = correctQty.toIntOrNull() ?: 1

            // Save correction to sku_corrections (upsert)
            em.createNativeQuery("""
                INSERT INTO sku_corrections (custom_label, bad_sku, correct_sku, correct_qty, created_at)
                VALUES (?1, ?2, ?3, ?4, NOW())
                ON CONFLICT (custom_label, bad_sku) DO UPDATE
                SET correct_sku = EXCLUDED.correct_sku, correct_qty = EXCLUDED.correct_qty, created_at = NOW()
            """).setParameter(1, fullSku.trim())
               .setParameter(2, badSku.trim().uppercase())
               .setParameter(3, correctSku.trim().uppercase())
               .setParameter(4, correctQty)
               .executeUpdate()

            // Update the specific row
            val id = (fix["id"] as? Number)?.toLong()
            if (id != null) {
                em.createNativeQuery("""
                    UPDATE ebay_api.cleaned_transactions
                    SET sku1 = ?1,
                        quantity1 = CASE WHEN ?3 > 0 THEN ?3 ELSE quantity1 END,
                        qtyp1 = CASE WHEN ?3 > 0 THEN ?3 * COALESCE(quantity, 1) ELSE qtyp1 END
                    WHERE id = ?2
                """).setParameter(1, correctSku.trim().uppercase())
                   .setParameter(2, id)
                   .setParameter(3, qtyInt)
                   .executeUpdate()
            }
            fixedCount++

            // Track for batch propagation
            batchFixes[badSku.trim().uppercase()] = Pair(correctSku.trim().uppercase(), qtyInt)
        }

        // Batch propagate: update ALL rows with matching bad_sku
        for ((badSku, correction) in batchFixes) {
            val (corrSku, corrQty) = correction
            val propagated = em.createNativeQuery("""
                UPDATE ebay_api.cleaned_transactions
                SET sku1 = ?1,
                    quantity1 = CASE WHEN ?3 > 0 THEN ?3 ELSE quantity1 END,
                    qtyp1 = CASE WHEN ?3 > 0 THEN ?3 * COALESCE(quantity, 1) ELSE qtyp1 END
                WHERE UPPER(sku1) = ?2
                  AND action = 'NN'
            """).setParameter(1, corrSku)
               .setParameter(2, badSku)
               .setParameter(3, corrQty)
               .executeUpdate()
            batchCount += propagated
            log.info("Batch propagated: {} → {} ({} rows)", badSku, corrSku, propagated)
        }

        log.info("API SKU fix: {} direct + {} batch-propagated", fixedCount, batchCount)
        return ResponseEntity.ok(mapOf(
            "status" to "done",
            "fixedCount" to fixedCount,
            "batchCount" to batchCount,
        ))
    }

    // ═══════════════════════════════════════════════
    // SKU Correction Rules CRUD
    // ═══════════════════════════════════════════════

    /**
     * 列出所有校正规则。
     * GET /api/v1/ebay/sync/sku-corrections
     */
    @GetMapping("/sku-corrections")
    fun getSkuCorrections(): ResponseEntity<List<Map<String, Any?>>> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT id, custom_label, bad_sku, correct_sku, correct_qty, created_at
            FROM sku_corrections
            ORDER BY created_at DESC
        """).resultList as List<Array<Any?>>

        val list = rows.map { row ->
            mapOf(
                "id" to row[0],
                "customLabel" to row[1],
                "badSku" to row[2],
                "correctSku" to row[3],
                "correctQty" to row[4],
                "createdAt" to row[5]?.toString(),
            )
        }
        return ResponseEntity.ok(list)
    }

    /**
     * 更新校正规则。
     * PUT /api/v1/ebay/sync/sku-corrections
     */
    @Transactional
    @PutMapping("/sku-corrections")
    fun updateSkuCorrection(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        val id = (body["id"] as? Number)?.toLong()
        val correctSku = body["correctSku"] as? String
        val correctQty = body["correctQty"] as? String

        if (id != null && correctSku != null) {
            em.createNativeQuery("""
                UPDATE sku_corrections SET correct_sku = ?1, correct_qty = COALESCE(?2, correct_qty), created_at = NOW()
                WHERE id = ?3
            """).setParameter(1, correctSku.trim().uppercase())
               .setParameter(2, correctQty)
               .setParameter(3, id)
               .executeUpdate()
        }
        return ResponseEntity.ok(mapOf("status" to "updated"))
    }

    /**
     * 删除校正规则。
     * DELETE /api/v1/ebay/sync/sku-corrections/{id}
     */
    @Transactional
    @DeleteMapping("/sku-corrections/{id}")
    fun deleteSkuCorrection(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        em.createNativeQuery("DELETE FROM sku_corrections WHERE id = ?1")
            .setParameter(1, id)
            .executeUpdate()
        return ResponseEntity.ok(mapOf("status" to "deleted"))
    }

    // ═══════════════════════════════════════════════
    // FIFO API Endpoints
    // ═══════════════════════════════════════════════

    /**
     * Get FIFO ceiling and watermark status.
     * GET /api/v1/ebay/sync/fifo/ceiling
     */
    @GetMapping("/fifo/ceiling")
    fun getFifoCeiling(): ResponseEntity<Map<String, Any?>> {
        val ceiling = fifoSyncService.getFifoCeiling()
        val watermark = fifoSyncService.getFifoWatermark()
        return ResponseEntity.ok(mapOf(
            "ceiling" to ceiling.toString(),
            "watermark" to watermark.toString(),
            "canSync" to watermark.isBefore(ceiling),
            "gap" to java.time.temporal.ChronoUnit.DAYS.between(watermark, ceiling),
        ))
    }

    /**
     * Undo all CSV FIFO transactions — restore layers to initial state.
     * POST /api/v1/ebay/sync/fifo/undo-csv
     *
     * ⚠️ This is a destructive operation. Backup should be taken first.
     */
    @PostMapping("/fifo/undo-csv")
    fun undoCsvFifo(): ResponseEntity<Map<String, Any>> {
        log.warn("FIFO undo-csv triggered")
        val result = fifoSyncService.undoCsvFifo()
        return ResponseEntity.ok(result)
    }

    /**
     * Sync API FIFO with ceiling enforcement.
     * POST /api/v1/ebay/sync/fifo/sync?from=2025-01-01&to=2026-02-27
     */
    @PostMapping("/fifo/sync")
    fun syncApiFifo(
        @RequestParam from: String,
        @RequestParam to: String,
    ): ResponseEntity<Map<String, Any?>> {
        log.info("API FIFO sync triggered: {} → {}", from, to)
        val result = fifoSyncService.syncDateRange(from, to)
        return ResponseEntity.ok(mapOf(
            "status" to "done",
            "outCount" to result.outCount,
            "returnCount" to result.returnCount,
            "skippedCount" to result.skippedCount,
            "errors" to result.errors.size,
            "ceiling" to result.ceilingDate?.toString(),
            "blockedByPending" to result.blockedByPending,
        ))
    }

    // ═══════════════════════════════════════════════

    /** Levenshtein edit distance for fuzzy SKU matching. */
    private fun levenshtein(a: String, b: String): Int {
        val m = a.length; val n = b.length
        if (m == 0) return n; if (n == 0) return m
        val dp = Array(m + 1) { IntArray(n + 1) }
        for (i in 0..m) dp[i][0] = i
        for (j in 0..n) dp[0][j] = j
        for (i in 1..m) for (j in 1..n) {
            dp[i][j] = minOf(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1
            )
        }
        return dp[m][n]
    }

    private fun EbaySyncBatch.toResponse() = SyncResultResponse(
        batchId = batchId,
        status = status,
        sellerUsername = sellerUsername,
        transactionsFetched = transactionsFetched,
        ordersFetched = ordersFetched,
        progress = progress,
        stageMessage = stageMessage,
        errorMessage = errorMessage,
        startedAt = startedAt.toString(),
        completedAt = completedAt?.toString(),
    )
}

data class SyncResultResponse(
    val batchId: String,
    val status: String,
    val sellerUsername: String?,
    val transactionsFetched: Int,
    val ordersFetched: Int,
    val progress: Int,
    val stageMessage: String?,
    val errorMessage: String?,
    val startedAt: String,
    val completedAt: String?,
)

data class SyncStatsResponse(
    val totalTransactions: Long,
    val totalOrders: Long,
    val totalPayouts: Long,
    val syncBatches: List<SyncResultResponse>,
)
