package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.domain.model.EtlBatch
import com.mgmt.modules.sales.domain.model.RawEarning
import com.mgmt.modules.sales.domain.model.RawTransaction
import com.mgmt.modules.sales.domain.repository.EtlBatchRepository
import com.mgmt.modules.sales.domain.repository.RawEarningRepository
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import com.mgmt.modules.sales.infrastructure.csv.EbayCSVParser
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.*

/**
 * EtlIngestUseCase — CSV 数据摄入。
 *
 * V1 对应: ingest.py IngestService
 * 职责: 接收前端解析好的 CSV JSON → 去重(hash) → 写入 raw 表 → 创建 batch
 *
 * V1 parity fixes applied:
 *   P1:  hash 包含 seller (防止跨店铺碰撞)
 *   P8:  FVF fixed/variable 分别存储
 *   P9:  Seller/eBay tax 分别存储
 *   P12: per-row seller (from CSV file metadata, not batch-level)
 *   P16: 日期范围校验 (最新日期不能是今天或未来)
 */
@Service
class EtlIngestUseCase(
    private val rawTransRepo: RawTransactionRepository,
    private val rawEarnRepo: RawEarningRepository,
    private val batchRepo: EtlBatchRepository,
    private val csvParser: EbayCSVParser,
) {
    private val log = LoggerFactory.getLogger(EtlIngestUseCase::class.java)
    private val pacificZone = ZoneId.of("America/Los_Angeles")

    @Transactional
    fun ingest(request: EtlUploadRequest): EtlUploadResponse {
        val batchId = "ETL-${UUID.randomUUID().toString().take(8).uppercase()}"

        // Create batch record
        val batch = EtlBatch(
            batchId = batchId,
            status = "uploading",
            seller = request.seller,
            fifoRatioRe = request.fifoRatioRe,
            fifoRatioCr = request.fifoRatioCr,
            fifoRatioCc = request.fifoRatioCc,
            progress = 10,
            stageMessage = "Ingesting CSV data...",
        )
        batchRepo.save(batch)

        // Ingest transactions
        var transCount = 0
        var dupTransCount = 0
        var dateMin: LocalDate? = null
        var dateMax: LocalDate? = null

        for (row in request.transactions) {
            // P12: per-row seller — each row carries its own seller from the CSV file
            val rowSeller = row.seller?.trim()?.ifEmpty { null } ?: request.seller

            // P1: hash includes seller to prevent cross-seller collision
            // V1 parity: str(v).strip() — null → empty string
            val allValues = listOf(
                rowSeller,                           // ← P1: seller in hash
                row.transactionCreationDate ?: "",
                row.type ?: "",
                row.referenceId ?: "",
                row.description ?: "",
                row.orderNumber ?: "",
                row.itemId ?: "",
                row.itemTitle ?: "",
                row.customLabel ?: "",
                row.quantity ?: "",
                row.itemSubtotal ?: "",
                row.shippingAndHandling ?: "",
                row.sellerCollectedTax ?: "",
                row.ebayCollectedTax ?: "",
                row.finalValueFeeFixed ?: "",
                row.finalValueFeeVariable ?: "",
                row.regulatoryOperatingFee ?: "",
                row.internationalFee ?: "",
                row.promotedListingsFee ?: "",
                row.paymentsDisputeFee ?: "",
                row.grossTransactionAmount ?: "",
                row.refund ?: "",
                row.buyerUsername ?: "",
                row.shipToCity ?: "",
                row.shipToCountry ?: "",
                row.netAmount ?: "",
            )
            val rowHash = csvParser.computeRowHashFull(allValues)

            // V1 parity: ON CONFLICT(row_hash) DO NOTHING
            if (rawTransRepo.existsByRowHash(rowHash)) {
                dupTransCount++
                continue
            }

            val orderDate = parseDate(row.transactionCreationDate)
            val localDate = orderDate?.atZone(pacificZone)?.toLocalDate()
            if (localDate != null) {
                dateMin = if (dateMin == null) localDate else minOf(dateMin, localDate)
                dateMax = if (dateMax == null) localDate else maxOf(dateMax, localDate)
            }

            // P9: split tax into seller + ebay (store both separately AND combined)
            val sellerTax = parseMoney(row.sellerCollectedTax)
            val ebayTax = parseMoney(row.ebayCollectedTax)

            // P8: split FVF into fixed + variable (store both separately AND combined)
            val fvfFixed = parseMoney(row.finalValueFeeFixed)
            val fvfVariable = parseMoney(row.finalValueFeeVariable)

            val tx = RawTransaction(
                source = "ebay",
                uploadBatchId = batchId,
                seller = rowSeller,                             // P12: per-row seller
                orderNumber = row.orderNumber?.trim(),
                itemId = row.itemId?.trim(),
                orderDate = orderDate,
                buyer = row.buyerUsername?.trim(),
                saleAmount = parseMoney(row.itemSubtotal),
                shippingFee = parseMoney(row.shippingAndHandling),
                taxAmount = sellerTax + ebayTax,                // backward compat: combined
                sellerTax = sellerTax,                          // P9: split
                ebayTax = ebayTax,                              // P9: split
                totalAmount = parseMoney(row.grossTransactionAmount),
                netAmount = row.netAmount?.trim(),
                adFee = row.promotedListingsFee?.trim(),
                promoListing = row.promotedListingsFee?.trim(),
                listingFee = (fvfFixed + fvfVariable).toPlainString(), // backward compat: combined
                fvfFeeFixed = row.finalValueFeeFixed?.trim(),   // P8: split (raw text)
                fvfFeeVariable = row.finalValueFeeVariable?.trim(), // P8: split (raw text)
                intlFee = row.internationalFee?.trim(),
                otherFee = row.regulatoryOperatingFee?.trim(),
                transactionType = row.type?.trim()?.lowercase(),
                referenceId = row.referenceId?.trim(),
                customLabel = row.customLabel?.trim(),
                itemTitle = row.itemTitle?.trim(),
                quantity = row.quantity?.trim()?.toIntOrNull() ?: 0,
                description = row.description?.trim(),
                shipToCity = row.shipToCity?.trim(),
                shipToCountry = row.shipToCountry?.trim(),
                disputeFee = row.paymentsDisputeFee?.trim(),
                refundAmount = parseMoney(row.refund),
                rowHash = rowHash,
                synced = false,                                 // P13: Working Set — mark as pending
            )
            rawTransRepo.save(tx)
            transCount++
        }

        // P16: Date validation — V1 parity: views.py line 396-398
        // Must check AFTER processing all rows (dateMax is computed during loop)
        // @Transactional ensures automatic rollback on exception
        val pacificToday = LocalDate.now(pacificZone)
        if (dateMax != null && !dateMax.isBefore(pacificToday)) {
            throw IllegalArgumentException(
                "Data contains today's or future dates ($dateMax). " +
                "Latest date must be before today ($pacificToday). Please check the file."
            )
        }

        // Ingest earnings
        var earnCount = 0
        var dupEarnCount = 0

        for (row in request.earnings) {
            // P12: per-row seller
            val rowSeller = row.seller?.trim()?.ifEmpty { null } ?: request.seller

            // V1 parity: 7-column business key hash (includes seller)
            val earningHash = csvParser.computeEarningHash(
                row.orderCreationDate, row.orderNumber, row.itemId,
                row.itemTitle, row.buyerName, row.customLabel, rowSeller,
            )

            val earning = RawEarning(
                uploadBatchId = batchId,
                seller = rowSeller,                             // P12: per-row seller
                orderNumber = row.orderNumber?.trim(),
                itemId = row.itemId?.trim(),
                orderDate = parseDate(row.orderCreationDate),
                buyerName = row.buyerName?.trim(),
                customLabel = row.customLabel?.trim(),
                itemTitle = row.itemTitle?.trim(),
                shippingLabels = parseMoney(row.shippingLabels),
                rowHash = earningHash,
                synced = false,                                 // P13: Working Set — mark as pending
            )

            // V1 parity: ON CONFLICT(row_hash) DO UPDATE — 覆盖模式, 更新全部字段
            val existing = rawEarnRepo.findByRowHash(earningHash)
            if (existing != null) {
                existing.uploadBatchId = earning.uploadBatchId
                existing.seller = earning.seller
                existing.orderNumber = earning.orderNumber
                existing.itemId = earning.itemId
                existing.orderDate = earning.orderDate
                existing.buyerName = earning.buyerName
                existing.customLabel = earning.customLabel
                existing.itemTitle = earning.itemTitle
                existing.shippingLabels = earning.shippingLabels
                existing.synced = false                         // P13: re-mark as pending on update
                rawEarnRepo.save(existing)
                dupEarnCount++
            } else {
                rawEarnRepo.save(earning)
                earnCount++
            }
        }

        // Update batch
        batch.status = "uploaded"
        batch.dateMin = dateMin
        batch.dateMax = dateMax
        batch.progress = 20
        batch.stageMessage = "Upload complete. $transCount transactions, $earnCount earnings ingested."
        batch.stats = """{"trans_count":$transCount,"earn_count":$earnCount,"dup_trans":$dupTransCount,"dup_earn":$dupEarnCount}"""
        batch.updatedAt = Instant.now()
        batchRepo.save(batch)

        log.info("ETL batch {} ingested: {} trans, {} earn (dup: {}/{})", batchId, transCount, earnCount, dupTransCount, dupEarnCount)

        return EtlUploadResponse(
            batchId = batchId,
            transCount = transCount,
            earnCount = earnCount,
            duplicateTransCount = dupTransCount,
            duplicateEarnCount = dupEarnCount,
        )
    }

    private fun parseDate(dateStr: String?): Instant? {
        if (dateStr.isNullOrBlank()) return null
        return try {
            // eBay format: "Jan-01-2025" or "2025-01-01" or "Jan 01, 2025"
            val cleaned = dateStr.trim()
            val ld = tryParseDateFormats(cleaned) ?: return null
            // R1: Pacific timezone, noon
            ld.atStartOfDay(pacificZone).plusHours(12).toInstant()
        } catch (e: Exception) {
            null
        }
    }

    private fun tryParseDateFormats(s: String): LocalDate? {
        val formatters = listOf(
            DateTimeFormatter.ofPattern("MMM-dd-yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM dd, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
        )
        for (fmt in formatters) {
            try {
                return LocalDate.parse(s, fmt)
            } catch (_: Exception) { }
        }
        return null
    }

    private fun parseMoney(s: String?): BigDecimal {
        if (s.isNullOrBlank()) return BigDecimal.ZERO
        return try {
            val cleaned = s.trim().replace(",", "").replace("$", "")
            if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
                // Accounting format: (123.45) = -123.45
                BigDecimal(cleaned.removePrefix("(").removeSuffix(")")).negate()
            } else {
                BigDecimal(cleaned)
            }
        } catch (_: Exception) {
            BigDecimal.ZERO
        }
    }
}
