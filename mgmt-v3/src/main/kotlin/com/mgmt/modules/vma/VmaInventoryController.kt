package com.mgmt.modules.vma

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * VmaInventoryController — 库存事务 REST API
 *
 * Inventory Transaction CRUD (5):
 *   GET    /vma/inventory-transactions                - 事务列表 (?productType=PVALVE)
 *   GET    /vma/inventory-transactions/{id}           - 单条事务
 *   POST   /vma/inventory-transactions                - 创建事务
 *   PATCH  /vma/inventory-transactions/{id}           - 更新事务
 *   DELETE /vma/inventory-transactions/{id}           - 软删除事务
 *
 * Query/Report (5):
 *   GET    /vma/inventory-transactions/spec-options   - Spec 下拉选项
 *   GET    /vma/inventory-transactions/summary        - 库存总览
 *   GET    /vma/inventory-transactions/detail         - 库存明细 (5 buckets)
 *   GET    /vma/inventory-transactions/demo           - Demo 库存
 *   GET    /vma/inventory-transactions/operators      - 操作员列表
 *
 * Receiving (2):
 *   POST   /vma/inventory-transactions/receive-from-china - Receive + auto-PDF
 *   GET    /vma/inventory-transactions/receive-pdf/{id}   - Re-download PDF
 *
 * Total: 13 endpoints
 */
@RestController
@RequestMapping("/vma")
class VmaInventoryController(
    private val invService: VmaInventoryTransactionService,
    private val receivingPdfService: VmaReceivingPdfService,
) {

    // ═══════════ CRUD ═══════════

    @GetMapping("/inventory-transactions")
    @RequirePermission("vma.employees.manage")
    fun findAll(@RequestParam(required = false) productType: String?): ResponseEntity<Any> =
        ResponseEntity.ok(invService.findAll(productType))

    @GetMapping("/inventory-transactions/{id}")
    @RequirePermission("vma.employees.manage")
    fun findOne(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(invService.findOne(id))

    @PostMapping("/inventory-transactions")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_INVENTORY_TRANSACTION")
    fun create(@RequestBody dto: CreateInventoryTransactionRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(invService.create(dto))

    @PatchMapping("/inventory-transactions/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "UPDATE_INVENTORY_TRANSACTION")
    fun update(@PathVariable id: String, @RequestBody dto: UpdateInventoryTransactionRequest): ResponseEntity<Any> =
        ResponseEntity.ok(invService.update(id, dto))

    @DeleteMapping("/inventory-transactions/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_INVENTORY_TRANSACTION", riskLevel = "HIGH")
    fun remove(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(invService.remove(id))

    // ═══════════ Query/Report ═══════════

    @GetMapping("/inventory-transactions/spec-options")
    @RequirePermission("vma.employees.manage")
    fun getSpecOptions(@RequestParam productType: String): ResponseEntity<Any> =
        ResponseEntity.ok(invService.getSpecOptions(productType))

    @GetMapping("/inventory-transactions/summary")
    @RequirePermission("vma.employees.manage")
    fun getInventorySummary(@RequestParam productType: String): ResponseEntity<Any> =
        ResponseEntity.ok(invService.getInventorySummary(productType))

    @GetMapping("/inventory-transactions/detail")
    @RequirePermission("vma.employees.manage")
    fun getInventoryDetail(
        @RequestParam specNo: String,
        @RequestParam productType: String,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(invService.getInventoryDetail(specNo, productType))

    @GetMapping("/inventory-transactions/demo")
    @RequirePermission("vma.employees.manage")
    fun getDemoInventory(): ResponseEntity<Any> =
        ResponseEntity.ok(invService.getDemoInventory())

    @GetMapping("/inventory-transactions/operators")
    @RequirePermission("vma.employees.manage")
    fun getOperatorOptions(): ResponseEntity<Any> =
        ResponseEntity.ok(invService.getActiveOperators())

    // ═══════════ Receiving ═══════════

    /**
     * Receive from China — creates batch + transactions, returns PDF blob.
     */
    @PostMapping("/inventory-transactions/receive-from-china")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "RECEIVE_FROM_CHINA")
    fun receiveFromChina(@RequestBody dto: ReceiveFromChinaRequest): ResponseEntity<ByteArray> {
        // 1. Upsert batch
        val batch = invService.upsertReceivingBatch(dto)

        // 2. Create REC_CN transactions for each product line
        val transactions = dto.products.map { line ->
            invService.create(CreateInventoryTransactionRequest(
                date = dto.dateTimeReceived.take(10),
                action = if (line.result == "REJECT") "MOVE_DEMO" else "REC_CN",
                productType = line.productType,
                specNo = line.productModel,
                serialNo = line.serialNo,
                qty = line.qty,
                expDate = line.expDate,
                inspection = line.result,
                notes = if (line.result == "REJECT") "RECEIVING_AUTO|REJECT" else null,
                operator = line.inspectionBy,
                batchNo = dto.batchNo,
                condition = line.failedNoteIndices,
            ))
        }

        // 3. Generate PDF
        val pdfBytes = receivingPdfService.generateReceivingPdf(batch, transactions)
        val filename = "receiving_inspection_${batch.batchNo}.pdf"

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.APPLICATION_PDF)
            .contentLength(pdfBytes.size.toLong())
            .body(pdfBytes)
    }

    /**
     * Re-download receiving PDF by transaction ID.
     *
     * V2 parity: regenerateReceivingPdf() in inventory-transaction.controller.ts
     * - Loads only the single transaction + its related batch
     * - Generates a 1-page PDF for that single product line
     * - Filename: receiving_inspection_{specNo}_{serialNo}_{date}.pdf
     */
    @GetMapping("/inventory-transactions/receive-pdf/{id}")
    @RequirePermission("vma.employees.manage")
    fun getReceivePdf(@PathVariable id: String): ResponseEntity<ByteArray> {
        val txn = invService.findOne(id)
        val batchNo = txn.batchNo
            ?: return ResponseEntity.notFound().build()
        val batch = invService.findBatchByBatchNo(batchNo)
            ?: return ResponseEntity.notFound().build()

        // V2 parity: generate single-product PDF (1 page), NOT entire batch
        val pdfBytes = receivingPdfService.fillOnePdf(batch, txn)
        val dateReceived = batch.dateReceived.toString()  // LocalDate.toString() = "yyyy-MM-dd"
        val filename = "receiving_inspection_${txn.specNo}_${txn.serialNo ?: "N-A"}_${dateReceived}.pdf"

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.APPLICATION_PDF)
            .contentLength(pdfBytes.size.toLong())
            .body(pdfBytes)
    }
}
