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
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.ReceiveDiffRepository
import com.mgmt.modules.purchase.domain.repository.ReceiveRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentItemRepository
import com.mgmt.modules.purchase.infrastructure.excel.ShipmentExcelService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

/**
 * ShipmentController — Logistics shipment REST API.
 *
 * V1 parity: send_submit, send_list, send_detail, send_delete/undelete.
 */
@RestController
@RequestMapping("/purchase/shipments")
class ShipmentController(
    private val shipmentUseCase: ShipmentUseCase,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val receiveRepo: ReceiveRepository,
    private val receiveDiffRepo: ReceiveDiffRepository,
    private val shipmentExcelService: ShipmentExcelService,
) {

    @GetMapping
    @RequirePermission("module.purchase.send")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) dateFrom: LocalDate?,
        @RequestParam(required = false) dateTo: LocalDate?,
        @RequestParam(defaultValue = "false") includeDeleted: Boolean,
    ): ResponseEntity<Any> {
        val params = ShipmentQueryParams(
            page = page, limit = limit, search = search, status = status,
            dateFrom = dateFrom, dateTo = dateTo, includeDeleted = includeDeleted,
        )
        val (shipments, total) = shipmentUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = shipments.map { toListResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.send")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> {
        val shipment = shipmentUseCase.findOne(id)
        val items = shipmentUseCase.getItems(id)
        return ResponseEntity.ok(ApiResponse.ok(toDetailResponse(shipment, items)))
    }

    @PostMapping
    @RequirePermission("module.purchase.send.add")
    @SecurityLevel(level = "L3", actionKey = "btn_submit_send")
    @AuditLog(module = "PURCHASE", action = "CREATE_SHIPMENT", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreateShipmentRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toListResponse(shipmentUseCase.create(dto, currentUsername()))))

    @PatchMapping("/{id}")
    @RequirePermission("module.purchase.send.mgmt")
    @SecurityLevel(level = "L3", actionKey = "btn_edit_send")
    @AuditLog(module = "PURCHASE", action = "UPDATE_SHIPMENT", riskLevel = "HIGH")
    fun update(@PathVariable id: Long, @RequestBody dto: UpdateShipmentRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toListResponse(shipmentUseCase.update(id, dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.send.mgmt")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_send")
    @AuditLog(module = "PURCHASE", action = "DELETE_SHIPMENT", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to shipmentUseCase.softDelete(id, currentUsername()))))

    @PostMapping("/{id}/restore")
    @RequirePermission("module.purchase.send.mgmt")
    @SecurityLevel(level = "L2", actionKey = "btn_restore_send")
    @AuditLog(module = "PURCHASE", action = "RESTORE_SHIPMENT", riskLevel = "MEDIUM")
    fun restore(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toListResponse(shipmentUseCase.restore(id, currentUsername()))))

    @GetMapping("/available-pos")
    @RequirePermission("module.purchase.send")
    fun getAvailablePos(@RequestParam(required = false) sentDate: LocalDate?): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(shipmentUseCase.getAvailablePos(sentDate)))

    @GetMapping("/template")
    @RequirePermission("module.purchase.send")
    fun downloadTemplate(@RequestParam sentDate: LocalDate): ResponseEntity<ByteArray> {
        val availablePos = shipmentUseCase.getAvailablePos(sentDate)
        val bytes = shipmentExcelService.generateTemplate(sentDate, availablePos)
        return excelResponse(bytes, "shipment_template_$sentDate.xlsx")
    }

    @GetMapping("/{id}/export")
    @RequirePermission("module.purchase.send")
    fun exportShipment(
        @PathVariable id: Long,
        @RequestParam(defaultValue = "mgmt") type: String,
    ): ResponseEntity<ByteArray> {
        val shipment = shipmentUseCase.findOne(id)
        val itemContexts = shipmentUseCase.prepareExportContexts(id)
        val latestEvent = shipmentUseCase.getLatestEvent(id)
        val bytes = shipmentExcelService.exportShipment(shipment, itemContexts, latestEvent, type)
        return excelResponse(bytes, "shipment_${shipment.logisticNum}_$type.xlsx")
    }

    @GetMapping("/{id}/history")
    @RequirePermission("module.purchase.send")
    fun getHistory(@PathVariable id: Long): ResponseEntity<Any> {
        val events = shipmentUseCase.getHistory(id)
        return ResponseEntity.ok(ApiResponse.ok(events.map { e ->
            ShipmentEventResponse(
                id = e.id,
                shipmentId = e.shipmentId,
                logisticNum = e.logisticNum,
                eventType = e.eventType,
                eventSeq = e.eventSeq,
                changes = e.changes,
                note = e.note,
                operator = e.operator,
                createdAt = e.createdAt,
            )
        }))
    }

    // ═══════════ Helpers ═══════════

    /**
     * V1 parity: compute receive status from receives + diffs.
     * IN_TRANSIT       — no active receives or all receiveQty = 0
     * ALL_RECEIVED     — sentQty == receivedQty across all rows
     * DIFF_UNRESOLVED  — mismatch && any diff is pending
     * DIFF_RESOLVED    — mismatch && all diffs resolved
     */
    private fun computeReceiveStatus(logisticNum: String): String {
        val receives = receiveRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
        val receivedQty = receives.sumOf { it.receiveQuantity }
        if (receives.isEmpty() || receivedQty == 0) return "IN_TRANSIT"

        val sentQty = receives.sumOf { it.sentQuantity }
        if (sentQty == receivedQty) return "ALL_RECEIVED"

        // Has discrepancy — check diffs
        val diffs = receiveDiffRepo.findAllByLogisticNum(logisticNum)
        return if (diffs.any { it.status == "pending" }) "DIFF_UNRESOLVED" else "DIFF_RESOLVED"
    }

    private fun toListResponse(s: Shipment): ShipmentResponse {
        val itemCount = shipmentItemRepo.countByShipmentId(s.id)
        val totalValue = shipmentItemRepo.sumValueByShipmentId(s.id)?.toDouble()
            ?.let { Math.round(it * 100000.0) / 100000.0 } ?: 0.0
        val receiveStatus = if (s.deletedAt != null) "IN_TRANSIT" else computeReceiveStatus(s.logisticNum)
        return ShipmentResponse(
            id = s.id, logisticNum = s.logisticNum, sentDate = s.sentDate,
            etaDate = s.etaDate, pallets = s.pallets,
            totalWeight = s.totalWeight.toDouble(), priceKg = s.priceKg.toDouble(),
            logisticsCost = s.logisticsCost.toDouble(), exchangeRate = s.exchangeRate.toDouble(),
            rateMode = s.rateMode,
            status = s.status, note = s.note,
            itemCount = itemCount,
            totalValue = totalValue,
            isDeleted = s.deletedAt != null,
            createdBy = s.createdBy,
            updatedBy = s.updatedBy,
            createdAt = s.createdAt, updatedAt = s.updatedAt,
            receiveStatus = receiveStatus,
        )
    }

    private fun toDetailResponse(s: Shipment, items: List<ShipmentItem>): ShipmentResponse {
        val totalValue = items.sumOf { it.quantity * it.unitPrice.toDouble() }
            .let { Math.round(it * 100000.0) / 100000.0 }
        val receiveStatus = if (s.deletedAt != null) "IN_TRANSIT" else computeReceiveStatus(s.logisticNum)
        return ShipmentResponse(
            id = s.id, logisticNum = s.logisticNum, sentDate = s.sentDate,
            etaDate = s.etaDate, pallets = s.pallets,
            totalWeight = s.totalWeight.toDouble(), priceKg = s.priceKg.toDouble(),
            logisticsCost = s.logisticsCost.toDouble(), exchangeRate = s.exchangeRate.toDouble(),
            rateMode = s.rateMode,
            status = s.status, note = s.note,
            items = items.map { toItemResponse(it) },
            itemCount = items.size,
            totalValue = totalValue,
            isDeleted = s.deletedAt != null,
            createdBy = s.createdBy,
            updatedBy = s.updatedBy,
            createdAt = s.createdAt, updatedAt = s.updatedAt,
            receiveStatus = receiveStatus,
        )
    }

    private fun toItemResponse(item: ShipmentItem): ShipmentItemResponse {
        // Look up ordered qty from PO items
        val poItems = poItemRepo.findAllByPoNumAndDeletedAtIsNull(item.poNum)
        val matchingPoItem = poItems.find { it.sku == item.sku && it.unitPrice.toDouble() == item.unitPrice.toDouble() }
        val orderedQty = matchingPoItem?.quantity ?: 0

        // Total shipped across ALL shipments for this (poNum, sku)
        val totalShipped = shipmentItemRepo.sumSentByPoNumAndSku(item.poNum, item.sku)

        return ShipmentItemResponse(
            id = item.id, poNum = item.poNum, sku = item.sku,
            quantity = item.quantity, unitPrice = item.unitPrice.toDouble(),
            poChange = item.poChange, note = item.note,
            orderedQty = orderedQty,
            totalShipped = totalShipped,
        )
    }

    private fun excelResponse(bytes: ByteArray, filename: String): ResponseEntity<ByteArray> {
        return ResponseEntity.ok()
            .header("Content-Disposition", "attachment; filename=\"$filename\"")
            .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .body(bytes)
    }

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
