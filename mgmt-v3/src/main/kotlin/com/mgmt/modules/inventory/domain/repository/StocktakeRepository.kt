package com.mgmt.modules.inventory.domain.repository

import com.mgmt.modules.inventory.domain.model.Stocktake
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.time.LocalDate

@Repository
interface StocktakeRepository : JpaRepository<Stocktake, Long> {

    fun findByStocktakeDate(date: LocalDate): Stocktake?

    fun existsByStocktakeDate(date: LocalDate): Boolean

    fun findAllByOrderByStocktakeDateDesc(): List<Stocktake>
}
