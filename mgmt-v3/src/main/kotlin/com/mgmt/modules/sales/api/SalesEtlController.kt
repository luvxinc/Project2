package com.mgmt.modules.sales.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.inventory.application.usecase.SalesFifoSyncUseCase
import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.application.usecase.*
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

/**
 * SalesEtlController — ETL 上传 + 向导 REST API。
 *
 * V1 对应: views.py etl_views (Django)
 * 6 阶段向导: Upload → Parse → Clean (SKU Fix) → Transform → FIFO Sync → Done
 */
@RestController
@RequestMapping("/api/sales/etl")
class SalesEtlController(
    private val ingestUseCase: EtlIngestUseCase,
    private val parseUseCase: EtlParseUseCase,
    private val cleanUseCase: EtlCleanUseCase,
    private val transformUseCase: EtlTransformUseCase,
    private val fifoSyncUseCase: SalesFifoSyncUseCase,
    private val batchRepo: EtlBatchRepository,
) {

    /**
     * POST /sales/etl/upload — Upload CSV data + ingest.
     * Frontend parses CSV client-side, sends JSON rows.
     */
    @PostMapping("/upload")
    @RequirePermission("module.sales.etl.upload")
    @AuditLog(module = "SALES", action = "ETL_UPLOAD")
    fun upload(
        @RequestBody request: EtlUploadRequest,
        auth: Authentication,
    ): ResponseEntity<Map<String, Any>> {
        val result = ingestUseCase.ingest(request)
        return ResponseEntity.ok(mapOf("success" to true, "data" to result))
    }

    /**
     * POST /sales/etl/{batchId}/parse — Trigger SKU parsing.
     */
    @PostMapping("/{batchId}/parse")
    @RequirePermission("module.sales.etl.upload")
    @AuditLog(module = "SALES", action = "ETL_PARSE")
    fun parse(@PathVariable batchId: String): ResponseEntity<Map<String, Any>> {
        val result = parseUseCase.parse(batchId)
        return ResponseEntity.ok(mapOf("success" to true, "data" to result))
    }

    /**
     * GET /sales/etl/{batchId}/pending — Get pending SKU corrections.
     */
    @GetMapping("/{batchId}/pending")
    @RequirePermission("module.sales.etl.upload")
    fun getPending(@PathVariable batchId: String): ResponseEntity<Map<String, Any>> {
        val result = parseUseCase.parse(batchId)
        return ResponseEntity.ok(mapOf(
            "success" to true,
            "data" to result.pendingItems,
            "totalRows" to result.totalRows,
            "parsedOk" to result.parsedOk,
            "needsFix" to result.needsFix,
        ))
    }

    /**
     * POST /sales/etl/{batchId}/fix-sku — Submit SKU corrections.
     */
    @PostMapping("/{batchId}/fix-sku")
    @RequirePermission("module.sales.etl.upload")
    @AuditLog(module = "SALES", action = "ETL_FIX_SKU")
    @SecurityLevel(level = "L3", actionKey = "btn_etl_fix_sku")
    fun fixSku(
        @PathVariable batchId: String,
        @RequestBody request: SkuFixRequest,
        auth: Authentication,
    ): ResponseEntity<Map<String, Any>> {
        val username = auth.name
        val fixedCount = cleanUseCase.applyFixes(batchId, request.fixes, username)
        return ResponseEntity.ok(mapOf("success" to true, "data" to mapOf("fixedCount" to fixedCount)))
    }

    /**
     * POST /sales/etl/{batchId}/transform — Confirm transform + FIFO sync.
     */
    @PostMapping("/{batchId}/transform")
    @RequirePermission("module.sales.etl.upload")
    @AuditLog(module = "SALES", action = "ETL_TRANSFORM")
    @SecurityLevel(level = "L3", actionKey = "btn_etl_transform")
    fun transform(
        @PathVariable batchId: String,
        @RequestBody request: TransformRequest,
    ): ResponseEntity<Map<String, Any>> {
        // Step 1: Transform
        val transformResult = transformUseCase.transform(batchId)

        // Step 2: FIFO Sync
        val fifoResult = fifoSyncUseCase.syncBatch(batchId)

        return ResponseEntity.ok(mapOf(
            "success" to true,
            "data" to mapOf(
                "transform" to transformResult,
                "fifo" to fifoResult,
            ),
        ))
    }

    /**
     * GET /sales/etl/{batchId}/status — Poll batch progress.
     */
    @GetMapping("/{batchId}/status")
    @RequirePermission("module.sales.etl.upload")
    fun getStatus(@PathVariable batchId: String): ResponseEntity<Map<String, Any>> {
        val batch = batchRepo.findByBatchId(batchId)
            ?: return ResponseEntity.notFound().build()

        val status = EtlBatchStatusResponse(
            batchId = batch.batchId,
            status = batch.status,
            progress = batch.progress,
            stageMessage = batch.stageMessage,
            stats = batch.stats,
            errorMessage = batch.errorMessage,
        )
        return ResponseEntity.ok(mapOf("success" to true, "data" to status))
    }
}
