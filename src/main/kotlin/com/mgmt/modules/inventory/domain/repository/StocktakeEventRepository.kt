package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.StocktakeEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface StocktakeEventRepository : JpaRepository<StocktakeEvent, Long> {

    fun findAllByStocktakeIdOrderByCreatedAtDesc(stocktakeId: Long): List<StocktakeEvent>
}
