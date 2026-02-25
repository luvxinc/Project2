package com.mgmt.modules.vma

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * VmaPValveProductController — P-Valve + Delivery System + Fit REST API
 *
 * P-Valve Product Endpoints (4):
 *   GET    /vma/pvalve-products         - P-Valve 产品列表
 *   POST   /vma/pvalve-products         - 创建 P-Valve 产品
 *   PATCH  /vma/pvalve-products/{id}    - 更新 P-Valve 产品
 *   DELETE /vma/pvalve-products/{id}    - 删除 P-Valve 产品 (软删除)
 *
 * Delivery System Endpoints (4):
 *   GET    /vma/delivery-system-products         - DS 产品列表
 *   POST   /vma/delivery-system-products         - 创建 DS 产品
 *   PATCH  /vma/delivery-system-products/{id}    - 更新 DS 产品
 *   DELETE /vma/delivery-system-products/{id}    - 删除 DS 产品 (软删除)
 *
 * Fit Relationship Endpoints (2):
 *   GET    /vma/fit-matrix              - 适配矩阵
 *   PATCH  /vma/fit-relationship        - 更新适配关系
 *
 * Total: 10 endpoints
 */
@RestController
@RequestMapping("/vma")
class VmaPValveProductController(
    private val productService: VmaPValveProductService,
) {

    // ═══════════ P-Valve Products ═══════════

    @GetMapping("/pvalve-products")
    @RequirePermission("vma.products.manage")
    fun findAllPValveProducts(): ResponseEntity<Any> =
        ResponseEntity.ok(productService.findAllPValveProducts())

    @PostMapping("/pvalve-products")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "CREATE_PVALVE_PRODUCT")
    fun createPValveProduct(@RequestBody dto: CreatePValveProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(productService.createPValveProduct(dto))

    @PatchMapping("/pvalve-products/{id}")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "UPDATE_PVALVE_PRODUCT")
    fun updatePValveProduct(@PathVariable id: String, @RequestBody dto: UpdatePValveProductRequest): ResponseEntity<Any> =
        ResponseEntity.ok(productService.updatePValveProduct(id, dto))

    @DeleteMapping("/pvalve-products/{id}")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "DELETE_PVALVE_PRODUCT", riskLevel = "HIGH")
    fun deletePValveProduct(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(productService.deletePValveProduct(id))

    // ═══════════ Delivery System Products ═══════════

    @GetMapping("/delivery-system-products")
    @RequirePermission("vma.products.manage")
    fun findAllDeliverySystemProducts(): ResponseEntity<Any> =
        ResponseEntity.ok(productService.findAllDeliverySystemProducts())

    @PostMapping("/delivery-system-products")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "CREATE_DS_PRODUCT")
    fun createDeliverySystemProduct(@RequestBody dto: CreateDeliverySystemProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(productService.createDeliverySystemProduct(dto))

    @PatchMapping("/delivery-system-products/{id}")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "UPDATE_DS_PRODUCT")
    fun updateDeliverySystemProduct(@PathVariable id: String, @RequestBody dto: UpdateDeliverySystemProductRequest): ResponseEntity<Any> =
        ResponseEntity.ok(productService.updateDeliverySystemProduct(id, dto))

    @DeleteMapping("/delivery-system-products/{id}")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "DELETE_DS_PRODUCT", riskLevel = "HIGH")
    fun deleteDeliverySystemProduct(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(productService.deleteDeliverySystemProduct(id))

    // ═══════════ Fit Relationship ═══════════

    @GetMapping("/fit-matrix")
    @RequirePermission("vma.products.manage")
    fun getFitMatrix(): ResponseEntity<Any> =
        ResponseEntity.ok(productService.getFitMatrix())

    @PatchMapping("/fit-relationship")
    @RequirePermission("vma.products.manage")
    @AuditLog(module = "VMA", action = "UPDATE_FIT_RELATIONSHIP")
    fun updateFitRelationship(@RequestBody dto: UpdateFitRelationshipRequest): ResponseEntity<Any> =
        ResponseEntity.ok(productService.updateFitRelationship(dto))
}
