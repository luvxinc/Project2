package com.mgmt.modules.products.application.usecase

import com.mgmt.modules.products.application.dto.*
import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.common.exception.NotFoundException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * UpdateProductUseCase — single update + COGS batch update.
 *
 * V3 DDD: application/usecase layer.
 * V1 parity: cogs_batch_update (all 6 fields: category, subcategory, type, cost, freight, weight).
 * Fixes V2 bug: V2 only sent {id, cogs}, losing 5 fields.
 */
@Service
@Transactional
class UpdateProductUseCase(
    private val repo: ProductRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun update(id: String, dto: UpdateProductRequest, username: String): Product {
        val product = repo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("products.errors.notFound")

        dto.name?.let { product.name = it }
        dto.category?.let { product.category = it }
        dto.subcategory?.let { product.subcategory = it }
        dto.type?.let { product.type = it }
        dto.cost?.let { product.cost = it }
        dto.freight?.let { product.freight = it }
        dto.weight?.let { product.weight = it }
        dto.upc?.let { product.upc = it }
        dto.status?.let { product.status = com.mgmt.modules.products.domain.model.ProductStatus.valueOf(it) }

        // Auto-recalculate COGS when cost or freight changes
        if (dto.cost != null || dto.freight != null) {
            product.cogs = product.cost.add(product.freight)
        }

        product.updatedAt = Instant.now()
        product.updatedBy = username

        return repo.save(product)
    }

    /**
     * V1 parity: batch update ALL 6 COGS fields.
     * Fixes V2 bug where only {id, cogs} was sent.
     */
    fun batchUpdateCogs(dto: BatchUpdateCogsRequest, username: String): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.items) {
            try {
                val product = repo.findByIdAndDeletedAtIsNull(item.id)
                    ?: throw NotFoundException("products.errors.notFound")

                // Update all 6 fields (V1 parity — fixes V2 bug)
                item.category?.let { product.category = it }
                item.subcategory?.let { product.subcategory = it }
                item.type?.let { product.type = it }
                product.cost = item.cost
                product.freight = item.freight
                item.weight?.let { product.weight = it }

                // Auto-recalculate COGS
                product.cogs = product.cost.add(product.freight)
                product.updatedAt = Instant.now()
                product.updatedBy = username

                repo.save(product)
                results.add(BatchResultItem(id = item.id, sku = product.sku, success = true))
            } catch (e: Exception) {
                results.add(BatchResultItem(id = item.id, sku = "unknown", success = false, error = e.message))
            }
        }

        val success = results.count { it.success }
        log.info("Batch COGS update: {} success, {} failed by {}", success, results.size - success, username)

        return BatchResult(
            total = dto.items.size,
            success = success,
            failed = results.size - success,
            results = results,
        )
    }
}
