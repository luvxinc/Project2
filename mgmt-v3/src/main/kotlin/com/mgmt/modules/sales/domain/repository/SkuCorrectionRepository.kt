package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.SkuCorrection
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface SkuCorrectionRepository : JpaRepository<SkuCorrection, Long> {
    fun findByCustomLabelAndBadSku(customLabel: String, badSku: String): SkuCorrection?
    fun findAllByBadSku(badSku: String): List<SkuCorrection>
}
