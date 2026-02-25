package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.dto.SkuCorrectionResponse
import com.mgmt.modules.sales.domain.model.SkuCorrection
import com.mgmt.modules.sales.domain.repository.SkuCorrectionRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * SkuCorrectionUseCase — SKU 修正记忆库管理。
 *
 * V1 对应: correction.py CorrectionService (CSV 文件读写)
 * V3: DB 表 + UNIQUE(custom_label, bad_sku) 去重
 */
@Service
class SkuCorrectionUseCase(
    private val repo: SkuCorrectionRepository,
) {
    private val log = LoggerFactory.getLogger(SkuCorrectionUseCase::class.java)

    @Transactional(readOnly = true)
    fun findAll(): List<SkuCorrectionResponse> =
        repo.findAll().map { it.toResponse() }

    /**
     * Save a correction. V1 parity: correction.py save_correction_memory()
     * UNIQUE(custom_label, bad_sku) → keeps latest (upsert).
     */
    @Transactional
    fun saveCorrection(
        customLabel: String,
        badSku: String,
        badQty: String?,
        correctSku: String,
        correctQty: String?,
        createdBy: String?,
    ): SkuCorrectionResponse {
        val labelTrimmed = customLabel.trim()
        val badSkuUpper = badSku.trim().uppercase()
        val correctSkuUpper = correctSku.trim().uppercase()

        // Upsert: find existing or create new
        val existing = repo.findByCustomLabelAndBadSku(labelTrimmed, badSkuUpper)
        val entity = if (existing != null) {
            existing.correctSku = correctSkuUpper
            existing.correctQty = correctQty?.trim()
            existing.badQty = badQty?.trim()
            existing
        } else {
            SkuCorrection(
                customLabel = labelTrimmed,
                badSku = badSkuUpper,
                badQty = badQty?.trim(),
                correctSku = correctSkuUpper,
                correctQty = correctQty?.trim(),
                createdBy = createdBy,
            )
        }
        repo.save(entity)
        log.info("SKU correction saved: {} → {} (label: {})", badSkuUpper, correctSkuUpper, labelTrimmed)
        return entity.toResponse()
    }

    /**
     * Auto-fix lookup. V1 parity: correction.py find_auto_fix()
     */
    @Transactional(readOnly = true)
    fun findAutoFix(customLabel: String, badSku: String): SkuCorrection? =
        repo.findByCustomLabelAndBadSku(customLabel.trim(), badSku.trim().uppercase())

    private fun SkuCorrection.toResponse() = SkuCorrectionResponse(
        id = id,
        customLabel = customLabel,
        badSku = badSku,
        badQty = badQty,
        correctSku = correctSku,
        correctQty = correctQty,
    )
}
