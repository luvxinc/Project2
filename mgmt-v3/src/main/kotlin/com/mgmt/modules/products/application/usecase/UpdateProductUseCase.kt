package com.mgmt.modules.products.application.usecase

import com.mgmt.modules.products.application.dto.*
import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.model.ProductStatus
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.inventory.FifoTransactionRepository
import com.mgmt.domain.inventory.FifoLayerRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
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
    private val fifoTranRepo: FifoTransactionRepository,
    private val fifoLayerRepo: FifoLayerRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun update(id: String, dto: UpdateProductRequest, username: String): Product {
        val product = repo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("products.errors.notFound")

        // Track old COGS for FIFO sync comparison
        val oldCogs = product.cogs

        dto.name?.let { product.name = it }
        dto.category?.let { product.category = it }
        dto.subcategory?.let { product.subcategory = it }
        dto.type?.let { product.type = it }
        dto.cost?.let { product.cost = it }
        dto.freight?.let { product.freight = it }
        dto.weight?.let { product.weight = it }
        dto.upc?.let { product.upc = it }
        dto.moq?.let { product.moq = it }
        dto.status?.let { product.status = ProductStatus.valueOf(it) }

        // Auto-calculate COGS = cost + freight when either changes
        if (dto.cost != null || dto.freight != null) {
            product.cogs = product.cost.add(product.freight)
        }
        // Allow direct cogs override only if no cost/freight was sent
        if (dto.cost == null && dto.freight == null) {
            dto.cogs?.let { product.cogs = it }
        }

        product.updatedAt = Instant.now()
        product.updatedBy = username
        val saved = repo.save(product)

        // P1-2: FIFO init cost sync — if COGS changed, update INIT FIFO records
        if (saved.cogs.compareTo(oldCogs) != 0) {
            syncFifoInitCost(saved.sku, saved.cogs)
        }

        return saved
    }

    /**
     * V1 parity: _sync_fifo_init_cost()
     * When COGS changes, update all INIT-type FIFO records for this SKU.
     * INIT records represent:
     *   - INIT_20241231: 2024年底期初库存
     *   - INIT-2024: 2024年订单2025年到货的货物
     */
    private fun syncFifoInitCost(sku: String, newCogs: BigDecimal) {
        val initTrans = fifoTranRepo.findInitTransactionsBySku(sku)
        if (initTrans.isEmpty()) {
            log.debug("No INIT FIFO transactions found for SKU {}, skipping sync", sku)
            return
        }

        // Update transaction unit_price
        val tranIds = initTrans.map { it.id }
        for (tran in initTrans) {
            tran.unitPrice = newCogs
        }
        fifoTranRepo.saveAll(initTrans)

        // Update layer unit_cost + landed_cost
        val layersUpdated = fifoLayerRepo.updateCostByTranIds(tranIds, newCogs)
        log.info("FIFO init cost synced: SKU={}, newCogs={}, transactions={}, layers={}",
            sku, newCogs, tranIds.size, layersUpdated)
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

                val oldCogs = product.cogs
                product.cogs = item.cogs
                product.updatedAt = Instant.now()
                product.updatedBy = username
                repo.save(product)

                // FIFO sync
                if (product.cogs.compareTo(oldCogs) != 0) {
                    syncFifoInitCost(product.sku, product.cogs)
                }

                results.add(BatchResultItem(id = item.id, sku = product.sku, success = true))
            } catch (e: Exception) {
                // Try to get the actual SKU from DB before falling back
                val actualSku = try {
                    repo.findById(item.id).orElse(null)?.sku ?: item.id
                } catch (_: Exception) { item.id }
                results.add(BatchResultItem(id = item.id, sku = actualSku, success = false, error = e.message))
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
