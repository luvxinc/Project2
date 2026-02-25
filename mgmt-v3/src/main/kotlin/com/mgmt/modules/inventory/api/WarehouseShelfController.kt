package com.mgmt.modules.inventory.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.common.security.SecurityUtils
import com.mgmt.modules.inventory.application.dto.BatchCreateWarehouseRequest
import com.mgmt.modules.inventory.application.dto.DownloadBarcodeRequest
import com.mgmt.modules.inventory.application.usecase.WarehouseShelfUseCase
import com.mgmt.modules.inventory.infrastructure.pdf.ShelfBarcodePdfService
import jakarta.validation.Valid
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * WarehouseShelfController — Batch warehouse shelf management REST API.
 *
 * Endpoints:
 *   1. GET    /inventory/warehouse-shelves           — Hierarchical warehouse tree + stats
 *   2. GET    /inventory/warehouse-shelves/warehouses — Warehouse name list
 *   3. POST   /inventory/warehouse-shelves           — Batch create (Cartesian product)
 *   4. PUT    /inventory/warehouse-shelves/{warehouse} — Update layout
 *   5. DELETE /inventory/warehouse-shelves/{warehouse} — Delete entire warehouse
 *   6. POST   /inventory/warehouse-shelves/barcode/single — Single-location PDF
 *   7. GET    /inventory/warehouse-shelves/barcode/batch  — All-warehouse ZIP
 *   8. GET    /inventory/warehouse-shelves/barcode/{warehouse} — Single-warehouse PDF
 */
@RestController
@RequestMapping("/inventory/warehouse-shelves")
class WarehouseShelfController(
    private val shelfUseCase: WarehouseShelfUseCase,
    private val pdfService: ShelfBarcodePdfService,
) {

    // ═══════════════════════════════════════════════
    // 1. WAREHOUSE TREE
    // ═══════════════════════════════════════════════

    @GetMapping
    @RequirePermission("module.inventory.warehouse.view")
    fun getWarehouseTree(): ResponseEntity<Any> {
        val tree = shelfUseCase.getWarehouseTree()
        return ResponseEntity.ok(ApiResponse.ok(tree))
    }

    // ═══════════════════════════════════════════════
    // 2. WAREHOUSE NAMES
    // ═══════════════════════════════════════════════

    @GetMapping("/warehouses")
    @RequirePermission("module.inventory.warehouse.view")
    fun getWarehouseNames(): ResponseEntity<Any> {
        val names = shelfUseCase.getWarehouseNames()
        return ResponseEntity.ok(ApiResponse.ok(names))
    }

    // ═══════════════════════════════════════════════
    // 3. BATCH CREATE
    // ═══════════════════════════════════════════════

    @PostMapping
    @RequirePermission("module.inventory.warehouse.create")
    @SecurityLevel(level = "L2", actionKey = "btn_create_warehouse")
    @AuditLog(module = "INVENTORY", action = "CREATE_WAREHOUSE", riskLevel = "HIGH")
    fun batchCreate(@Valid @RequestBody request: BatchCreateWarehouseRequest): ResponseEntity<Any> {
        val locations = shelfUseCase.batchCreate(request, SecurityUtils.currentUsername())
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(mapOf(
                "count" to locations.size,
                "warehouse" to request.warehouse.trim().uppercase(),
            )))
    }

    // ═══════════════════════════════════════════════
    // 4. UPDATE WAREHOUSE LAYOUT
    // ═══════════════════════════════════════════════

    @PutMapping("/{warehouse}")
    @RequirePermission("module.inventory.warehouse.create")
    @SecurityLevel(level = "L2", actionKey = "btn_update_warehouse")
    @AuditLog(module = "INVENTORY", action = "UPDATE_WAREHOUSE", riskLevel = "HIGH")
    fun updateWarehouse(
        @PathVariable warehouse: String,
        @Valid @RequestBody request: BatchCreateWarehouseRequest,
    ): ResponseEntity<Any> {
        val locations = shelfUseCase.updateWarehouse(warehouse, request, SecurityUtils.currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "count" to locations.size,
            "warehouse" to warehouse.trim().uppercase(),
        )))
    }

    // ═══════════════════════════════════════════════
    // 5. DELETE WAREHOUSE
    // ═══════════════════════════════════════════════

    @DeleteMapping("/{warehouse}")
    @RequirePermission("module.inventory.warehouse.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_warehouse")
    @AuditLog(module = "INVENTORY", action = "DELETE_WAREHOUSE", riskLevel = "HIGH")
    fun deleteWarehouse(@PathVariable warehouse: String): ResponseEntity<Any> {
        val deleted = shelfUseCase.deleteWarehouse(warehouse)
        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "deleted" to deleted,
            "warehouse" to warehouse.trim().uppercase(),
        )))
    }

    // ═══════════════════════════════════════════════
    // 6. BARCODE: SINGLE LOCATION PDF
    // ═══════════════════════════════════════════════

    @PostMapping("/barcode/single")
    @RequirePermission("module.inventory.warehouse.view")
    fun downloadSingleBarcode(@RequestBody request: DownloadBarcodeRequest): ResponseEntity<ByteArray> {
        val pdfBytes = pdfService.generateCustomLabels(request.barcodes)
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"shelf_labels.pdf\"")
            .contentType(MediaType.APPLICATION_PDF)
            .contentLength(pdfBytes.size.toLong())
            .body(pdfBytes)
    }

    // ═══════════════════════════════════════════════
    // 7. BARCODE: ALL WAREHOUSES ZIP
    // ═══════════════════════════════════════════════

    @GetMapping("/barcode/batch")
    @RequirePermission("module.inventory.warehouse.view")
    fun downloadBatchZip(): ResponseEntity<ByteArray> {
        val zipBytes = pdfService.generateBatchZip()
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"warehouse_barcodes.zip\"")
            .contentType(MediaType.parseMediaType("application/zip"))
            .contentLength(zipBytes.size.toLong())
            .body(zipBytes)
    }

    // ═══════════════════════════════════════════════
    // 8. BARCODE: SINGLE WAREHOUSE PDF
    // ═══════════════════════════════════════════════

    @GetMapping("/barcode/{warehouse}")
    @RequirePermission("module.inventory.warehouse.view")
    fun downloadWarehousePdf(@PathVariable warehouse: String): ResponseEntity<ByteArray> {
        val pdfBytes = pdfService.generateWarehousePdf(warehouse)
        val filename = "${warehouse.trim().uppercase()}_barcodes.pdf"
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.APPLICATION_PDF)
            .contentLength(pdfBytes.size.toLong())
            .body(pdfBytes)
    }

}
