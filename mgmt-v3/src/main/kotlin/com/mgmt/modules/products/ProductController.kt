package com.mgmt.modules.products

import com.mgmt.modules.products.dto.*
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * ProductController — 产品管理 REST API
 *
 * Query Endpoints (5):
 *   GET    /products                   - 产品列表 (分页)
 *   GET    /products/categories        - 分类列表
 *   GET    /products/sku-list          - SKU 下拉列表
 *   GET    /products/{id}              - 单个产品
 *   GET    /products/sku/{sku}         - 按 SKU 查询
 *
 * Create Endpoints (2):
 *   POST   /products                   - 创建产品
 *   POST   /products/batch             - 批量创建
 *
 * Update Endpoints (2):
 *   PATCH  /products/{id}              - 更新产品
 *   POST   /products/cogs/batch        - 批量更新 COGS
 *
 * Delete Endpoints (1):
 *   DELETE /products/{id}              - 软删除
 *
 * Barcode Endpoints (1):
 *   POST   /products/barcode/generate  - 生成条形码 PDF
 *
 * Total: 11 endpoints
 */
@RestController
@RequestMapping("/products")
class ProductController(
    private val productService: ProductService,
    private val barcodeService: BarcodeService,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════ Query ═══════════

    @GetMapping
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) category: String?,
        @RequestParam(required = false) status: String?,
    ): ResponseEntity<Any> {
        val params = ProductQueryParams(page, limit, search, category, status)
        return ResponseEntity.ok(productService.findAll(params))
    }

    @GetMapping("/categories")
    fun getCategories(): ResponseEntity<Any> =
        ResponseEntity.ok(productService.getCategories())

    @GetMapping("/sku-list")
    fun getSkuList(): ResponseEntity<Any> =
        ResponseEntity.ok(productService.getSkuList())

    @GetMapping("/{id}")
    fun findOne(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(productService.toResponse(productService.findOne(id)))

    @GetMapping("/sku/{sku}")
    fun findBySku(@PathVariable sku: String): ResponseEntity<Any> =
        ResponseEntity.ok(productService.toResponse(productService.findBySku(sku)))

    // ═══════════ Create ═══════════

    @PostMapping
    fun create(@RequestBody dto: CreateProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(productService.toResponse(productService.create(dto)))

    @PostMapping("/batch")
    fun batchCreate(@RequestBody dto: BatchCreateProductRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(productService.batchCreate(dto))

    // ═══════════ Update ═══════════

    @PatchMapping("/{id}")
    fun update(@PathVariable id: String, @RequestBody dto: UpdateProductRequest): ResponseEntity<Any> =
        ResponseEntity.ok(productService.toResponse(productService.update(id, dto)))

    @PostMapping("/cogs/batch")
    fun batchUpdateCogs(@RequestBody dto: BatchUpdateCogsRequest): ResponseEntity<Any> =
        ResponseEntity.ok(productService.batchUpdateCogs(dto))

    // ═══════════ Delete ═══════════

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(productService.delete(id))

    // ═══════════ Barcode ═══════════

    @PostMapping("/barcode/generate")
    fun generateBarcode(@RequestBody dto: GenerateBarcodeRequest): ResponseEntity<ByteArray> {
        val products = productService.getSkuList()
        val names = products.associate {
            (it["sku"] as String) to (it["name"] as? String ?: "")
        }

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
            .header("Content-Type", "application/pdf")
            .header("Content-Disposition", "attachment; filename=barcodes_${System.currentTimeMillis()}.pdf")
            .body(result.pdfBytes)
    }
}
