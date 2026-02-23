package com.mgmt.modules.finance.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.application.usecase.PrepaymentBalanceService
import com.mgmt.modules.finance.application.usecase.PrepaymentUseCase
import com.mgmt.modules.finance.infrastructure.PrepaymentFileService
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
 * PrepaymentController — Finance prepayment REST API.
 *
 * V1 parity: backend/apps/finance/views/prepay/api.py (1115 lines, 11 endpoints)
 *
 * Endpoints:
 *   GET    /finance/prepayments/balances              — All supplier balances
 *   GET    /finance/prepayments/transactions           — Transaction list with filters
 *   POST   /finance/prepayments                        — Create new prepayment (deposit)
 *   GET    /finance/prepayments/{paymentNo}/history     — 3-column history view
 *   DELETE /finance/prepayments/{id}                    — Soft delete
 *   POST   /finance/prepayments/{id}/restore            — Restore deleted
 *   GET    /finance/prepayments/{paymentNo}/files        — File info
 *   GET    /finance/prepayments/{paymentNo}/files/{fn}   — Download file
 *   POST   /finance/prepayments/{paymentNo}/files        — Upload file
 *   DELETE /finance/prepayments/{paymentNo}/files/{fn}   — Delete file
 *   GET    /finance/exchange-rate                        — Get exchange rate
 */
@RestController
@RequestMapping("/finance")
class PrepaymentController(
    private val prepaymentUseCase: PrepaymentUseCase,
    private val balanceService: PrepaymentBalanceService,
    private val fileService: PrepaymentFileService,
) {

    // ═══════════════════════════════════════════════
    // 1. ALL SUPPLIER BALANCES
    // V1: supplier_balance_api
    // ═══════════════════════════════════════════════

    @GetMapping("/prepayments/balances")
    @RequirePermission("module.finance.prepay")
    fun getAllBalances(): ResponseEntity<Any> {
        val balances = balanceService.getAllBalances()
        return ResponseEntity.ok(ApiResponse.ok(balances))
    }

    // ═══════════════════════════════════════════════
    // 2. TRANSACTION LIST
    // V1: transaction_list_api
    // ═══════════════════════════════════════════════

    @GetMapping("/prepayments/transactions")
    @RequirePermission("module.finance.prepay")
    fun getTransactions(
        @RequestParam supplierCode: String,
        @RequestParam(required = false) dateFrom: String?,
        @RequestParam(required = false) dateTo: String?,
        @RequestParam(required = false) preset: String?,
    ): ResponseEntity<Any> {
        val params = TransactionQueryParams(
            supplierCode = supplierCode,
            dateFrom = dateFrom,
            dateTo = dateTo,
            preset = preset,
        )
        val result = prepaymentUseCase.getTransactionList(params)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 3. CREATE PREPAYMENT
    // V1: submit_prepay_api (supports FormData with file OR JSON)
    // ═══════════════════════════════════════════════

    @PostMapping("/prepayments")
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_prepay_submit")
    @AuditLog(module = "FINANCE", action = "CREATE_PREPAYMENT", riskLevel = "HIGH")
    fun createPrepayment(@RequestBody dto: CreatePrepaymentRequest): ResponseEntity<Any> {
        val result = prepaymentUseCase.createPrepayment(dto, currentUsername())
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(result))
    }

    /**
     * Create prepayment with file upload (multipart/form-data).
     * V1: submit_prepay_api supports FormData format (api.py L317-327)
     */
    @PostMapping("/prepayments", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_prepay_submit")
    @AuditLog(module = "FINANCE", action = "CREATE_PREPAYMENT", riskLevel = "HIGH")
    fun createPrepaymentWithFile(
        @RequestParam supplierCode: String,
        @RequestParam tranDate: String,
        @RequestParam tranCurrReq: String,
        @RequestParam tranCurrUse: String,
        @RequestParam exchangeRate: String,
        @RequestParam(defaultValue = "manual") rateMode: String,
        @RequestParam amount: String,
        @RequestParam note: String,
        @RequestParam(required = false) file: MultipartFile?,
    ): ResponseEntity<Any> {
        val dto = CreatePrepaymentRequest(
            supplierCode = supplierCode,
            tranDate = java.time.LocalDate.parse(tranDate),
            tranCurrReq = tranCurrReq,
            tranCurrUse = tranCurrUse,
            exchangeRate = java.math.BigDecimal(exchangeRate),
            rateMode = rateMode,
            amount = java.math.BigDecimal(amount),
            note = note,
        )
        val result = prepaymentUseCase.createPrepayment(dto, currentUsername())

        // Handle file upload (V1: api.py L401-431)
        var fileSaved = false
        if (file != null && !file.isEmpty) {
            try {
                fileService.saveFile(result.tranNum, file.originalFilename ?: "file", file.bytes)
                fileSaved = true
            } catch (e: Exception) {
                // File save failure doesn't affect main flow (V1: api.py L428-431)
            }
        }

        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(result.copy(fileSaved = fileSaved)))
    }

    // ═══════════════════════════════════════════════
    // 4. HISTORY (3-column layout)
    // V1: prepay_history_api
    // ═══════════════════════════════════════════════

    @GetMapping("/prepayments/{paymentNo}/history")
    @RequirePermission("module.finance.prepay")
    fun getHistory(@PathVariable paymentNo: String): ResponseEntity<Any> {
        val result = prepaymentUseCase.getHistory(paymentNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 5. SOFT DELETE
    // V1: prepay_delete_api
    // ═══════════════════════════════════════════════

    @DeleteMapping("/prepayments/{id}")
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L3", actionKey = "btn_prepay_delete")
    @AuditLog(module = "FINANCE", action = "DELETE_PREPAYMENT", riskLevel = "HIGH")
    fun softDelete(@PathVariable id: Long): ResponseEntity<Any> {
        prepaymentUseCase.softDelete(id, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(mapOf("success" to true, "message" to "finance.messages.prepaymentDeleted")))
    }

    // ═══════════════════════════════════════════════
    // 6. RESTORE
    // V1: prepay_restore_api
    // ═══════════════════════════════════════════════

    @PostMapping("/prepayments/{id}/restore")
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_prepay_undelete")
    @AuditLog(module = "FINANCE", action = "RESTORE_PREPAYMENT", riskLevel = "MEDIUM")
    fun restore(@PathVariable id: Long): ResponseEntity<Any> {
        prepaymentUseCase.restore(id, currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(mapOf("success" to true, "message" to "finance.messages.prepaymentRestored")))
    }

    // ═══════════════════════════════════════════════
    // 7. FILE INFO
    // V1: file_info_api
    // ═══════════════════════════════════════════════

    @GetMapping("/prepayments/{paymentNo}/files")
    @RequirePermission("module.finance.prepay")
    fun getFileInfo(@PathVariable paymentNo: String): ResponseEntity<Any> {
        val result = fileService.getFileInfo(paymentNo)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 8. SERVE FILE (download/preview)
    // V1: serve_file_api (includes HEIC→JPEG conversion)
    // ═══════════════════════════════════════════════

    @GetMapping("/prepayments/{paymentNo}/files/{filename}")
    @RequirePermission("module.finance.prepay")
    fun serveFile(
        @PathVariable paymentNo: String,
        @PathVariable filename: String,
    ): ResponseEntity<Any> {
        val filePath = fileService.resolveFilePath(paymentNo, filename)
            ?: return ResponseEntity.notFound().build()

        // V1: HEIC→JPEG conversion (api.py L926-944)
        // Note: HEIC conversion requires external library; for now serve as-is
        // TODO: Add pillow-heif equivalent for JVM if needed

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
    // V1: upload_file_api
    // ═══════════════════════════════════════════════

    @PostMapping("/prepayments/{paymentNo}/files")
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_prepay_upload_file")
    @AuditLog(module = "FINANCE", action = "UPLOAD_PREPAY_FILE", riskLevel = "MEDIUM")
    fun uploadFile(
        @PathVariable paymentNo: String,
        @RequestParam("file") file: MultipartFile,
    ): ResponseEntity<Any> {
        // Validate file size (V1: 50MB limit, api.py L979-981)
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
    // V1: delete_file_api
    // ═══════════════════════════════════════════════

    @DeleteMapping("/prepayments/{paymentNo}/files/{filename}")
    @RequirePermission("module.finance.prepay.manage")
    @SecurityLevel(level = "L2", actionKey = "btn_prepay_delete_file")
    @AuditLog(module = "FINANCE", action = "DELETE_PREPAY_FILE", riskLevel = "MEDIUM")
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
    // 11. EXCHANGE RATE
    // V1: rate_api
    // ═══════════════════════════════════════════════

    @GetMapping("/exchange-rate")
    @RequirePermission("module.finance.prepay")
    fun getExchangeRate(): ResponseEntity<Any> {
        val result = prepaymentUseCase.getExchangeRate()
        return ResponseEntity.ok(ApiResponse.ok(result))
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
