package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.PurchaseOrderUseCase
import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * PurchaseOrderController — PO lifecycle REST API.
 *
 * V1 parity: po_create, po_list, po_detail, po_edit, po_delete/undelete.
 *
 * Endpoints (8):
 *   GET    /purchase/orders                - PO list (paginated)
 *   GET    /purchase/orders/{id}           - PO detail with items + strategy
 *   POST   /purchase/orders               - Create PO
 *   PATCH  /purchase/orders/{id}          - Update PO (status / items)
 *   DELETE /purchase/orders/{id}          - Soft delete
 *   POST   /purchase/orders/{id}/restore  - Restore soft-deleted PO
 */
@RestController
@RequestMapping("/purchase/orders")
class PurchaseOrderController(
    private val poUseCase: PurchaseOrderUseCase,
) {

    @GetMapping
    @RequirePermission("module.purchase.po.view")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) supplierCode: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) dateFrom: String?,
        @RequestParam(required = false) dateTo: String?,
    ): ResponseEntity<Any> {
        val params = PurchaseOrderQueryParams(
            page = page, limit = limit, search = search,
            supplierCode = supplierCode, status = status,
            dateFrom = dateFrom?.let { java.time.LocalDate.parse(it) },
            dateTo = dateTo?.let { java.time.LocalDate.parse(it) },
        )
        val (orders, total) = poUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = orders.map { toResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.po.view")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> {
        val po = poUseCase.findOne(id)
        val items = poUseCase.getItems(id)
        val strategy = poUseCase.getStrategy(id)
        return ResponseEntity.ok(ApiResponse.ok(toDetailResponse(po, items, strategy)))
    }

    @PostMapping
    @RequirePermission("module.purchase.po.create")
    @SecurityLevel(level = "L3", actionKey = "btn_submit_po")
    @AuditLog(module = "PURCHASE", action = "CREATE_PO", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreatePurchaseOrderRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(poUseCase.create(dto, currentUsername()))))

    @PatchMapping("/{id}")
    @RequirePermission("module.purchase.po.update")
    @AuditLog(module = "PURCHASE", action = "UPDATE_PO", riskLevel = "HIGH")
    fun update(@PathVariable id: Long, @RequestBody dto: UpdatePurchaseOrderRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(poUseCase.update(id, dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.po.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_po")
    @AuditLog(module = "PURCHASE", action = "DELETE_PO", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to poUseCase.softDelete(id, currentUsername()))))

    @PostMapping("/{id}/restore")
    @RequirePermission("module.purchase.po.update")
    @AuditLog(module = "PURCHASE", action = "RESTORE_PO", riskLevel = "MEDIUM")
    fun restore(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(poUseCase.restore(id, currentUsername()))))

    // ═══════════ Helpers ═══════════

    private fun toResponse(po: PurchaseOrder) = PurchaseOrderResponse(
        id = po.id, poNum = po.poNum, supplierId = po.supplierId,
        supplierCode = po.supplierCode, poDate = po.poDate, status = po.status,
        createdAt = po.createdAt, updatedAt = po.updatedAt,
    )

    private fun toDetailResponse(
        po: PurchaseOrder,
        items: List<PurchaseOrderItem>,
        strategy: PurchaseOrderStrategy?,
    ) = PurchaseOrderResponse(
        id = po.id, poNum = po.poNum, supplierId = po.supplierId,
        supplierCode = po.supplierCode, poDate = po.poDate, status = po.status,
        items = items.map { toItemResponse(it) },
        strategy = strategy?.let { toStrategyResponse(it) },
        createdAt = po.createdAt, updatedAt = po.updatedAt,
    )

    private fun toItemResponse(item: PurchaseOrderItem) = PurchaseOrderItemResponse(
        id = item.id, sku = item.sku, quantity = item.quantity,
        unitPrice = item.unitPrice.toDouble(), currency = item.currency,
        exchangeRate = item.exchangeRate.toDouble(), note = item.note,
    )

    private fun toStrategyResponse(s: PurchaseOrderStrategy) = PurchaseOrderStrategyResponse(
        id = s.id, strategyDate = s.strategyDate, currency = s.currency,
        exchangeRate = s.exchangeRate.toDouble(), rateMode = s.rateMode,
        floatEnabled = s.floatEnabled, floatThreshold = s.floatThreshold.toDouble(),
        requireDeposit = s.requireDeposit, depositRatio = s.depositRatio.toDouble(),
        note = s.note,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
