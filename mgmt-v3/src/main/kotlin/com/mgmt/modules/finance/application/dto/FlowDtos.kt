package com.mgmt.modules.finance.application.dto

/**
 * Flow Overview DTOs — V1 parity: flow/api.py flow_list_api + flow_detail_api
 *
 * The flow overview shows the full lifecycle of each PO:
 *   - Order total, deposit status, PO payment, balance remaining
 *   - Logistics allocation, extra fees, total cost
 *   - Payment status icons (deposit / PO / logistics)
 */

data class FlowListResponse(
    val data: List<FlowOrderItem>,
    val count: Int,
)

data class FlowOrderItem(
    val poNum: String,
    val poDate: String,
    val skuCount: Int,
    val curCurrency: String,
    val curUsdRmb: Double,
    // Order total
    val totalAmount: Double,
    val totalAmountUsd: Double,
    // Deposit
    val depositRequiredUsd: Double,
    val depositPar: Double,
    val depositStatus: String,          // not_required / unpaid / partial / paid / override
    val depositStatusText: String,
    val depPaidUsd: Double,
    // PO payment
    val pmtPaid: Double,
    val pmtPaidUsd: Double,
    val balanceRemaining: Double,
    val balanceRemainingUsd: Double,
    // Actual paid total
    val actualPaid: Double,
    val actualPaidUsd: Double,
    // Waiver (override forgiven amount)
    val waiverUsd: Double,
    // Extra fees
    val depExtraUsd: Double,
    val pmtExtraUsd: Double,
    val logisticsExtraUsd: Double,
    val totalExtra: Double,
    val totalExtraUsd: Double,
    // Logistics
    val logisticsList: List<String>,
    val orderWeightKg: Double,
    val logisticsApportioned: Double,
    val logisticsApportionedUsd: Double,
    val logisticsCurrency: String,
    val logisticsUsdRmb: Double,
    // Total cost
    val totalCost: Double,
    val totalCostUsd: Double,
    // Status
    val orderStatus: String,
    val orderStatusText: String,
    val hasDiff: Boolean,
    val logisticsStatus: String,        // none / in_transit / arrived
    val logisticsPaymentStatus: String, // unpaid / partial / paid
    val paymentStatusText: String,
    // Float
    val curFloat: Boolean,
    val curExFloat: Double,
    val fluctuationTriggered: Boolean,
)

/**
 * Flow detail — per-PO breakdown by logistics block, showing SKU-level landed prices.
 */
data class FlowDetailResponse(
    val data: List<FlowLogisticsBlock>,
    val count: Int,
    val meta: FlowDetailMeta?,
)

data class FlowDetailMeta(
    val totalCostUsd: Double,
    val totalCostRmb: Double,
)

data class FlowLogisticsBlock(
    val logisticNum: String,
    val currency: String,
    val usdRmb: Double,
    val logPriceRmb: Double,
    val logPriceUsd: Double,
    val isPaid: Boolean,
    val skus: List<FlowSkuDetail>,
)

data class FlowSkuDetail(
    val sku: String,
    val priceOriginal: Double,
    val priceUsd: Double,
    val actualPrice: Double,
    val actualPriceUsd: Double,
    val feeApportioned: Double,
    val feeApportionedUsd: Double,
    val landedPrice: Double,
    val landedPriceUsd: Double,
    val qty: Int,
    val totalUsd: Double,
)
