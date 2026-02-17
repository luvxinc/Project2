package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.SupplierUseCase
import com.mgmt.modules.purchase.domain.model.Supplier
import com.mgmt.modules.purchase.domain.model.SupplierStrategy
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * SupplierController — Supplier management REST API.
 *
 * V1 parity: supplier_add, supplier_list, strategy_modify, code_check, strategy_date_check.
 *
 * Endpoints (9):
 *   GET    /purchase/suppliers              - All suppliers
 *   GET    /purchase/suppliers/active       - Active only
 *   GET    /purchase/suppliers/{id}         - By ID
 *   GET    /purchase/suppliers/code-exists  - Check code uniqueness
 *   POST   /purchase/suppliers              - Create supplier
 *   PATCH  /purchase/suppliers/{id}         - Update supplier
 *   DELETE /purchase/suppliers/{id}         - Soft delete
 *   GET    /purchase/suppliers/{id}/strategies          - Get strategies
 *   POST   /purchase/suppliers/strategies               - Create/modify strategy
 *   GET    /purchase/suppliers/strategies/check-conflict - Date conflict check
 *   GET    /purchase/suppliers/strategies/effective      - Effective strategy on date
 */
@RestController
@RequestMapping("/purchase/suppliers")
class SupplierController(
    private val supplierUseCase: SupplierUseCase,
) {

    @GetMapping
    @RequirePermission("module.purchase.supplier.view")
    fun findAll(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(supplierUseCase.findAll().map { toResponse(it) }))

    @GetMapping("/active")
    @RequirePermission("module.purchase.supplier.view")
    fun findActive(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(supplierUseCase.findActive().map { toResponse(it) }))

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.supplier.view")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(supplierUseCase.findOne(id))))

    @GetMapping("/code-exists")
    @RequirePermission("module.purchase.supplier.view")
    fun codeExists(@RequestParam code: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("exists" to supplierUseCase.codeExists(code))))

    @PostMapping
    @RequirePermission("module.purchase.supplier.create")
    @SecurityLevel(level = "L3", actionKey = "btn_add_supplier")
    @AuditLog(module = "PURCHASE", action = "CREATE_SUPPLIER", riskLevel = "MEDIUM")
    fun create(@RequestBody dto: CreateSupplierRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(supplierUseCase.create(dto, currentUsername()))))

    @PatchMapping("/{id}")
    @RequirePermission("module.purchase.supplier.update")
    @AuditLog(module = "PURCHASE", action = "UPDATE_SUPPLIER", riskLevel = "MEDIUM")
    fun update(@PathVariable id: Long, @RequestBody dto: UpdateSupplierRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(supplierUseCase.update(id, dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.supplier.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_supplier")
    @AuditLog(module = "PURCHASE", action = "DELETE_SUPPLIER", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to supplierUseCase.delete(id, currentUsername()))))

    // ═══════════ Strategy ═══════════

    @GetMapping("/{id}/strategies")
    @RequirePermission("module.purchase.supplier.view")
    fun getStrategies(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(supplierUseCase.getStrategies(id).map { toStrategyResponse(it) }))

    @PostMapping("/strategies")
    @RequirePermission("module.purchase.supplier.update")
    @SecurityLevel(level = "L3", actionKey = "btn_modify_strategy")
    @AuditLog(module = "PURCHASE", action = "MODIFY_SUPPLIER_STRATEGY", riskLevel = "MEDIUM")
    fun modifyStrategy(@RequestBody dto: ModifyStrategyRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toStrategyResponse(supplierUseCase.modifyStrategy(dto, currentUsername()))))

    @GetMapping("/strategies/check-conflict")
    @RequirePermission("module.purchase.supplier.view")
    fun checkConflict(
        @RequestParam supplierCode: String,
        @RequestParam effectiveDate: String,
    ): ResponseEntity<Any> {
        val date = java.time.LocalDate.parse(effectiveDate)
        return ResponseEntity.ok(ApiResponse.ok(mapOf("conflict" to supplierUseCase.strategyDateConflict(supplierCode, date))))
    }

    @GetMapping("/strategies/effective")
    @RequirePermission("module.purchase.supplier.view")
    fun getEffectiveStrategy(
        @RequestParam supplierCode: String,
        @RequestParam date: String,
    ): ResponseEntity<Any> {
        val localDate = java.time.LocalDate.parse(date)
        val strategy = supplierUseCase.getEffectiveStrategy(supplierCode, localDate)
        return ResponseEntity.ok(ApiResponse.ok(strategy?.let { toStrategyResponse(it) }))
    }

    // ═══════════ Helpers ═══════════

    private fun toResponse(s: Supplier) = SupplierResponse(
        id = s.id, supplierCode = s.supplierCode, supplierName = s.supplierName,
        status = s.status, createdAt = s.createdAt, updatedAt = s.updatedAt,
    )

    private fun toStrategyResponse(s: SupplierStrategy) = SupplierStrategyResponse(
        id = s.id, supplierId = s.supplierId, supplierCode = s.supplierCode,
        category = s.category, currency = s.currency,
        floatCurrency = s.floatCurrency, floatThreshold = s.floatThreshold.toDouble(),
        requireDeposit = s.requireDeposit, depositRatio = s.depositRatio.toDouble(),
        effectiveDate = s.effectiveDate, note = s.note, contractFile = s.contractFile,
        createdAt = s.createdAt, updatedAt = s.updatedAt,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
