package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.ReceiveUseCase
import com.mgmt.modules.purchase.domain.model.Receive
import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * ReceiveController — Inbound receiving + discrepancy management REST API.
 *
 * V1 parity: receive_submit, receive_list, receive_detail,
 *            abnormal_list, abnormal_process, abnormal_delete.
 */
@RestController
@RequestMapping("/purchase/receives")
class ReceiveController(
    private val receiveUseCase: ReceiveUseCase,
) {

    @GetMapping
    @RequirePermission("module.purchase.receive.view")
    fun findAll(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.findAll().map { toResponse(it) }))

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.receive.view")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(receiveUseCase.findOne(id))))

    @GetMapping("/shipment/{shipmentId}")
    @RequirePermission("module.purchase.receive.view")
    fun findByShipment(@PathVariable shipmentId: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.findByShipment(shipmentId).map { toResponse(it) }))

    @PostMapping
    @RequirePermission("module.purchase.receive.create")
    @SecurityLevel(level = "L3", actionKey = "btn_submit_receive")
    @AuditLog(module = "PURCHASE", action = "SUBMIT_RECEIVE", riskLevel = "HIGH")
    fun submit(@RequestBody dto: SubmitReceiveRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(receiveUseCase.submitReceive(dto, currentUsername()).map { toResponse(it) }))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.receive.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_receive")
    @AuditLog(module = "PURCHASE", action = "DELETE_RECEIVE", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to receiveUseCase.softDelete(id, currentUsername()))))

    // ═══════════ Discrepancies ═══════════

    @GetMapping("/diffs/pending")
    @RequirePermission("module.purchase.receive.view")
    fun getPendingDiffs(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.getPendingDiffs().map { toDiffResponse(it) }))

    @GetMapping("/{id}/diffs")
    @RequirePermission("module.purchase.receive.view")
    fun getDiffsByReceive(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.getDiffsByReceive(id).map { toDiffResponse(it) }))

    @PostMapping("/diffs/{diffId}/resolve")
    @RequirePermission("module.purchase.receive.update")
    @AuditLog(module = "PURCHASE", action = "RESOLVE_DIFF", riskLevel = "MEDIUM")
    fun resolveDiff(
        @PathVariable diffId: Long,
        @RequestBody dto: ResolveReceiveDiffRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toDiffResponse(receiveUseCase.resolveDiff(diffId, dto, currentUsername()))))

    // ═══════════ Helpers ═══════════

    private fun toResponse(r: Receive) = ReceiveResponse(
        id = r.id, shipmentId = r.shipmentId, logisticNum = r.logisticNum,
        poNum = r.poNum, sku = r.sku, unitPrice = r.unitPrice.toDouble(),
        sentQuantity = r.sentQuantity, receiveQuantity = r.receiveQuantity,
        receiveDate = r.receiveDate, note = r.note,
        createdAt = r.createdAt, updatedAt = r.updatedAt,
    )

    private fun toDiffResponse(d: ReceiveDiff) = ReceiveDiffResponse(
        id = d.id, receiveId = d.receiveId, logisticNum = d.logisticNum,
        poNum = d.poNum, sku = d.sku, poQuantity = d.poQuantity,
        sentQuantity = d.sentQuantity, receiveQuantity = d.receiveQuantity,
        diffQuantity = d.diffQuantity, status = d.status,
        resolutionNote = d.resolutionNote,
        createdAt = d.createdAt, updatedAt = d.updatedAt,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
