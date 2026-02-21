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
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

/**
 * ReceiveController — Inbound receiving + discrepancy management REST API.
 *
 * V1 parity endpoints:
 *   receive/query.py         → GET  /purchase/receives/pending-shipments        (货物入库 - 待入库列表)
 *                            → GET  /purchase/receives/shipment-items           (货物入库 - 发货明细)
 *   receive/submit.py        → POST /purchase/receives                          (货物入库 - 提交入库)
 *   receive_mgmt/list.py     → GET  /purchase/receives/management               (入库管理 - 列表)
 *   receive_mgmt/detail.py   → GET  /purchase/receives/management/{logisticNum} (入库管理 - 详情)
 *   receive_mgmt/edit.py     → PUT  /purchase/receives/management/{logisticNum} (入库管理 - 修改)
 *   receive_mgmt/delete.py   → DELETE /purchase/receives/management/{logisticNum} (入库管理 - 删除)
 *                            → POST /purchase/receives/management/{logisticNum}/restore (入库管理 - 恢复)
 *   receive_mgmt/history.py  → GET  /purchase/receives/management/{logisticNum}/history (入库管理 - 历史)
 *                            → GET  /purchase/receives/diffs/pending            (差异列表)
 *                            → GET  /purchase/receives/{id}/diffs               (单条差异)
 *                            → POST /purchase/receives/diffs/{diffId}/resolve   (差异处置)
 */
@RestController
@RequestMapping("/purchase/receives")
class ReceiveController(
    private val receiveUseCase: ReceiveUseCase,
) {

    // ═══════════ Receive Goods — 货物入库 ═══════════

    /**
     * V1: get_pending_shipments_api
     * Returns shipments with sent_date <= receiveDate that haven't been received yet.
     */
    @GetMapping("/pending-shipments")
    @RequirePermission("module.purchase.receive")
    fun getPendingShipments(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) receiveDate: LocalDate,
    ): ResponseEntity<Any> {
        val shipments = receiveUseCase.findPendingShipments(receiveDate)
        return ResponseEntity.ok(ApiResponse.ok(shipments))
    }

    /**
     * V1: get_shipment_items_api
     * Returns items GROUPED BY (po_num, po_sku) with SUM(sent_quantity).
     * V1 parity: query.py L267-286 — different price tiers merged into single rows.
     */
    @GetMapping("/shipment-items")
    @RequirePermission("module.purchase.receive")
    fun getShipmentItems(@RequestParam logisticNum: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.findShipmentItems(logisticNum)))


    /**
     * V1: submit_receive_api
     * Permission: module.purchase.receive
     * Security: L3 (btn_receive_confirm)
     */
    @PostMapping
    @RequirePermission("module.purchase.receive.create")
    @SecurityLevel(level = "L3", actionKey = "btn_receive_confirm")
    @AuditLog(module = "PURCHASE", action = "SUBMIT_RECEIVE", riskLevel = "HIGH")
    fun submit(@RequestBody dto: SubmitReceiveRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(receiveUseCase.submitReceive(dto, currentUsername()).map { toResponse(it) }))

    // ═══════════ Receiving Management — 入库管理 ═══════════

    /**
     * V1: receive_list_api
     * Returns all logistic nums with computed status (IN_TRANSIT/ALL_RECEIVED/DIFF_UNRESOLVED/DIFF_RESOLVED/DELETED).
     * V1 parity P1-3: supports ?sort_by=logisticNum&sort_order=asc
     */
    @GetMapping("/management")
    @RequirePermission("module.purchase.receive.mgmt")
    fun listManagement(
        @RequestParam(defaultValue = "receiveDate") sortBy: String,
        @RequestParam(defaultValue = "desc") sortOrder: String,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.findForManagement(sortBy, sortOrder)))


    /**
     * V1: receive_detail_api
     * Returns full detail for one logistic_num including items + diffs.
     */
    @GetMapping("/management/{logisticNum}")
    @RequirePermission("module.purchase.receive.mgmt")
    fun getManagementDetail(@PathVariable logisticNum: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.findManagementDetail(logisticNum)))

    /**
     * V1: receive_edit_submit_api
     * Adjusts receive_quantity. Auto-updates diff records.
     * Security: L3 (btn_receive_mgmt_edit)
     */
    @PutMapping("/management/{logisticNum}")
    @RequirePermission("module.purchase.receive.update")
    @SecurityLevel(level = "L3", actionKey = "btn_receive_mgmt_edit")
    @AuditLog(module = "PURCHASE", action = "EDIT_RECEIVE", riskLevel = "HIGH")
    fun editReceive(
        @PathVariable logisticNum: String,
        @RequestBody dto: EditReceiveRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.editReceive(logisticNum, dto, currentUsername())))

    /**
     * V1: submit_receive_delete_api
     * Soft-deletes all receive records for logistic_num + marks diffs deleted.
     * Security: L3 (btn_receive_delete)
     */
    @DeleteMapping("/management/{logisticNum}")
    @RequirePermission("module.purchase.receive.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_receive_delete")
    @AuditLog(module = "PURCHASE", action = "DELETE_RECEIVE", riskLevel = "HIGH")
    fun deleteReceive(
        @PathVariable logisticNum: String,
        @RequestBody dto: DeleteReceiveRequest,
    ): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to receiveUseCase.deleteReceive(logisticNum, dto.note, currentUsername()))))

    /**
     * V1: submit_receive_undelete_api
     * Restores soft-deleted receive records for logistic_num.
     * Security: L3 (btn_receive_undelete)
     */
    @PostMapping("/management/{logisticNum}/restore")
    @RequirePermission("module.purchase.receive.update")
    @SecurityLevel(level = "L3", actionKey = "btn_receive_undelete")
    @AuditLog(module = "PURCHASE", action = "RESTORE_RECEIVE", riskLevel = "HIGH")
    fun restoreReceive(@PathVariable logisticNum: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to receiveUseCase.restoreReceive(logisticNum, currentUsername()))))

    /**
     * V1: get_receive_history_api
     * Returns all revision versions (receive + diff history) for a logistic_num.
     */
    @GetMapping("/management/{logisticNum}/history")
    @RequirePermission("module.purchase.receive.mgmt")
    fun getHistory(@PathVariable logisticNum: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(receiveUseCase.getHistory(logisticNum)))

    // ═══════════ Discrepancies — 差异管理 ═══════════

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

    // ═══════════ Legacy — simple by-ID endpoints ═══════════

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

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.receive.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_receive")
    @AuditLog(module = "PURCHASE", action = "DELETE_RECEIVE", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to receiveUseCase.softDelete(id, currentUsername()))))

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
