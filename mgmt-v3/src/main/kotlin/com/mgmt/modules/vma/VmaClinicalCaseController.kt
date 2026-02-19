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
 * VmaClinicalCaseController — 临床案例 REST API
 *
 * Case CRUD (3):
 *   GET    /vma/clinical-cases                                 - 案例列表
 *   GET    /vma/clinical-cases/{caseId}                        - 案例详情
 *   POST   /vma/clinical-cases                                 - 创建案例
 *   PATCH  /vma/clinical-cases/{caseId}                        - 更新案例信息
 *
 * Case Item CRUD (3):
 *   PATCH  /vma/clinical-cases/{caseId}/items/{txnId}          - 更新案例产品
 *   DELETE /vma/clinical-cases/{caseId}/items/{txnId}          - 删除案例产品
 *   POST   /vma/clinical-cases/{caseId}/items                  - 新增案例产品
 *
 * Product Picking (3):
 *   POST   /vma/case-pick-products                             - 自动拣货
 *   POST   /vma/case-available-products                        - 可用产品查询
 *   GET    /vma/case-compatible-ds                              - 兼容 DS 查询
 *
 * Case Lifecycle (2):
 *   POST   /vma/clinical-cases/{caseId}/complete               - 完成案例
 *   POST   /vma/clinical-cases/{caseId}/reverse                - 撤回完成
 *
 * PDF (1):
 *   GET    /vma/clinical-cases/{caseId}/pdf                    - 下载 Packing List PDF
 *
 * Total: 13 endpoints
 */
@RestController
@RequestMapping("/vma")
class VmaClinicalCaseController(
    private val caseService: VmaClinicalCaseService,
) {

    // ═══════════ Case CRUD ═══════════

    @GetMapping("/clinical-cases")
    @RequirePermission("vma.employees.manage")
    fun findAll(): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.findAll())

    @GetMapping("/clinical-cases/{caseId}")
    @RequirePermission("vma.employees.manage")
    fun findOne(@PathVariable caseId: String): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.findOne(caseId))

    @PostMapping("/clinical-cases")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_CLINICAL_CASE")
    fun createCase(@RequestBody dto: CreateClinicalCaseRequest): ResponseEntity<Any> {
        val result = caseService.createCaseWithPdf(dto)
        return if (result.pdfBytes != null) {
            ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"${result.filename}\"")
                .body(result.pdfBytes)
        } else {
            ResponseEntity.status(HttpStatus.CREATED).body(result.caseData)
        }
    }

    @PatchMapping("/clinical-cases/{caseId}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "UPDATE_CLINICAL_CASE")
    fun updateCaseInfo(
        @PathVariable caseId: String,
        @RequestBody dto: UpdateClinicalCaseInfoRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.updateCaseInfo(caseId, dto))

    @DeleteMapping("/clinical-cases/{caseId}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_CLINICAL_CASE", riskLevel = "HIGH")
    fun deleteCase(@PathVariable caseId: String): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.deleteCase(caseId))

    @DeleteMapping("/clinical-cases/{caseId}/related-cases")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_ALL_RELATED_CASES", riskLevel = "HIGH")
    fun deleteAllRelatedCases(@PathVariable caseId: String): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.deleteAllRelatedCases(caseId))

    @PostMapping("/clinical-cases/{caseId}/related-case")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ADD_RELATED_CASE")
    fun addRelatedCase(
        @PathVariable caseId: String,
        @RequestBody dto: AddRelatedCaseRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(caseService.addRelatedCase(caseId, dto))

    // ═══════════ Case Item CRUD ═══════════

    @PatchMapping("/clinical-cases/{caseId}/items/{txnId}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "UPDATE_CASE_ITEM")
    fun updateCaseItem(
        @PathVariable caseId: String,
        @PathVariable txnId: String,
        @RequestBody dto: UpdateCaseItemRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.updateCaseItem(caseId, txnId, dto))

    @DeleteMapping("/clinical-cases/{caseId}/items/{txnId}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_CASE_ITEM", riskLevel = "HIGH")
    fun deleteCaseItem(@PathVariable caseId: String, @PathVariable txnId: String): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.deleteCaseItem(caseId, txnId))

    @PostMapping("/clinical-cases/{caseId}/items")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ADD_CASE_ITEM")
    fun addCaseItem(@PathVariable caseId: String, @RequestBody dto: AddCaseItemRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(caseService.addCaseItem(caseId, dto))

    @PostMapping("/clinical-cases/{caseId}/items/batch")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ADD_CASE_ITEMS_BATCH")
    fun addCaseItemsBatch(@PathVariable caseId: String, @RequestBody items: List<AddCaseItemRequest>): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(caseService.addCaseItemsBatch(caseId, items))

    // ═══════════ Product Picking ═══════════

    @PostMapping("/case-pick-products")
    @RequirePermission("vma.employees.manage")
    fun pickProducts(@RequestBody dto: PickProductsRequest): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.pickProducts(dto))

    @PostMapping("/case-available-products")
    @RequirePermission("vma.employees.manage")
    fun getAvailableProducts(@RequestBody dto: AvailableProductsRequest): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.getAvailableProducts(dto))

    @GetMapping("/case-compatible-ds")
    @RequirePermission("vma.employees.manage")
    fun getCompatibleDS(@RequestParam specs: String): ResponseEntity<Any> {
        val specList = specs.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        return ResponseEntity.ok(caseService.getCompatibleDS(specList))
    }

    // ═══════════ Case Lifecycle ═══════════

    @PostMapping("/clinical-cases/{caseId}/complete")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "COMPLETE_CLINICAL_CASE")
    fun completeCase(@PathVariable caseId: String, @RequestBody dto: CompleteCaseRequest): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.completeCase(caseId, dto))

    @PostMapping("/clinical-cases/{caseId}/reverse")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "REVERSE_CLINICAL_CASE", riskLevel = "HIGH")
    fun reverseCompletion(@PathVariable caseId: String): ResponseEntity<Any> =
        ResponseEntity.ok(caseService.reverseCompletion(caseId))

    // ═══════════ PDF Download ═══════════

    @GetMapping("/clinical-cases/{caseId}/pdf")
    @RequirePermission("vma.employees.manage")
    fun downloadPdf(@PathVariable caseId: String): ResponseEntity<ByteArray> {
        val result = caseService.generatePackingListPdf(caseId)
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"${result.filename}\"")
            .body(result.pdfBytes)
    }
}

