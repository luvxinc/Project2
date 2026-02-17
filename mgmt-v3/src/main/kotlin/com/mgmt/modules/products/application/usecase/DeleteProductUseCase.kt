package com.mgmt.modules.products.application.usecase

import com.mgmt.modules.products.domain.model.ProductStatus
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.common.exception.NotFoundException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * DeleteProductUseCase — soft delete.
 *
 * V3 DDD: application/usecase layer.
 * V1 parity: products never hard-deleted, only soft-deleted with timestamp.
 */
@Service
@Transactional
class DeleteProductUseCase(
    private val repo: ProductRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun delete(id: String, username: String): Boolean {
        val product = repo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("products.errors.notFound")

        product.deletedAt = Instant.now()
        product.status = ProductStatus.INACTIVE
        product.updatedAt = Instant.now()
        product.updatedBy = username
        repo.save(product)

        log.info("Product soft-deleted: {} by {}", product.sku, username)
        return true
    }
}
