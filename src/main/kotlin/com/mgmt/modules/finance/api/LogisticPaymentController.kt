package com.mgmt.modules.finance.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.application.usecase.LogisticListService
import com.mgmt.modules.finance.application.usecase.LogisticPaymentHistoryService
import com.mgmt.modules.finance.application.usecase.LogisticPaymentUseCase
import com.mgmt.modules.finance.infrastructure.LogisticPaymentFileService
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
 * LogisticPaymentController — Finance logistics cost REST API.
 *
 *
 * Endpoints:
 *   GET    /finance/logistics                                  — Logistics cost list
 *   POST   /finance/logistics/payments                         — Submit batch payment
 *   DELETE /finance/logistics/payments/{paymentNo}              — Delete payment
 *   POST   /finance/logistics/payments/{paymentNo}/restore      — Restore payment
 *   GET    /finance/logistics/payments/{paymentNo}/history      — Payment history
 *   GET    /finance/logistics/payments/{paymentNo}/orders       — Payment orders
 *   GET    /finance/logistics/payments/{paymentNo}/files        — File info
 *   GET    /finance/logistics/payments/{paymentNo}/files/{fn}   — Serve file
 *   POST   /finance/logistics/payments/{paymentNo}/files        — Upload file
 *   DELETE /finance/logistics/payments/{paymentNo}/files/{fn}   — Delete file
 */
@RestController
@RequestMapping("/finance")
class LogisticPaymentController(
    private val logisticListService: LogisticListService,
    private val logisticPaymentUseCase: LogisticPaymentUseCase,
    private val historyService: LogisticPaymentHistoryService,
    private val fileService: LogisticPaymentFileService,
) {

    // ═══════════════════════════════════════════════
    // 1. LOGISTICS COST LIST
    // V1: logistic_list_api (logistic.py:31-316)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics")
    @RequirePermission("module.finance.logistic")
    fun getLogisticList(
        @RequestParam(defaultValue = "date_sent") sortBy: String,
        @RequestParam(defaultValue = "desc") sortOrder: String,
    ): ResponseEntity<Any> {
        val result = logisticListService.getLogisticList(sortBy, sortOrder)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 2. SUBMIT BATCH PAYMENT
    // V1: submit_payment_api (submit.py:22-206)
    // ═══════════════════════════════════════════════

    @PostMapping("/logistics/payments")
    @RequirePermission("module.finance.logistic.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_logistic_payment_submit")
    @AuditLog(module = "FINANCE", action = "CREATE_LOGISTIC_PAYMENT", riskLevel = "HIGH")
    fun submitPayment(@RequestBody request: SubmitPaymentRequest): ResponseEntity<Any> {
        val result = logisticPaymentUseCase.submitPayment(request, currentUsername())
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 3. DELETE PAYMENT (soft delete by paymentNo)
    // V1: delete_payment_api (submit.py:211-283)
    // ═══════════════════════════════════════════════

    @DeleteMapping("/logistics/payments/{paymentNo}")
    @RequirePermission("module.finance.logistic.manage")
    @SecurityLevel(level = "L3", actionKey = "btn_logistic_payment_delete")
    @AuditLog(module = "FINANCE", action = "DELETE_LOGISTIC_PAYMENT", riskLevel = "HIGH")
    fun deletePayment(@PathVariable paymentNo: String): ResponseEntity<Any> {
        val result = logisticPaymentUseCase.deletePayment(paymentNo, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 4. RESTORE PAYMENT
    // V1: restore_payment_api (submit.py:286-397)
    // ═══════════════════════════════════════════════

    @PostMapping("/logistics/payments/{paymentNo}/restore")
    @RequirePermission("module.finance.logistic.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_logistic_payment_restore")
    @AuditLog(module = "FINANCE", action = "RESTORE_LOGISTIC_PAYMENT", riskLevel = "MEDIUM")
    fun restorePayment(@PathVariable paymentNo: String): ResponseEntity<Any> {
        val result = logisticPaymentUseCase.restorePayment(paymentNo, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 5. PAYMENT HISTORY
    // V1: payment_history_api (history.py:92-183)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics/payments/{paymentNo}/history")
    @RequirePermission("module.finance.logistic")
    fun getPaymentHistory(
        @PathVariable paymentNo: String,
        @RequestParam(required = false) logisticNum: String?,
    ): ResponseEntity<Any> {
        val result = historyService.getPaymentHistory(paymentNo, logisticNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 6. PAYMENT ORDERS
    // V1: payment_orders_api (history.py:186-249)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics/payments/{paymentNo}/orders")
    @RequirePermission("module.finance.logistic")
    fun getPaymentOrders(
        @PathVariable paymentNo: String,
        @RequestParam(required = false) logisticNum: String?,
    ): ResponseEntity<Any> {
        val result = historyService.getPaymentOrders(paymentNo, logisticNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 5b/6b. SHIPMENT-LEVEL HISTORY & ORDERS (for unpaid logistics)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics/{logisticNum}/history")
    @RequirePermission("module.finance.logistic")
    fun getShipmentHistory(@PathVariable logisticNum: String): ResponseEntity<Any> {
        val result = historyService.getShipmentHistory(logisticNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    @GetMapping("/logistics/{logisticNum}/orders")
    @RequirePermission("module.finance.logistic")
    fun getShipmentOrders(@PathVariable logisticNum: String): ResponseEntity<Any> {
        val result = historyService.getShipmentOrders(logisticNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 7. FILE INFO
    // V1: check_payment_files_api + get_payment_files_api (file_ops.py)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics/payments/{paymentNo}/files")
    @RequirePermission("module.finance.logistic")
    fun getFileInfo(@PathVariable paymentNo: String): ResponseEntity<Any> {
        val result = fileService.getFileInfo(paymentNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 8. SERVE FILE
    // V1: serve_payment_file_api (file_ops.py:178-227)
    // ═══════════════════════════════════════════════

    @GetMapping("/logistics/payments/{paymentNo}/files/{filename}")
    @RequirePermission("module.finance.logistic")
    fun serveFile(
        @PathVariable paymentNo: String,
        @PathVariable filename: String,
    ): ResponseEntity<Any> {
        val filePath = fileService.resolveFilePath(paymentNo, filename)
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
    // V1: upload_payment_file_api (file_ops.py:108-175)
    // ═══════════════════════════════════════════════

    @PostMapping("/logistics/payments/{paymentNo}/files")
    @RequirePermission("module.finance.logistic.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_logistic_payment_upload_file")
    @AuditLog(module = "FINANCE", action = "UPLOAD_LOGISTIC_FILE", riskLevel = "MEDIUM")
    fun uploadFile(
        @PathVariable paymentNo: String,
        @RequestParam("file") file: MultipartFile,
    ): ResponseEntity<Any> {
        // Validate file size (50MB limit, same as Prepay)
        val maxSize = 50L * 1024 * 1024
        if (file.size > maxSize) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error<Any>("finance.errors.fileTooLarge"))
        }

        val filename = fileService.saveFile(paymentNo, file.originalFilename ?: "file", file.bytes)
        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "filename" to filename,
            "message" to "finance.messages.fileUploaded",
        )))
    }

    // ═══════════════════════════════════════════════
    // 10. DELETE FILE
    // V1: delete_payment_file_api (file_ops.py:230-282)
    // ═══════════════════════════════════════════════

    @DeleteMapping("/logistics/payments/{paymentNo}/files/{filename}")
    @RequirePermission("module.finance.logistic.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_logistic_payment_delete_file")
    @AuditLog(module = "FINANCE", action = "DELETE_LOGISTIC_FILE", riskLevel = "MEDIUM")
    fun deleteFile(
        @PathVariable paymentNo: String,
        @PathVariable filename: String,
    ): ResponseEntity<Any> {
        val deleted = fileService.deleteFile(paymentNo, filename)
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
