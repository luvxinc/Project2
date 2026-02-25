package com.mgmt.modules.finance.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.application.usecase.DepositListService
import com.mgmt.modules.finance.application.usecase.DepositPaymentHistoryService
import com.mgmt.modules.finance.application.usecase.DepositPaymentUseCase
import com.mgmt.modules.finance.application.usecase.PrepaymentBalanceService
import com.mgmt.modules.finance.infrastructure.DepositPaymentFileService
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
 * DepositPaymentController — Finance deposit payment REST API.
 *
 *
 * Endpoints:
 *   1. GET    /finance/deposits                                  — Deposit list
 *   2. POST   /finance/deposits/payments                         — Submit batch payment
 *   3. DELETE /finance/deposits/payments/{pmtNo}                  — Delete payment
 *   4. GET    /finance/deposits/vendor-balance                    — Vendor prepay balance
 *   5. GET    /finance/deposits/payments/{pmtNo}/history          — Payment history
 *   6. GET    /finance/deposits/payments/{pmtNo}/orders           — Payment orders
 *   7. GET    /finance/deposits/payments/{pmtNo}/files            — File info
 *   8. GET    /finance/deposits/payments/{pmtNo}/files/{fn}       — Serve file
 *   9. POST   /finance/deposits/payments/{pmtNo}/files            — Upload file
 *  10. DELETE /finance/deposits/payments/{pmtNo}/files/{fn}       — Delete file
 */
@RestController
@RequestMapping("/finance")
class DepositPaymentController(
    private val depositListService: DepositListService,
    private val depositPaymentUseCase: DepositPaymentUseCase,
    private val historyService: DepositPaymentHistoryService,
    private val fileService: DepositPaymentFileService,
    private val balanceService: PrepaymentBalanceService,
) {

    // ═══════════════════════════════════════════════
    // 1. DEPOSIT LIST
    // V1: deposit_list_api (api.py:37-395)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits")
    @RequirePermission("module.finance.deposit")
    fun getDepositList(
        @RequestParam(defaultValue = "po_date") sortBy: String,
        @RequestParam(defaultValue = "desc") sortOrder: String,
    ): ResponseEntity<Any> {
        val result = depositListService.getDepositList(sortBy, sortOrder)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 2. SUBMIT BATCH PAYMENT
    // V1: deposit_payment_submit (api.py:415-719)
    // ═══════════════════════════════════════════════

    @PostMapping("/deposits/payments")
    @RequirePermission("module.finance.deposit.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_deposit_payment_submit")
    @AuditLog(module = "FINANCE", action = "CREATE_DEPOSIT_PAYMENT", riskLevel = "HIGH")
    fun submitPayment(@RequestBody request: SubmitDepositPaymentRequest): ResponseEntity<Any> {
        val result = depositPaymentUseCase.submitPayment(request, currentUsername())
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 3. DELETE PAYMENT (soft delete by paymentNo)
    // V1: deposit_payment_delete_api (api.py:1436-1619)
    // ═══════════════════════════════════════════════

    @DeleteMapping("/deposits/payments/{pmtNo}")
    @RequirePermission("module.finance.deposit.manage")
    @SecurityLevel(level = "L3", actionKey = "btn_deposit_payment_delete")
    @AuditLog(module = "FINANCE", action = "DELETE_DEPOSIT_PAYMENT", riskLevel = "HIGH")
    fun deletePayment(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = depositPaymentUseCase.deletePayment(pmtNo, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 4. VENDOR BALANCE (delegates to PrepaymentBalanceService)
    // V1: get_vendor_balance_api (api.py:787-908)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits/vendor-balance")
    @RequirePermission("module.finance.deposit")
    fun getVendorBalance(
        @RequestParam supplierCode: String,
        @RequestParam(required = false) paymentDate: String?,
    ): ResponseEntity<Any> {
        // Delegate to existing PrepaymentBalanceService (V1: complex double-normalization)
        // The service handles currency conversion and balance calculation
        val balance = balanceService.getBalanceForSupplier(supplierCode)
        val result = VendorBalanceDto(
            supplierCode = balance.supplierCode,
            supplierName = balance.supplierName,
            currency = balance.currency,
            balanceBase = balance.balance,
            balanceUsd = balance.balance,  // Service already returns in supplier currency
        )
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 5. PAYMENT HISTORY
    // V1: deposit_history_api (api.py:1220-1434)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits/payments/{pmtNo}/history")
    @RequirePermission("module.finance.deposit")
    fun getPaymentHistory(
        @PathVariable pmtNo: String,
        @RequestParam poNum: String,
    ): ResponseEntity<Any> {
        val result = historyService.getPaymentHistory(pmtNo, poNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 6. PAYMENT ORDERS
    // V1: deposit_orders_api (api.py:1072-1217)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits/payments/{pmtNo}/orders")
    @RequirePermission("module.finance.deposit")
    fun getPaymentOrders(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = historyService.getPaymentOrders(pmtNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 7. FILE INFO
    // V1: deposit_file_list_api (api.py:911-965)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits/payments/{pmtNo}/files")
    @RequirePermission("module.finance.deposit")
    fun getFileInfo(@PathVariable pmtNo: String): ResponseEntity<Any> {
        val result = fileService.getFileInfo(pmtNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 8. SERVE FILE
    // V1: deposit_file_serve_api (api.py:968-1010)
    // ═══════════════════════════════════════════════

    @GetMapping("/deposits/payments/{pmtNo}/files/{filename}")
    @RequirePermission("module.finance.deposit")
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
    // V1: deposit_receipt_upload_api (api.py:722-784)
    // ═══════════════════════════════════════════════

    @PostMapping("/deposits/payments/{pmtNo}/files")
    @RequirePermission("module.finance.deposit.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_deposit_upload_file")
    @AuditLog(module = "FINANCE", action = "UPLOAD_DEPOSIT_FILE", riskLevel = "MEDIUM")
    fun uploadFile(
        @PathVariable pmtNo: String,
        @RequestParam("file") file: MultipartFile,
    ): ResponseEntity<Any> {
        // Validate file size (50MB limit)
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
    // V1: deposit_file_delete_api (api.py:1013-1069)
    // ═══════════════════════════════════════════════

    @DeleteMapping("/deposits/payments/{pmtNo}/files/{filename}")
    @RequirePermission("module.finance.deposit.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_deposit_delete_file")
    @AuditLog(module = "FINANCE", action = "DELETE_DEPOSIT_FILE", riskLevel = "MEDIUM")
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
