package com.mgmt.modules.products.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.products.application.dto.*
import com.mgmt.modules.products.application.usecase.*
import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.infrastructure.barcode.BarcodeGeneratorService
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * ProductController — Products module REST API.
 *
 * V3 DDD: api layer.
 * V1 functional parity — all endpoints behave identically to V1.
 * V3 architecture — unified response format, security annotations, audit logging.
 *
 * Endpoints (11):
 *   GET    /products                   - Product list (paginated)
 *   GET    /products/categories        - Category list
 *   GET    /products/sku-list          - SKU dropdown list
 *   GET    /products/{id}              - Single product
 *   GET    /products/sku/{sku}         - By SKU
 *   POST   /products                   - Create product
 *   POST   /products/batch             - Batch create
 *   PATCH  /products/{id}              - Update product
 *   POST   /products/cogs/batch        - Batch update COGS
 *   DELETE /products/{id}              - Soft delete
 *   POST   /products/barcode/generate  - Generate barcode PDF
 */
@RestController
@RequestMapping("/products")
class ProductController(
    private val queryUseCase: QueryProductUseCase,
    private val createUseCase: CreateProductUseCase,
    private val updateUseCase: UpdateProductUseCase,
    private val deleteUseCase: DeleteProductUseCase,
    private val barcodeService: BarcodeGeneratorService,
) {

    // ═══════════ Query ═══════════

    @GetMapping
    @RequirePermission("module.products.catalog.view")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) category: String?,
        @RequestParam(required = false) status: String?,
    ): ResponseEntity<Any> {
        val params = ProductQueryParams(page, limit, search, category, status)
        val (products, total) = queryUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = products.map { toResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/categories")
    @RequirePermission("module.products.catalog.view")
    fun getCategories(): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(queryUseCase.getMetadata().categories))

    @GetMapping("/sku-list")
    @RequirePermission("module.products.catalog.view")
    fun getSkuList(): ResponseEntity<Any> {
        val skuList = queryUseCase.getActiveSkuList().map {
            mapOf("id" to it.id, "sku" to it.sku, "name" to it.name)
        }
        return ResponseEntity.ok(ApiResponse.ok(skuList))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.products.catalog.view")
    fun findOne(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(queryUseCase.findOne(id))))

    @GetMapping("/sku/{sku}")
    @RequirePermission("module.products.catalog.view")
    fun findBySku(@PathVariable sku: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(queryUseCase.findBySku(sku))))

    // ═══════════ Create ═══════════

    @PostMapping
    @RequirePermission("module.products.catalog.create")
    @SecurityLevel(level = "L3", actionKey = "btn_create_skus")
    @AuditLog(module = "PRODUCTS", action = "CREATE_PRODUCT", riskLevel = "MEDIUM")
    fun create(@RequestBody dto: CreateProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(createUseCase.create(dto, currentUsername()))))

    @PostMapping("/batch")
    @RequirePermission("module.products.catalog.create")
    @SecurityLevel(level = "L3", actionKey = "btn_create_skus")
    @AuditLog(module = "PRODUCTS", action = "BATCH_CREATE_PRODUCT", riskLevel = "MEDIUM")
    fun batchCreate(@RequestBody dto: BatchCreateProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(createUseCase.batchCreate(dto, currentUsername())))

    // ═══════════ Update ═══════════

    @PatchMapping("/{id}")
    @RequirePermission("module.products.catalog.cogs")
    @AuditLog(module = "PRODUCTS", action = "UPDATE_PRODUCT", riskLevel = "MEDIUM")
    fun update(@PathVariable id: String, @RequestBody dto: UpdateProductRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(updateUseCase.update(id, dto, currentUsername()))))

    @PostMapping("/cogs/batch")
    @RequirePermission("module.products.catalog.cogs")
    @SecurityLevel(level = "L3", actionKey = "btn_batch_update_cogs")
    @AuditLog(module = "PRODUCTS", action = "BATCH_UPDATE_COGS", riskLevel = "HIGH")
    fun batchUpdateCogs(@RequestBody dto: BatchUpdateCogsRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(updateUseCase.batchUpdateCogs(dto, currentUsername())))

    // ═══════════ Delete ═══════════

    @DeleteMapping("/{id}")
    @RequirePermission("module.products.catalog.delete")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_product")
    @AuditLog(module = "PRODUCTS", action = "DELETE_PRODUCT", riskLevel = "HIGH")
    fun delete(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to deleteUseCase.delete(id, currentUsername()))))

    // ═══════════ Barcode (V1 parity) ═══════════

    @PostMapping("/barcode/generate")
    @RequirePermission("module.products.catalog.view")
    @AuditLog(module = "PRODUCTS", action = "GENERATE_BARCODE", riskLevel = "LOW")
    fun generateBarcode(@RequestBody dto: GenerateBarcodeRequest): ResponseEntity<ByteArray> {
        // V1: fetch all active SKU names for label text
        val products = queryUseCase.getActiveSkuList()
        val names = products.associate { it.sku to (it.name ?: "") }

        val result = barcodeService.generateBarcodePdf(
            skus = dto.skus,
            names = names,
            copiesPerSku = dto.copiesPerSku,
            format = dto.format,
        )

        if (!result.success || result.pdfBytes == null) {
            return ResponseEntity.badRequest().body(null)
        }

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=barcodes_${System.currentTimeMillis()}.pdf")
            .body(result.pdfBytes)
    }

    // ═══════════ Helpers ═══════════

    private fun toResponse(p: Product) = ProductResponse(
        id = p.id, sku = p.sku, name = p.name,
        category = p.category, subcategory = p.subcategory, type = p.type,
        cost = p.cost.toDouble(), freight = p.freight.toDouble(),
        cogs = p.cogs.toDouble(), weight = p.weight, upc = p.upc,
        status = p.status.name,
        createdAt = p.createdAt, updatedAt = p.updatedAt,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}

