package com.mgmt.modules.finance.application.dto

import java.math.BigDecimal

// ═══════════════════════════════════════════════
// PO PAYMENT LIST
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/po-payments
 */
data class POPaymentListResponse(
    val data: List<POPaymentListItem>,
    val count: Int,
)

/**
 * Each PO's payment summary — includes deposit info + PO payment info + fluctuation + diff blocking.
 */
data class POPaymentListItem(
    // Base PO info (same as DepositListItem)
    val poNum: String,
    val poDate: String,
    val skuCount: Int,
    val totalAmount: Double,
    val totalAmountUsd: Double,
    val totalAmountRmb: Double,
    val curCurrency: String,
    val curUsdRmb: Double,
    val rateSource: String,
    val rateSourceCode: String,

    // Deposit info
    val depositPar: Double,
    val depositAmount: Double,
    val depositPaid: Double,
    val depositPaidUsd: Double,
    val depositStatus: String,          // not_required / unpaid / partial / paid

    // PO payment info
    val poPaid: Double,
    val poPaidUsd: Double,
    val balanceRemaining: Double,       // totalAmount - depositPaid - poPaid
    val balanceRemainingUsd: Double,

    // Exchange rate fluctuation
    val floatEnabled: Boolean,
    val floatThreshold: Double,
    val todayRate: Double,
    val fluctuationTriggered: Boolean,
    val adjustedBalance: Double,
    val adjustedBalanceUsd: Double,

    // Receive diff blocking
    val hasUnresolvedDiff: Boolean,
    val diffCount: Int,
    val paymentBlocked: Boolean,

    // Payment status
    val paymentStatus: String,          // paid / unpaid / partial
    val isPaid: Boolean,
    val supplierCode: String,
    val supplierName: String,
    val latestPaymentDate: String,

    val extraFeesUsd: Double,
    val extraFeesRmb: Double,
    val paymentDetails: List<POPaymentDetail>,
    val depositDetails: List<DepositPaymentDetail>,
)

/**
 * Individual PO payment record nested inside POPaymentListItem.
 */
data class POPaymentDetail(
    val pmtNo: String,
    val poDate: String,                 // YYYY-MM-DD
    val poCur: String,                  // payment currency
    val poPaid: Double,                 // cash amount paid
    val poPaidCur: Double,              // exchange rate used
    val poCurMode: String,              // 'A' or 'M'
    val poPrepayAmount: Double,         // prepay deduction amount
    val poOverride: Int,                // 0 or 1
    val extraAmount: Double,
    val extraCur: String,
)

// ═══════════════════════════════════════════════
// SUBMIT PO PAYMENT
// ═══════════════════════════════════════════════

/**
 * Request for POST /finance/po-payments/payments
 */
data class SubmitPOPaymentRequest(
    val poNums: List<String>,
    val paymentDate: String,               // YYYY-MM-DD
    val usePaymentDateRate: Boolean = false,
    val settlementRate: BigDecimal? = null,
    val items: List<POPaymentItemRequest> = emptyList(),
    val extraFee: BigDecimal? = null,
    val extraFeeCurrency: String? = null,
    val extraFeeNote: String? = null,
)

/**
 * Per-PO payment details within the submit request.
 */
data class POPaymentItemRequest(
    val poNum: String,
    val paymentMode: String = "original",   // "original" or "custom"
    val customCurrency: String? = null,
    val customAmount: BigDecimal? = null,
    val prepayAmount: BigDecimal? = null,
    val coverStandard: Boolean = false,     // override flag
)

/**
 * Response for POST /finance/po-payments/payments
 */
data class SubmitPOPaymentResponse(
    val pmtNos: List<String>,
    val count: Int,
    val prepayCount: Int,
    val message: String,
)

// ═══════════════════════════════════════════════
// DELETE PO PAYMENT
// ═══════════════════════════════════════════════

data class DeletePOPaymentResponse(
    val pmtNo: String,
    val affectedCount: Int,
    val message: String,
)

// ═══════════════════════════════════════════════
// PO PAYMENT HISTORY
// 3 columns: strategy + deposit payments + PO payments
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/po-payments/payments/{pmtNo}/history
 */
data class POPaymentHistoryResponse(
    val strategyVersions: List<DepositStrategyVersion>,
    val depositPaymentVersions: List<DepositPaymentVersion>,
    val poPaymentVersions: List<POPaymentVersion>,
)

/**
 * PO payment version — same shape as DepositPaymentVersion.
 */
data class POPaymentVersion(
    val seq: String,
    val dateRecord: String,
    val byUser: String,
    val note: String,
    val isInitial: Boolean,
    val data: Map<String, Any?>,
    val changes: List<FieldChange>,
)

// ═══════════════════════════════════════════════
// PO PAYMENT ORDERS
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/po-payments/payments/{pmtNo}/orders
 */
data class POPaymentOrdersResponse(
    val orders: List<POPaymentOrderDetail>,
)

/**
 * Per-PO order detail within a PO payment batch.
 */
data class POPaymentOrderDetail(
    val poNum: String,
    val supplierCode: String,
    val poDate: String,
    val paymentRmb: Double,
    val paymentUsd: Double,
    val currency: String,
    val paymentDate: String,
    val exchangeRate: Double,
    val prepayUsedRmb: Double,
    val actualPaidRmb: Double,
    val items: List<POPaymentOrderItem>,
    val totalRmb: Double,
    val totalUsd: Double,
)

/**
 * SKU line item within an order.
 */
data class POPaymentOrderItem(
    val sku: String,
    val qty: Int,
    val unitPrice: Double,
    val currency: String,
    val valueRmb: Double,
    val valueUsd: Double,
)
