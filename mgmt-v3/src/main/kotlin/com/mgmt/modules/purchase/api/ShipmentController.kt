package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.ShipmentUseCase
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.model.ShipmentItem
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * ShipmentController — Logistics shipment REST API.
 *
 * V1 parity: send_submit, send_list, send_detail, send_delete/undelete.
 */
@RestController
@RequestMapping("/purchase/shipments")
class ShipmentController(
    private val shipmentUseCase: ShipmentUseCase,
) {

    @GetMapping
    @RequirePermission("module.purchase.shipment.view")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) status: String?,
    ): ResponseEntity<Any> {
        val params = ShipmentQueryParams(page = page, limit = limit, search = search, status = status)
        val (shipments, total) = shipmentUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = shipments.map { toResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.shipment.view")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> {
        val shipment = shipmentUseCase.findOne(id)
        val items = shipmentUseCase.getItems(id)
        return ResponseEntity.ok(ApiResponse.ok(toDetailResponse(shipment, items)))
    }

    @PostMapping
    @RequirePermission("module.purchase.shipment.create")
    @SecurityLevel(level = "L3", actionKey = "btn_submit_send")
    @AuditLog(module = "PURCHASE", action = "CREATE_SHIPMENT", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreateShipmentRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(shipmentUseCase.create(dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.shipment.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_send")
    @AuditLog(module = "PURCHASE", action = "DELETE_SHIPMENT", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to shipmentUseCase.softDelete(id, currentUsername()))))

    @PostMapping("/{id}/restore")
    @RequirePermission("module.purchase.shipment.update")
    @AuditLog(module = "PURCHASE", action = "RESTORE_SHIPMENT", riskLevel = "MEDIUM")
    fun restore(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(shipmentUseCase.restore(id, currentUsername()))))

    // ═══════════ Helpers ═══════════

    private fun toResponse(s: Shipment) = ShipmentResponse(
        id = s.id, logisticNum = s.logisticNum, sentDate = s.sentDate,
        etaDate = s.etaDate, pallets = s.pallets,
        logisticsCost = s.logisticsCost.toDouble(), exchangeRate = s.exchangeRate.toDouble(),
        status = s.status, note = s.note,
        createdAt = s.createdAt, updatedAt = s.updatedAt,
    )

    private fun toDetailResponse(s: Shipment, items: List<ShipmentItem>) = ShipmentResponse(
        id = s.id, logisticNum = s.logisticNum, sentDate = s.sentDate,
        etaDate = s.etaDate, pallets = s.pallets,
        logisticsCost = s.logisticsCost.toDouble(), exchangeRate = s.exchangeRate.toDouble(),
        status = s.status, note = s.note,
        items = items.map { toItemResponse(it) },
        createdAt = s.createdAt, updatedAt = s.updatedAt,
    )

    private fun toItemResponse(item: ShipmentItem) = ShipmentItemResponse(
        id = item.id, poNum = item.poNum, sku = item.sku,
        quantity = item.quantity, unitPrice = item.unitPrice.toDouble(),
        poChange = item.poChange, note = item.note,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
