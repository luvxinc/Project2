package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.StocktakeLocationDetail
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface StocktakeLocationDetailRepository : JpaRepository<StocktakeLocationDetail, Long> {

    fun findAllByStocktakeId(stocktakeId: Long): List<StocktakeLocationDetail>

    fun findAllByLocationId(locationId: Long): List<StocktakeLocationDetail>

    fun findAllByStocktakeIdAndSku(stocktakeId: Long, sku: String): List<StocktakeLocationDetail>

    @Modifying
    @Query("DELETE FROM StocktakeLocationDetail d WHERE d.stocktakeId = :stocktakeId")
    fun deleteAllByStocktakeId(@Param("stocktakeId") stocktakeId: Long): Int
}
