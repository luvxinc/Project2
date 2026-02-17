package com.mgmt.modules.products.application.usecase

import com.mgmt.modules.products.application.dto.*
import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.model.ProductStatus
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.common.exception.ConflictException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * CreateProductUseCase — product creation.
 *
 * V3 DDD: application/usecase layer.
 * V1 parity: cogs_create_skus (batch create, 9 fields, existingSkusSet check).
 * SKU regex: /^[A-Z0-9/_-]+$/ (supports '/' per V1 hierarchical SKUs).
 */
@Service
@Transactional
class CreateProductUseCase(
    private val repo: ProductRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        // V1 parity: supports '/' for hierarchical SKUs (e.g. SOCK/BLK-M)
        val SKU_REGEX = Regex("^[A-Z0-9/_-]+$")
    }

    fun create(dto: CreateProductRequest, username: String): Product {
        val sku = dto.sku.trim().uppercase()

        // Validate SKU format
        require(SKU_REGEX.matches(sku)) { "products.errors.invalidSku" }

        // Duplicate check
        if (repo.existsBySkuAndDeletedAtIsNull(sku)) {
            throw ConflictException("products.errors.skuExists")
        }

        // V1 parity: cogs = cost + freight (auto-calculated)
        val cost = dto.cost ?: BigDecimal.ZERO
        val freight = dto.freight ?: BigDecimal.ZERO
        val cogs = cost.add(freight)

        val product = repo.save(Product(
            id = UUID.randomUUID().toString(),
            sku = sku,
            name = dto.name,
            category = dto.category,
            subcategory = dto.subcategory,
            type = dto.type,
            cost = cost,
            freight = freight,
            cogs = cogs,
            weight = dto.weight ?: 0,
            upc = dto.upc,
            createdBy = username,
            updatedBy = username,
        ))

        log.info("Product created: {} by {}", sku, username)
        return product
    }

    fun batchCreate(dto: BatchCreateProductRequest, username: String): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.products) {
            try {
                val product = create(item, username)
                results.add(BatchResultItem(id = product.id, sku = product.sku, success = true))
            } catch (e: Exception) {
                results.add(BatchResultItem(sku = item.sku.uppercase(), success = false, error = e.message))
            }
        }

        val success = results.count { it.success }
        log.info("Batch create: {} success, {} failed by {}", success, results.size - success, username)

        return BatchResult(
            total = dto.products.size,
            success = success,
            failed = results.size - success,
            results = results,
        )
    }
}
