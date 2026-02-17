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
 * V1 parity: update({name, category, cogs, upc, status}),
 *            batchUpdateCogs({items: [{id, cogs}]}).
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
        dto.cogs?.let { product.cogs = it }
        dto.upc?.let { product.upc = it }
        dto.status?.let { product.status = com.mgmt.modules.products.domain.model.ProductStatus.valueOf(it) }
        product.updatedAt = Instant.now()

        return repo.save(product)
    }

    /**
     * V1 parity: batch update COGS.
     * Accepts {id, cogs} per item.
     */
    fun batchUpdateCogs(dto: BatchUpdateCogsRequest, username: String): BatchResult {
        val results = mutableListOf<BatchResultItem>()

        for (item in dto.items) {
            try {
                val product = repo.findByIdAndDeletedAtIsNull(item.id)
                    ?: throw NotFoundException("products.errors.notFound")

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
}

