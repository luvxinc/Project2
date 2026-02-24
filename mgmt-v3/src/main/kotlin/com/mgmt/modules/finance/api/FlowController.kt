package com.mgmt.modules.finance.api

import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.finance.application.usecase.FlowNativeService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * FlowController — Finance flow overview (订收发总览) REST API.
 *
 * Native V3 implementation using FlowNativeService (replaces V1 proxy).
 *
 * Endpoints:
 *   1. GET /finance/flow           — Flow list (全部订单概览)
 *   2. GET /finance/flow/{poNum}   — Flow detail (per-PO logistics breakdown)
 */
@RestController
@RequestMapping("/finance")
class FlowController(
    private val flowNativeService: FlowNativeService,
) {

    // ═══════════════════════════════════════════════
    // 1. FLOW LIST
    // ═══════════════════════════════════════════════

    @GetMapping("/flow")
    @RequirePermission("module.finance.po_payment")
    fun getFlowList(): ResponseEntity<Any> {
        val result = flowNativeService.getFlowList()
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    // ═══════════════════════════════════════════════
    // 2. FLOW DETAIL (per PO)
    // ═══════════════════════════════════════════════

    @GetMapping("/flow/{poNum}")
    @RequirePermission("module.finance.po_payment")
    fun getFlowDetail(@PathVariable poNum: String): ResponseEntity<Any> {
        val result = flowNativeService.getFlowDetail(poNum)
        return ResponseEntity.ok(ApiResponse.ok(result))
    }
}
