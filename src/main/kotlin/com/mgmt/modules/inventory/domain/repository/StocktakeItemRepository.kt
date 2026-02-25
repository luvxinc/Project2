package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.StocktakeItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface StocktakeItemRepository : JpaRepository<StocktakeItem, Long> {

    fun findAllByStocktakeId(stocktakeId: Long): List<StocktakeItem>

    fun findByStocktakeIdAndSku(stocktakeId: Long, sku: String): StocktakeItem?

    @Modifying
    @Query("DELETE FROM StocktakeItem si WHERE si.stocktakeId = :stocktakeId")
    fun deleteAllByStocktakeId(stocktakeId: Long)
}
