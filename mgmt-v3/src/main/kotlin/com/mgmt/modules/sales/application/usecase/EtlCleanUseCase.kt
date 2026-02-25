package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.dto.SkuFixItem
import com.mgmt.modules.sales.domain.model.RawTransactionItem
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import com.mgmt.modules.products.domain.repository.ProductRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/**
 * EtlCleanUseCase — SKU 修正应用。
 *
 * V1 对应: views.py step_fix_sku + correction.py
 * 职责: 用户提交 SKU 修正 → 更新 raw_transaction_items → 保存到记忆库
 */
@Service
class EtlCleanUseCase(
    private val rawTransRepo: RawTransactionRepository,
    private val batchRepo: EtlBatchRepository,
    private val productRepo: ProductRepository,
    private val skuCorrectionUseCase: SkuCorrectionUseCase,
) {
    private val log = LoggerFactory.getLogger(EtlCleanUseCase::class.java)

    @Transactional
    fun applyFixes(batchId: String, fixes: List<SkuFixItem>, username: String?): Int {
        val batch = batchRepo.findByBatchId(batchId)
            ?: throw IllegalArgumentException("Batch not found: $batchId")

        batch.status = "cleaning"
        batch.progress = 55
        batch.stageMessage = "Applying SKU corrections..."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        val validSkus = productRepo.findAllByDeletedAtIsNullOrderBySkuAsc()
            .map { it.sku.uppercase() }
            .toSet()

        var fixedCount = 0

        for (fix in fixes) {
            val correctSku = fix.correctSku.trim().uppercase()

            // Validate correct SKU exists in product database
            if (validSkus.isNotEmpty() && correctSku !in validSkus) {
                log.warn("SKU fix rejected: {} is not a valid SKU", correctSku)
                continue
            }

            val tx = rawTransRepo.findById(fix.transactionId).orElse(null) ?: continue

            // Find the bad item and fix it, or add new item
            val badItem = tx.items.find { it.sku.uppercase() == fix.badSku.uppercase() }
            val correctQty = fix.correctQty?.toIntOrNull() ?: badItem?.quantity ?: 1

            if (badItem != null) {
                badItem.sku = correctSku
                badItem.quantity = correctQty
                badItem.unitPrice = computeUnitPrice(tx.saleAmount, correctQty)
            } else {
                val item = RawTransactionItem(
                    sku = correctSku,
                    quantity = correctQty,
                    unitPrice = computeUnitPrice(tx.saleAmount, correctQty),
                )
                item.transaction = tx
                tx.items.add(item)
            }
            rawTransRepo.save(tx)

            // Save to correction memory (V1 parity: correction.py save_correction_memory)
            skuCorrectionUseCase.saveCorrection(
                customLabel = fix.customLabel,
                badSku = fix.badSku,
                badQty = fix.badQty,
                correctSku = fix.correctSku,
                correctQty = fix.correctQty,
                createdBy = username,
            )
            fixedCount++
        }

        // Update batch
        batch.status = "cleaned"
        batch.progress = 60
        batch.stageMessage = "SKU corrections applied: $fixedCount fixes."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        log.info("ETL batch {} cleaned: {} fixes applied", batchId, fixedCount)
        return fixedCount
    }

    private fun computeUnitPrice(saleAmount: BigDecimal, qty: Int): BigDecimal {
        if (qty <= 0) return BigDecimal.ZERO
        return saleAmount.divide(BigDecimal(qty), 5, RoundingMode.HALF_UP)
    }
}
