package com.mgmt.modules.sales.application.dto

import java.math.BigDecimal

// ═══════════════════════════════════════════════
// ETL Upload / Batch DTOs
// ═══════════════════════════════════════════════

/** CSV 上传请求 — 前端解析 CSV 后发送 JSON */
data class EtlUploadRequest(
    val seller: String,
    val fifoRatioRe: Int = 60,
    val fifoRatioCr: Int = 50,
    val fifoRatioCc: Int = 30,
    val transactions: List<CsvTransactionRow>,
    val earnings: List<CsvEarningRow> = emptyList(),
)

/** eBay Transaction CSV 行 (前端解析后的 JSON) */
data class CsvTransactionRow(
    val transactionCreationDate: String? = null,
    val type: String? = null,
    val referenceId: String? = null,
    val description: String? = null,
    val orderNumber: String? = null,
    val itemId: String? = null,
    val itemTitle: String? = null,
    val customLabel: String? = null,
    val quantity: String? = null,
    val itemSubtotal: String? = null,
    val shippingAndHandling: String? = null,
    val sellerCollectedTax: String? = null,
    val ebayCollectedTax: String? = null,
    val finalValueFeeFixed: String? = null,
    val finalValueFeeVariable: String? = null,
    val regulatoryOperatingFee: String? = null,
    val internationalFee: String? = null,
    val promotedListingsFee: String? = null,
    val paymentsDisputeFee: String? = null,
    val grossTransactionAmount: String? = null,
    val refund: String? = null,
    val buyerUsername: String? = null,
    val shipToCity: String? = null,
    val shipToCountry: String? = null,
    val netAmount: String? = null,
    /** P12: per-row seller from CSV file metadata */
    val seller: String? = null,
)

/** eBay Earning CSV 行 (前端解析后的 JSON) */
data class CsvEarningRow(
    val orderCreationDate: String? = null,
    val orderNumber: String? = null,
    val itemId: String? = null,
    val itemTitle: String? = null,
    val buyerName: String? = null,
    val customLabel: String? = null,
    val shippingLabels: String? = null,
    /** P12: per-row seller from CSV file metadata */
    val seller: String? = null,
)

// ═══════════════════════════════════════════════
// ETL Batch Status
// ═══════════════════════════════════════════════

data class EtlBatchStatusResponse(
    val batchId: String,
    val status: String,
    val progress: Int,
    val stageMessage: String?,
    val stats: String?,
    val errorMessage: String?,
)

data class EtlUploadResponse(
    val batchId: String,
    val transCount: Int,
    val earnCount: Int,
    val duplicateTransCount: Int,
    val duplicateEarnCount: Int,
)

// ═══════════════════════════════════════════════
// SKU Parsing / Correction DTOs
// ═══════════════════════════════════════════════

data class ParseResultResponse(
    val batchId: String,
    val totalRows: Int,
    val parsedOk: Int,
    val needsFix: Int,
    val pendingItems: List<PendingSkuItem>,
)

data class PendingSkuItem(
    val transactionId: Long,
    val customLabel: String,
    val badSku: String,
    val badQty: String?,
    val suggestions: List<String>,
    val autoFixed: Boolean = false,
    val autoFixSku: String? = null,
)

data class SkuFixRequest(
    val fixes: List<SkuFixItem>,
    val secCodeL3: String? = null,
)

data class SkuFixItem(
    val transactionId: Long,
    val customLabel: String,
    val badSku: String,
    val badQty: String?,
    val correctSku: String,
    val correctQty: String?,
)

// ═══════════════════════════════════════════════
// Transform DTOs
// ═══════════════════════════════════════════════

data class TransformRequest(
    val secCodeL3: String? = null,
)

data class TransformResultResponse(
    val batchId: String,
    val cleanedCount: Int,
    val actionBreakdown: Map<String, Int>,
    val fifoOutCount: Int,
    val fifoReturnCount: Int,
)

// ═══════════════════════════════════════════════
// SKU Correction Memory DTOs
// ═══════════════════════════════════════════════

data class SkuCorrectionResponse(
    val id: Long,
    val customLabel: String,
    val badSku: String,
    val badQty: String?,
    val correctSku: String,
    val correctQty: String?,
)
