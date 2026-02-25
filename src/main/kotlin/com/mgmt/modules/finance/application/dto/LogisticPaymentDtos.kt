package com.mgmt.modules.finance.application.dto

import java.math.BigDecimal

/**
 * LogisticPaymentDtos — DTOs for logistics cost management.
 *
 */

// ═══════════════════════════════════════════════
// List API Response
// ═══════════════════════════════════════════════

/**
 * Single logistic shipment item: build_order_item() (logistic.py:175-278)
 * All 30 fields from V1 response faithfully reproduced.
 */
data class LogisticListItemDto(
    val logisticNum: String,
    val isPaid: Boolean,
    val paymentStatus: String,      // unpaid / paid / partial / deleted
    val dateSent: String,           // YYYY-MM-DD or "-"
    val dateEta: String,            // YYYY-MM-DD or "-"
    val receiveDate: String,        // YYYY-MM-DD or "-"
    val etaDays: Int?,
    val actualDays: Int?,
    val pallets: Int,
    val priceKg: BigDecimal,
    val totalWeight: BigDecimal,
    val usdRmb: BigDecimal,         // exchange rate
    val rateMode: String,           // A = auto, M = manual
    val paymentMode: String,        // payment's rate mode
    val totalPriceRmb: BigDecimal,
    val totalPriceUsd: BigDecimal,
    val logisticPaid: BigDecimal,
    val paymentDate: String?,       // YYYY-MM-DD or null
    val pmtNo: String?,
    val extraPaid: BigDecimal,      // extra fee original value
    val extraCurrency: String,      // RMB / USD / ""
    val extraPaidUsd: BigDecimal,   // extra fee in USD
    val totalWithExtraUsd: BigDecimal,
    val totalWithExtraRmb: BigDecimal,
    val isChild: Boolean,
    val hasChildren: Boolean,
    val children: List<LogisticListItemDto>,
    val isDeleted: Boolean,
)

data class LogisticListResponse(
    val data: List<LogisticListItemDto>,
    val count: Int,
)

// ═══════════════════════════════════════════════
// Submit Payment Request
// ═══════════════════════════════════════════════

/**
 */
data class SubmitPaymentRequest(
    val logisticNums: List<String>,
    val paymentDate: String,                    // YYYY-MM-DD
    val usePaymentDateRate: Boolean = false,
    val settlementRate: BigDecimal? = null,
    val rateSource: String = "original",        // original / auto / manual
    val extraFee: ExtraFeeDto? = null,
)

data class ExtraFeeDto(
    val amount: BigDecimal = BigDecimal.ZERO,
    val currency: String = "",                  // RMB / USD
    val note: String = "",
)

data class SubmitPaymentResponse(
    val successCount: Int,
    val totalCount: Int,
    val pmtNo: String,
)

// ═══════════════════════════════════════════════
// Delete / Restore
// ═══════════════════════════════════════════════

data class DeleteRestoreResponse(
    val pmtNo: String,
    val affectedCount: Int,
)

// ═══════════════════════════════════════════════
// Payment History
// ═══════════════════════════════════════════════

/**
 */
data class PaymentHistoryResponse(
    val pmtNo: String,
    val logisticNums: List<String>,
    val sendVersions: List<SendVersionDto>,
    val paymentVersions: List<PaymentVersionDto>,
)

data class SendVersionDto(
    val logisticNum: String,
    val isInitial: Boolean,
    val seq: String,
    val dateRecord: String,
    val byUser: String,
    val note: String,
    val data: SendVersionDataDto,
    val changes: List<FieldChangeDto>,
)

data class SendVersionDataDto(
    val dateSent: String,
    val priceKg: BigDecimal,
    val totalWeight: BigDecimal,
    val totalPrice: BigDecimal,
    val pallets: Int,
)

data class PaymentVersionDto(
    val logisticNum: String,
    val isInitial: Boolean,
    val seq: String,
    val dateRecord: String,
    val dateSent: String,
    val paymentDate: String,
    val logisticPaid: BigDecimal,
    val extraPaid: BigDecimal,
    val extraCurrency: String,
    val extraNote: String,
    val note: String,
    val byUser: String,
    val usdRmb: BigDecimal,
    val mode: String,
    val changes: List<FieldChangeDto>,
)

data class FieldChangeDto(
    val field: String,
    val old: String,
    val new: String,
)

// ═══════════════════════════════════════════════
// Payment Orders
// ═══════════════════════════════════════════════

/**
 */
data class PaymentOrdersResponse(
    val pmtNo: String,
    val logisticNums: List<String>,
    val orders: List<PaymentOrderDto>,
)

data class PaymentOrderDto(
    val poNum: String,
    val supplierCode: String,
    val orderDate: String,
    val currency: String,
    val exchangeRate: BigDecimal,
    val items: List<PaymentOrderItemDto>,
    val totalRmb: BigDecimal,
    val totalUsd: BigDecimal,
)

data class PaymentOrderItemDto(
    val sku: String,
    val qty: Int,
    val unitPrice: BigDecimal,
    val currency: String,
    val valueRmb: BigDecimal,
    val valueUsd: BigDecimal,
)
