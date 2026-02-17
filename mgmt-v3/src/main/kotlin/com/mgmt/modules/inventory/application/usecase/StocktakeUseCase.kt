package com.mgmt.modules.inventory.application.usecase

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.inventory.application.dto.*
import com.mgmt.modules.inventory.domain.model.Stocktake
import com.mgmt.modules.inventory.domain.model.StocktakeItem
import com.mgmt.modules.inventory.domain.repository.StocktakeItemRepository
import com.mgmt.modules.inventory.domain.repository.StocktakeRepository
import jakarta.persistence.EntityManager
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * StocktakeUseCase — physical inventory count lifecycle.
 *
 * Business rules:
 *  - stocktake_date is UNIQUE (one count per date)
 *  - items are (stocktake_id, sku) UNIQUE
 *  - CASCADE DELETE: deleting a stocktake removes all items
 */
@Service
class StocktakeUseCase(
    private val stocktakeRepo: StocktakeRepository,
    private val itemRepo: StocktakeItemRepository,
    private val em: EntityManager,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(): List<Stocktake> = stocktakeRepo.findAllByOrderByStocktakeDateDesc()

    @Transactional(readOnly = true)
    fun findOne(id: Long): Stocktake =
        stocktakeRepo.findById(id).orElseThrow {
            NotFoundException("inventory.errors.stocktakeNotFound")
        }

    @Transactional(readOnly = true)
    fun findByDate(date: java.time.LocalDate): Stocktake? =
        stocktakeRepo.findByStocktakeDate(date)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreateStocktakeRequest, username: String): Stocktake {
        if (stocktakeRepo.existsByStocktakeDate(dto.stocktakeDate)) {
            throw ConflictException("inventory.errors.stocktakeDateExists")
        }

        val stocktake = Stocktake(
            stocktakeDate = dto.stocktakeDate,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )

        // Add items
        dto.items.forEach { itemDto ->
            val item = StocktakeItem(
                stocktake = stocktake,
                sku = itemDto.sku.trim(),
                countedQty = itemDto.countedQty,
            )
            stocktake.items.add(item)
        }

        return stocktakeRepo.save(stocktake)
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdateStocktakeRequest, username: String): Stocktake {
        val stocktake = findOne(id)

        dto.note?.let { stocktake.note = it }

        dto.items?.let { newItems ->
            // JPQL delete + clear L1 cache to avoid stale entity conflict
            itemRepo.deleteAllByStocktakeId(stocktake.id)
            em.flush()
            em.clear()

            // Re-fetch the parent after cache clear
            val fresh = findOne(id)
            fresh.note = dto.note ?: fresh.note

            newItems.forEach { itemDto ->
                val item = StocktakeItem(
                    stocktake = fresh,
                    sku = itemDto.sku.trim(),
                    countedQty = itemDto.countedQty,
                )
                fresh.items.add(item)
            }

            fresh.updatedAt = Instant.now()
            fresh.updatedBy = username
            return stocktakeRepo.save(fresh)
        }

        stocktake.updatedAt = Instant.now()
        stocktake.updatedBy = username
        return stocktakeRepo.save(stocktake)
    }

    // ═══════════ Delete ═══════════

    @Transactional
    fun delete(id: Long) {
        val stocktake = findOne(id)
        stocktakeRepo.delete(stocktake) // CASCADE deletes items
    }
}
