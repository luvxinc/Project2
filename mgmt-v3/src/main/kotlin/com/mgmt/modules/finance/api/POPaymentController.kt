package com.mgmt.modules.finance.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.application.usecase.POPaymentHistoryService
import com.mgmt.modules.finance.application.usecase.POPaymentListService
import com.mgmt.modules.finance.application.usecase.POPaymentUseCase
import com.mgmt.modules.finance.application.usecase.PrepaymentBalanceService
import com.mgmt.modules.finance.infrastructure.POPaymentFileService
import org.springframework.core.io.InputStreamResource
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import java.net.URLEncoder
import java.nio.file.Files

/**
 * POPaymentController — Finance PO payment (balance payment) REST API.
 *
 * Endpoints:
 *   1. GET    /finance/po-payments                                  — PO payment list
 *   2. POST   /finance/po-payments/payments                         — Submit batch payment
 *   3. DELETE /finance/po-payments/payments/{pmtNo}                  — Delete payment
 *   4. GET    /finance/po-payments/vendor-balance                    — Vendor prepay balance
 *   5. GET    /finance/po-payments/payments/{pmtNo}/history          — Payment history
 *   6. GET    /finance/po-payments/payments/{pmtNo}/orders           — Payment orders
 *   7. GET    /finance/po-payments/payments/{pmtNo}/files            — File info
 *   8. GET    /finance/po-payments/payments/{pmtNo}/files/{fn}       — Serve file
 *   9. POST   /finance/po-payments/payments/{pmtNo}/files            — Upload file
 *  10. DELETE /finance/po-payments/payments/{pmtNo}/files/{fn}       — Delete file
 */
@RestController
@RequestMapping("/finance")
class POPaymentController(
    private val poPaymentListService: POPaymentListService,
    private val poPaymentUseCase: POPaymentUseCase,
    private val historyService: POPaymentHistoryService,
    private val fileService: POPaymentFileService,
    private val balanceService: PrepaymentBalanceService,
) {

    // ═══════════════════════════════════════════════
    // 1. PO PAYMENT LIST
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments")
    @RequirePermission("module.finance.po_payment")
    fun getPOPaymentList(
        @RequestParam(defaultValue = "po_date") sortBy: String,
        @RequestParam(defaultValue = "desc") sortOrder: String,
    ): ResponseEntity<Any> {
        val result = poPaymentListService.getPOPaymentList(sortBy, sortOrder)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 2. SUBMIT BATCH PAYMENT
    // ═══════════════════════════════════════════════

    @PostMapping("/po-payments/payments")
    @RequirePermission("module.finance.po_payment.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_po_payment_submit")
    @AuditLog(module = "FINANCE", action = "CREATE_PO_PAYMENT", riskLevel = "HIGH")
    fun submitPayment(@RequestBody request: SubmitPOPaymentRequest): ResponseEntity<Any> {
        val result = poPaymentUseCase.submitPayment(request, currentUsername())
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 3. DELETE PAYMENT (soft delete by paymentNo)
    // ═══════════════════════════════════════════════

    @DeleteMapping("/po-payments/payments/{pmtNo}")
    @RequirePermission("module.finance.po_payment.manage")
    @SecurityLevel(level = "L3", actionKey = "btn_po_payment_delete")
    @AuditLog(module = "FINANCE", action = "DELETE_PO_PAYMENT", riskLevel = "HIGH")
    fun deletePayment(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = poPaymentUseCase.deletePayment(pmtNo, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 4. VENDOR BALANCE (delegates to PrepaymentBalanceService)
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments/vendor-balance")
    @RequirePermission("module.finance.po_payment")
    fun getVendorBalance(
        @RequestParam supplierCode: String,
        @RequestParam(required = false) paymentDate: String?,
    ): ResponseEntity<Any> {
        val balance = balanceService.getBalanceForSupplier(supplierCode)
        val result = VendorBalanceDto(
            supplierCode = balance.supplierCode,
            supplierName = balance.supplierName,
            currency = balance.currency,
            balanceBase = balance.balance,
            balanceUsd = balance.balance,
        )
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 5. PAYMENT HISTORY
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments/payments/{pmtNo}/history")
    @RequirePermission("module.finance.po_payment")
    fun getPaymentHistory(
        @PathVariable pmtNo: String,
        @RequestParam poNum: String,
    ): ResponseEntity<Any> {
        val result = historyService.getPaymentHistory(pmtNo, poNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 6. PAYMENT ORDERS
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments/payments/{pmtNo}/orders")
    @RequirePermission("module.finance.po_payment")
    fun getPaymentOrders(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = historyService.getPaymentOrders(pmtNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 7. FILE INFO
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments/payments/{pmtNo}/files")
    @RequirePermission("module.finance.po_payment")
    fun getFileInfo(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = fileService.getFileInfo(pmtNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 8. SERVE FILE
    // ═══════════════════════════════════════════════

    @GetMapping("/po-payments/payments/{pmtNo}/files/{filename}")
    @RequirePermission("module.finance.po_payment")
    fun serveFile(
        @PathVariable pmtNo: String,
        @PathVariable filename: String,
    ): ResponseEntity<Any> {
        val filePath = fileService.resolveFilePath(pmtNo, filename)
            ?: return ResponseEntity.notFound().build()

        val contentType = Files.probeContentType(filePath) ?: "application/octet-stream"
        val resource = InputStreamResource(Files.newInputStream(filePath))
        val encodedName = URLEncoder.encode(filename, "UTF-8").replace("+", "%20")

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"$encodedName\"")
            .contentType(MediaType.parseMediaType(contentType))
            .contentLength(Files.size(filePath))
            .body(resource)
    }

    // ═══════════════════════════════════════════════
    // 9. UPLOAD FILE
    // ═══════════════════════════════════════════════

    @PostMapping("/po-payments/payments/{pmtNo}/files")
    @RequirePermission("module.finance.po_payment.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_po_payment_upload_file")
    @AuditLog(module = "FINANCE", action = "UPLOAD_PO_PAYMENT_FILE", riskLevel = "MEDIUM")
    fun uploadFile(
        @PathVariable pmtNo: String,
        @RequestParam("file") file: MultipartFile,
    ): ResponseEntity<Any> {
        val maxSize = 50L * 1024 * 1024
        if (file.size > maxSize) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error<Any>("finance.errors.fileTooLarge"))
        }

        val filename = fileService.saveFile(pmtNo, file.originalFilename ?: "file", file.bytes)
        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "filename" to filename,
            "message" to "finance.messages.fileUploaded",
        )))
    }

    // ═══════════════════════════════════════════════
    // 10. DELETE FILE
    // ═══════════════════════════════════════════════

    @DeleteMapping("/po-payments/payments/{pmtNo}/files/{filename}")
    @RequirePermission("module.finance.po_payment.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_po_payment_delete_file")
    @AuditLog(module = "FINANCE", action = "DELETE_PO_PAYMENT_FILE", riskLevel = "MEDIUM")
    fun deleteFile(
        @PathVariable pmtNo: String,
        @PathVariable filename: String,
    ): ResponseEntity<Any> {
        val deleted = fileService.deleteFile(pmtNo, filename)
        return if (deleted) {
            ResponseEntity.ok(ApiResponse.ok(mapOf("message" to "finance.messages.fileDeleted")))
        } else {
            ResponseEntity.notFound().build()
        }
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
