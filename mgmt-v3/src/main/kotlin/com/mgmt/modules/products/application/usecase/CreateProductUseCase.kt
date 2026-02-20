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
 * V1 parity: create({sku, name, category, cogs, upc}).
 */
@Service
@Transactional
class CreateProductUseCase(
    private val repo: ProductRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun create(dto: CreateProductRequest, username: String): Product {
        val sku = dto.sku.trim().uppercase()

        // V1: duplicate check (case-insensitive via uppercase)
        repo.findBySkuAndDeletedAtIsNull(sku)?.let {
            throw ConflictException("products.errors.skuExists")
        }

        val cost = dto.cost ?: BigDecimal.ZERO
        val freight = dto.freight ?: BigDecimal.ZERO
        // Auto-calculate COGS from cost + freight; fallback to direct cogs if provided
        val cogs = if (dto.cost != null || dto.freight != null) cost.add(freight) else (dto.cogs ?: BigDecimal.ZERO)

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
        ))

        log.info("Product created: {}", sku)
        return product
    }

    fun batchCreate(dto: BatchCreateProductRequest, username: String): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.products) {
            try {
                create(item, username)
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
}
