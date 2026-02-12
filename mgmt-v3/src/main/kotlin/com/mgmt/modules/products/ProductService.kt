package com.mgmt.modules.products

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.product.*
import com.mgmt.modules.products.dto.*
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * ProductService — 产品管理业务逻辑
 *
 * V2 parity: products.service.ts (376 lines)
 * - CRUD with pagination + search + filtering
 * - Batch create / batch COGS update
 * - Category list + SKU list
 */
@Service
@Transactional
class ProductService(
    private val repo: ProductRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════ Query Operations ═══════════

    fun findAll(params: ProductQueryParams): PaginatedProductResponse {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))

        val spec = buildSpec(params.search, params.category, params.status)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("sku").ascending())
        val result = repo.findAll(spec, pageable)

        return PaginatedProductResponse(
            data = result.content.map { toResponse(it) },
            meta = PaginationMeta(
                total = result.totalElements,
                page = page,
                limit = limit,
                totalPages = result.totalPages,
            ),
        )
    }

    fun findOne(id: String): Product =
        repo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("products.errors.notFound")

    fun findBySku(sku: String): Product =
        repo.findBySkuAndDeletedAtIsNull(sku.uppercase())
            ?: throw NotFoundException("products.errors.notFound")

    fun getCategories(): List<String> =
        repo.findDistinctCategories()

    fun getSkuList(): List<Map<String, Any?>> =
        repo.findAllByStatusAndDeletedAtIsNullOrderBySkuAsc(ProductStatus.ACTIVE)
            .map { mapOf("id" to it.id, "sku" to it.sku, "name" to it.name) }

    // ═══════════ Create Operations ═══════════

    fun create(dto: CreateProductRequest): Product {
        val sku = dto.sku.uppercase()

        repo.findBySkuAndDeletedAtIsNull(sku)?.let {
            throw ConflictException("products.errors.skuExists")
        }

        val product = repo.save(Product(
            id = UUID.randomUUID().toString(),
            sku = sku,
            name = dto.name,
            category = dto.category,
            cogs = dto.cogs ?: BigDecimal.ZERO,
            upc = dto.upc,
        ))

        log.info("Product created: {}", sku)
        return product
    }

    fun batchCreate(dto: BatchCreateProductRequest): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.products) {
            try {
                create(item)
                results.add(BatchResultItem(sku = item.sku.uppercase(), success = true))
            } catch (e: Exception) {
                results.add(BatchResultItem(sku = item.sku.uppercase(), success = false, error = e.message))
            }
        }

        val success = results.count { it.success }
        log.info("Batch create: {} success, {} failed", success, results.size - success)

        return BatchResult(
            total = dto.products.size,
            success = success,
            failed = results.size - success,
            results = results,
        )
    }

    // ═══════════ Update Operations ═══════════

    fun update(id: String, dto: UpdateProductRequest): Product {
        val product = findOne(id)

        dto.name?.let { product.name = it }
        dto.category?.let { product.category = it }
        dto.cogs?.let { product.cogs = it }
        dto.upc?.let { product.upc = it }
        dto.status?.let { product.status = ProductStatus.valueOf(it) }
        product.updatedAt = Instant.now()

        return repo.save(product)
    }

    fun batchUpdateCogs(dto: BatchUpdateCogsRequest): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.items) {
            try {
                val product = findOne(item.id)
                product.cogs = item.cogs
                product.updatedAt = Instant.now()
                repo.save(product)
                results.add(BatchResultItem(id = item.id, sku = product.sku, success = true))
            } catch (e: Exception) {
                results.add(BatchResultItem(id = item.id, sku = "unknown", success = false, error = e.message))
            }
        }

        val success = results.count { it.success }
        log.info("Batch COGS update: {} success, {} failed", success, results.size - success)

        return BatchResult(
            total = dto.items.size,
            success = success,
            failed = results.size - success,
            results = results,
        )
    }

    // ═══════════ Delete Operations ═══════════

    fun delete(id: String): Map<String, Boolean> {
        val product = findOne(id)
        product.deletedAt = Instant.now()
        product.status = ProductStatus.INACTIVE
        product.updatedAt = Instant.now()
        repo.save(product)
        return mapOf("success" to true)
    }

    // ═══════════ Helpers ═══════════

    fun toResponse(p: Product) = ProductResponse(
        id = p.id, sku = p.sku, name = p.name,
        category = p.category, subcategory = p.subcategory, type = p.type,
        cost = p.cost.toDouble(), freight = p.freight.toDouble(),
        cogs = p.cogs.toDouble(), weight = p.weight, upc = p.upc,
        status = p.status.name,
        createdAt = p.createdAt, updatedAt = p.updatedAt,
    )

    private fun buildSpec(search: String?, category: String?, status: String?): Specification<Product> {
        @Suppress("DEPRECATION")
        return Specification.where<Product> { root, _, cb ->
            cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (search != null) {
                spec.and { root, _, cb ->
                    val pattern = "%${search.lowercase()}%"
                    cb.or(
                        cb.like(cb.lower(root.get("sku")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                    )
                }
            } else spec
        }.let { spec ->
            if (category != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("category"), category) }
            } else spec
        }.let { spec ->
            if (status != null) {
                spec.and { root, _, cb -> cb.equal(root.get<ProductStatus>("status"), ProductStatus.valueOf(status)) }
            } else spec
        }
    }
}
