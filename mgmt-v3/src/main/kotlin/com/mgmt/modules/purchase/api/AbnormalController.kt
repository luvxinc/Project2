package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.AbnormalUseCase
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * AbnormalController — Thin REST routing layer for receive-diff (入库异常).
 *
 * V3 architecture §6: "Controller 禁止写业务逻辑"
 * All business logic delegated to [AbnormalUseCase].
 *
 * V1 parity endpoints:
 *   abnormal.py:abnormal_list_api      → GET  /purchase/abnormal
 *   abnormal.py:abnormal_detail_api    → GET  /purchase/abnormal/{logisticNum}
 *   abnormal.py:abnormal_history_api   → GET  /purchase/abnormal/{logisticNum}/history
 *   abnormal.py:abnormal_process_api   → POST /purchase/abnormal/process
 *   abnormal.py:abnormal_delete_api    → POST /purchase/abnormal/delete
 */
@RestController
@RequestMapping("/purchase/abnormal")
class AbnormalController(
    private val abnormalUseCase: AbnormalUseCase,
) {

    // ═══════════════════════════════════════
    // LIST — V1: abnormal_list_api
    // ═══════════════════════════════════════
    @GetMapping
    @RequirePermission("module.purchase.receive.mgmt")
    fun list(
        @RequestParam(defaultValue = "desc") sortOrder: String,
        @RequestParam(defaultValue = "") status: String,
    ): ApiResponse<List<AbnormalListResponse>> {
        return ApiResponse.ok(abnormalUseCase.list(sortOrder, status))
    }

    // ═══════════════════════════════════════
    // DETAIL — V1: abnormal_detail_api
    // ═══════════════════════════════════════
    @GetMapping("/{logisticNum}")
    @RequirePermission("module.purchase.receive.mgmt")
    fun detail(@PathVariable logisticNum: String): ApiResponse<AbnormalDetailResponse> {
        return ApiResponse.ok(abnormalUseCase.detail(logisticNum))
    }

    // ═══════════════════════════════════════
    // HISTORY — V1: abnormal_history_api
    // ═══════════════════════════════════════
    @GetMapping("/{logisticNum}/history")
    @RequirePermission("module.purchase.receive.mgmt")
    fun history(@PathVariable logisticNum: String): ApiResponse<List<Map<String, Any?>>> {
        return ApiResponse.ok(abnormalUseCase.history(logisticNum))
    }

    // ═══════════════════════════════════════
    // PROCESS — V1: abnormal_process_api
    // ═══════════════════════════════════════
    @PostMapping("/process")
    @RequirePermission("module.purchase.receive.mgmt")
    @AuditLog(module = "PURCHASE", action = "PROCESS_ABNORMAL", riskLevel = "HIGH")
    @SecurityLevel(level = "L3", actionKey = "btn_abnormal_process")
    fun process(@RequestBody request: ProcessAbnormalRequest): ResponseEntity<ApiResponse<Map<String, Any>>> {
        return try {
            ResponseEntity.ok(ApiResponse.ok(abnormalUseCase.process(request)))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(ApiResponse.error(e.message ?: "Process failed"))
        }
    }

    // ═══════════════════════════════════════
    // DELETE (ROLLBACK) — V1: abnormal_delete_api
    // ═══════════════════════════════════════
    @PostMapping("/delete")
    @RequirePermission("module.purchase.receive.mgmt")
    @AuditLog(module = "PURCHASE", action = "ROLLBACK_ABNORMAL", riskLevel = "HIGH")
    @SecurityLevel(level = "L3", actionKey = "btn_abnormal_delete")
    fun delete(@RequestBody request: DeleteAbnormalRequest): ResponseEntity<ApiResponse<Map<String, Any>>> {
        return try {
            ResponseEntity.ok(ApiResponse.ok(abnormalUseCase.delete(request)))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(ApiResponse.error(e.message ?: "Delete failed"))
        }
    }
}
