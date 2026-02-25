package com.mgmt.modules.sales.application.dto

import java.math.BigDecimal
import java.time.Instant

// ═══════════════════════════════════════════════
// RAW TRANSACTION DTOs

// ═══════════════════════════════════════════════

data class RawTransactionResponse(
    val id: Long,
    val source: String,
    val uploadBatchId: String?,
    val seller: String?,
    val orderNumber: String?,
    val itemId: String?,
    val orderDate: Instant?,
    val buyer: String?,
    val saleAmount: BigDecimal,
    val shippingFee: BigDecimal,
    val taxAmount: BigDecimal,
    val totalAmount: BigDecimal,
    val itemCount: Int,
    val createdAt: Instant,
)

data class RawTransactionDetailResponse(
    val id: Long,
    val source: String,
    val uploadBatchId: String?,
    val seller: String?,
    val orderNumber: String?,
    val itemId: String?,
    val orderDate: Instant?,
    val buyer: String?,
    val saleAmount: BigDecimal,
    val shippingFee: BigDecimal,
    val taxAmount: BigDecimal,
    val totalAmount: BigDecimal,
    val netAmount: String?,
    val adFee: String?,
    val promoListing: String?,
    val listingFee: String?,
    val intlFee: String?,
    val otherFee: String?,
    val rowHash: String?,
    val items: List<RawTransactionItemResponse>,
    val createdAt: Instant,
)

data class RawTransactionItemResponse(
    val id: Long,
    val sku: String,
    val quantity: Int,
    val unitPrice: BigDecimal,
)

data class RawTransactionQueryParams(
    val page: Int = 1,
    val limit: Int = 50,
    val source: String? = null,
    val seller: String? = null,
    val orderNumber: String? = null,
    val uploadBatchId: String? = null,
)

// ═══════════════════════════════════════════════
// CLEANED TRANSACTION DTOs

// ═══════════════════════════════════════════════

data class CleanedTransactionResponse(
    val id: Long,
    val seller: String?,
    val orderNumber: String?,
    val itemId: String?,
    val orderDate: Instant,
    val action: String,
    val saleAmount: BigDecimal,
    val shippingFee: BigDecimal,
    val taxAmount: BigDecimal,
    val netAmount: BigDecimal,
    val adFee: BigDecimal,
    val otherFee: BigDecimal,
    /** 只返回非空 slot, 减少 payload */
    val skuSlots: List<SkuSlotResponse>,
    val createdAt: Instant,
)

/** V1: sku{n}, qty{n}, qtyp{n} — 展平的 SKU 行 */
data class SkuSlotResponse(
    val slot: Int,
    val sku: String?,
    val quantity: Int?,
    val qtyp: Int?,
)

data class CleanedTransactionQueryParams(
    val page: Int = 1,
    val limit: Int = 50,
    val seller: String? = null,
    val orderNumber: String? = null,
    val action: String? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
)

// ═══════════════════════════════════════════════
// DASHBOARD STATS DTO

// ═══════════════════════════════════════════════

data class SalesStatsResponse(
    val rawCount: Long,
    val cleanedCount: Long,
    val minDate: Instant?,
    val maxDate: Instant?,
    /** V1: action 分布统计 (NN/CA/RE/CR/CC/PD 各有多少条) */
    val actionCounts: Map<String, Long>,
)
