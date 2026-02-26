package com.mgmt.modules.inventory.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.common.security.SecurityUtils
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.application.usecase.StocktakeUseCase
import com.mgmt.modules.inventory.domain.model.Stocktake
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * StocktakeController — Physical inventory count REST API.
 *
 * Endpoints:
 *   1. GET    /inventory/stocktakes           — List all stocktakes
 *   2. GET    /inventory/stocktakes/{id}       — Detail with items
 *   3. POST   /inventory/stocktakes           — Create with location details
 *   4. PUT    /inventory/stocktakes/{id}       — Update items/details
 *   5. DELETE /inventory/stocktakes/{id}       — Delete stocktake
 *   6. GET    /inventory/stocktakes/{id}/locations — Location detail entries
 *   7. GET    /inventory/stocktakes/{id}/events    — Audit history
 */
@RestController
@RequestMapping("/inventory/stocktakes")
class StocktakeController(
    private val stocktakeUseCase: StocktakeUseCase,
) {

    @GetMapping
    @RequirePermission("module.inventory.stocktake")
    fun findAll(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(stocktakeUseCase.findAll().map { toListResponse(it) }))

    @GetMapping("/{id}")
    @RequirePermission("module.inventory.stocktake")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> {
        val st = stocktakeUseCase.findOne(id)
        return ResponseEntity.ok(ApiResponse.ok(toDetailResponse(st)))
    }

    @PostMapping
    @RequirePermission("module.inventory.stocktake.upload")
    @SecurityLevel(level = "L3", actionKey = "btn_add_stocktake")
    @AuditLog(module = "INVENTORY", action = "CREATE_STOCKTAKE", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreateStocktakeRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toDetailResponse(stocktakeUseCase.create(dto, SecurityUtils.currentUsername()))))

    @PutMapping("/{id}")
    @RequirePermission("module.inventory.stocktake.modify")
    @SecurityLevel(level = "L3", actionKey = "btn_edit_stocktake")
    @AuditLog(module = "INVENTORY", action = "UPDATE_STOCKTAKE", riskLevel = "MEDIUM")
    fun update(@PathVariable id: Long, @RequestBody dto: UpdateStocktakeRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toDetailResponse(stocktakeUseCase.update(id, dto, SecurityUtils.currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.inventory.stocktake.modify")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_stocktake")
    @AuditLog(module = "INVENTORY", action = "DELETE_STOCKTAKE", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> {
        stocktakeUseCase.delete(id, SecurityUtils.currentUsername())
        return ResponseEntity.ok(ApiResponse.ok(mapOf("success" to true)))
    }

    // ═══════════ Location Details ═══════════

    @GetMapping("/{id}/locations")
    @RequirePermission("module.inventory.stocktake")
    fun getLocationDetails(@PathVariable id: Long): ResponseEntity<Any> {
        val details = stocktakeUseCase.findLocationDetails(id)
        val response = details.map { d ->
            val loc = d.location!!
            StocktakeLocationDetailResponse(
                id = d.id,
                locationId = d.locationId,
                sku = d.sku,
                qtyPerBox = d.qtyPerBox,
                numOfBox = d.numOfBox,
                totalQty = d.totalQty,
                warehouse = loc.warehouse,
                aisle = loc.aisle,
                bay = loc.bay,
                level = loc.level,
                bin = loc.bin,
                slot = loc.slot,
                barcode = loc.barcode,
            )
        }
        return ResponseEntity.ok(ApiResponse.ok(response))
    }

    // ═══════════ Event History ═══════════

    @GetMapping("/{id}/events")
    @RequirePermission("module.inventory.stocktake")
    fun getEvents(@PathVariable id: Long): ResponseEntity<Any> {
        val events = stocktakeUseCase.findEvents(id)
        val response = events.map { e ->
            StocktakeEventResponse(
                id = e.id,
                stocktakeId = e.stocktakeId,
                eventType = e.eventType,
                summary = e.summary,
                createdBy = e.createdBy,
                createdAt = e.createdAt,
            )
        }
        return ResponseEntity.ok(ApiResponse.ok(response))
    }

    // ═══════════ Helpers ═══════════

    private fun toListResponse(st: Stocktake) = StocktakeResponse(
        id = st.id, stocktakeDate = st.stocktakeDate, note = st.note,
        itemCount = st.items.size,
        createdAt = st.createdAt, updatedAt = st.updatedAt,
    )

    private fun toDetailResponse(st: Stocktake) = StocktakeDetailResponse(
        id = st.id, stocktakeDate = st.stocktakeDate, note = st.note,
        items = st.items.map { StocktakeItemResponse(id = it.id, sku = it.sku, countedQty = it.countedQty) },
        createdAt = st.createdAt, updatedAt = st.updatedAt,
    )
}

