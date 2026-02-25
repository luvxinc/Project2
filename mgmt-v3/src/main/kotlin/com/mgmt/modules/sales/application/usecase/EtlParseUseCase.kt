package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.dto.ParseResultResponse
import com.mgmt.modules.sales.application.dto.PendingSkuItem
import com.mgmt.modules.sales.domain.model.EtlBatch
import com.mgmt.modules.sales.domain.model.RawTransactionItem
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import com.mgmt.modules.sales.domain.repository.SkuCorrectionRepository
import com.mgmt.modules.sales.infrastructure.csv.EbayCSVParser
import com.mgmt.modules.products.domain.repository.ProductRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/**
 * EtlParseUseCase — SKU 正则解析 + 校验。
 *
 * V1 对应: parser.py EbayParser
 * 职责: 读取 raw_transactions → 正则解析 Custom Label → 写入 raw_transaction_items
 *       识别无法匹配数据库的 SKU → 返回待修正列表
 */
@Service
class EtlParseUseCase(
    private val rawTransRepo: RawTransactionRepository,
    private val batchRepo: EtlBatchRepository,
    private val skuCorrectionRepo: SkuCorrectionRepository,
    private val productRepo: ProductRepository,
    private val csvParser: EbayCSVParser,
) {
    private val log = LoggerFactory.getLogger(EtlParseUseCase::class.java)

    @Transactional
    fun parse(batchId: String): ParseResultResponse {
        val batch = batchRepo.findByBatchId(batchId)
            ?: throw IllegalArgumentException("Batch not found: $batchId")

        batch.status = "parsing"
        batch.progress = 30
        batch.stageMessage = "Parsing SKUs from Custom Labels..."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        // Load valid SKUs
        val validSkus = productRepo.findAllByDeletedAtIsNullOrderBySkuAsc()
            .map { it.sku.uppercase() }
            .toSet()

        // Build correction fast-fix map (V1 parity: parser._build_fast_fix_map)
        val allCorrections = skuCorrectionRepo.findAll()
        val correctionMap = allCorrections.associateBy { it.badSku.uppercase() }

        // Parse all transactions in this batch
        val transactions = rawTransRepo.findAllByUploadBatchId(batchId)
        var parsedOk = 0
        var needsFix = 0
        val pendingItems = mutableListOf<PendingSkuItem>()

        for (tx in transactions) {
            // Skip non-order types (shipping labels, disputes etc. don't have SKUs)
            val txType = tx.transactionType?.lowercase() ?: ""
            if (txType != "order" && txType != "refund" && txType != "claim" && txType.isNotEmpty()) {
                continue
            }

            val customLabel = tx.customLabel
            if (customLabel.isNullOrBlank()) continue

            val result = csvParser.parse(customLabel, correctionMap, validSkus)

            // Clear existing items and re-parse
            tx.items.clear()

            if (result.flag == 0 || result.skus.isEmpty()) {
                // Unparsable → flag for manual review
                needsFix++
                pendingItems.add(PendingSkuItem(
                    transactionId = tx.id,
                    customLabel = customLabel,
                    badSku = customLabel,
                    badQty = null,
                    suggestions = csvParser.findSimilarSkus(customLabel.take(20).uppercase(), validSkus),
                ))
                continue
            }

            var allValid = true
            for (i in result.skus.indices) {
                val sku = result.skus[i].uppercase()
                val qty = result.quantities[i].toIntOrNull() ?: 1

                if (validSkus.isNotEmpty() && sku !in validSkus) {
                    // Check auto-fix from correction memory
                    val autoFix = skuCorrectionRepo.findByCustomLabelAndBadSku(customLabel, sku)
                    if (autoFix != null) {
                        // Auto-fix applied
                        val fixedSku = autoFix.correctSku.uppercase()
                        val fixedQty = autoFix.correctQty?.toIntOrNull() ?: qty
                        val item = RawTransactionItem(
                            sku = fixedSku,
                            quantity = fixedQty,
                            unitPrice = computeUnitPrice(tx.saleAmount, fixedQty),
                        )
                        item.transaction = tx
                        tx.items.add(item)
                        pendingItems.add(PendingSkuItem(
                            transactionId = tx.id,
                            customLabel = customLabel,
                            badSku = sku,
                            badQty = qty.toString(),
                            suggestions = listOf(fixedSku),
                            autoFixed = true,
                            autoFixSku = fixedSku,
                        ))
                    } else {
                        allValid = false
                        pendingItems.add(PendingSkuItem(
                            transactionId = tx.id,
                            customLabel = customLabel,
                            badSku = sku,
                            badQty = qty.toString(),
                            suggestions = csvParser.findSimilarSkus(sku, validSkus),
                        ))
                    }
                } else {
                    val item = RawTransactionItem(
                        sku = sku,
                        quantity = qty,
                        unitPrice = computeUnitPrice(tx.saleAmount, qty),
                    )
                    item.transaction = tx
                    tx.items.add(item)
                }
            }

            if (allValid && tx.items.isNotEmpty()) {
                parsedOk++
            } else if (!allValid) {
                needsFix++
            }
            rawTransRepo.save(tx)
        }

        // Update batch
        batch.status = "parsed"
        batch.progress = 50
        batch.stageMessage = "Parsing complete. $parsedOk OK, $needsFix need fixes."
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        log.info("ETL batch {} parsed: {} ok, {} need fix", batchId, parsedOk, needsFix)

        return ParseResultResponse(
            batchId = batchId,
            totalRows = transactions.size,
            parsedOk = parsedOk,
            needsFix = needsFix,
            pendingItems = pendingItems,
        )
    }

    private fun computeUnitPrice(saleAmount: BigDecimal, qty: Int): BigDecimal {
        if (qty <= 0) return BigDecimal.ZERO
        return saleAmount.divide(BigDecimal(qty), 5, RoundingMode.HALF_UP)
    }
}
