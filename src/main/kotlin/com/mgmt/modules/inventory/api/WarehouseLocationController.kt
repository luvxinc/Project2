package com.mgmt.modules.inventory.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.common.security.SecurityUtils
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.application.usecase.WarehouseLocationUseCase
import com.mgmt.modules.inventory.domain.model.WarehouseLocation
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * WarehouseLocationController — Warehouse bin/slot REST API.
 */
@RestController
@RequestMapping("/inventory/warehouse-locations")
class WarehouseLocationController(
    private val warehouseLocationUseCase: WarehouseLocationUseCase,
) {

    @GetMapping
    @RequirePermission("module.inventory.shelf.view")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) warehouse: String?,
        @RequestParam(required = false) search: String?,
    ): ResponseEntity<Any> {
        val params = WarehouseLocationQueryParams(page = page, limit = limit, warehouse = warehouse, search = search)
        val (locations, total) = warehouseLocationUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 200))
        return ResponseEntity.ok(PagedResponse(
            data = locations.map { toResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.inventory.shelf.view")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(warehouseLocationUseCase.findOne(id))))

    @GetMapping("/barcode/{barcode}")
    @RequirePermission("module.inventory.shelf.view")
    fun findByBarcode(@PathVariable barcode: String): ResponseEntity<Any> {
        val loc = warehouseLocationUseCase.findByBarcode(barcode)
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(ApiResponse.ok(toResponse(loc)))
    }

    @PostMapping
    @RequirePermission("module.inventory.shelf.create")
    @SecurityLevel(level = "L3", actionKey = "btn_add_warehouse_location")
    @AuditLog(module = "INVENTORY", action = "CREATE_WAREHOUSE_LOCATION", riskLevel = "MEDIUM")
    fun create(@RequestBody dto: CreateWarehouseLocationRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(warehouseLocationUseCase.create(dto, SecurityUtils.currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.inventory.shelf.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_warehouse_location")
    @AuditLog(module = "INVENTORY", action = "DELETE_WAREHOUSE_LOCATION", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> {
        warehouseLocationUseCase.delete(id)
        return ResponseEntity.ok(ApiResponse.ok(mapOf("success" to true)))
    }

    // ═══════════ Helpers ═══════════

    private fun toResponse(loc: WarehouseLocation) = WarehouseLocationResponse(
        id = loc.id, warehouse = loc.warehouse, aisle = loc.aisle,
        bay = loc.bay, level = loc.level, bin = loc.bin, slot = loc.slot,
        barcode = loc.barcode,
        createdAt = loc.createdAt, updatedAt = loc.updatedAt,
    )

}
