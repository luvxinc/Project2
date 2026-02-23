package com.mgmt.modules.finance.application.dto

import java.math.BigDecimal

// ═══════════════════════════════════════════════
// DEPOSIT LIST
// V1 parity: deposit_list_api (api.py:37-395)
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/deposits
 */
data class DepositListResponse(
    val data: List<DepositListItem>,
    val count: Int,
)

/**
 * Each PO's deposit summary — faithful replica of V1 response shape.
 * V1: api.py:342-373 (the 'orders' list items)
 */
data class DepositListItem(
    val poNum: String,
    val poDate: String,
    val skuCount: Int,
    val totalAmount: Double,
    val totalAmountUsd: Double,
    val totalAmountRmb: Double,
    val curCurrency: String,         // settlement currency from latest strategy
    val curUsdRmb: Double,           // exchange rate from latest strategy
    val rateSource: String,          // "Auto" or "Manual"
    val rateSourceCode: String,      // "AUTO" or "MANUAL"
    val depositPar: Double,          // deposit percentage (e.g. 30.0 = 30%)
    val depositAmount: Double,       // total * depositPar / 100 (settlement currency)
    val depositAmountUsd: Double,
    val depositAmountRmb: Double,
    val actualPaid: Double,          // cash + prepay deductions (settlement currency)
    val actualPaidUsd: Double,
    val prepayDeducted: Double,      // prepay deductions (settlement currency)
    val prepayDeductedUsd: Double,
    val depositPending: Double,      // deposit - actualPaid (settlement currency)
    val depositPendingUsd: Double,
    val balanceRemaining: Double,    // total - actualPaid (settlement currency)
    val balanceRemainingUsd: Double,
    val paymentStatus: String,       // "paid" / "unpaid" / "partial"
    val isPaid: Boolean,
    val supplierCode: String,
    val supplierName: String,
    val latestPaymentDate: String,   // YYYY-MM-DD or "-"
    val extraFeesUsd: Double,
    val extraFeesRmb: Double,
    val paymentDetails: List<DepositPaymentDetail>,
)

/**
 * Individual payment record nested inside DepositListItem.
 * V1: api.py:194-205 (the 'payment_map' entries)
 */
data class DepositPaymentDetail(
    val pmtNo: String,
    val depDate: String,             // YYYY-MM-DD
    val depCur: String,              // payment currency
    val depPaid: Double,             // cash amount paid
    val depPaidCur: Double,          // exchange rate used
    val depCurMode: String,          // 'A' or 'M'
    val depPrepayAmount: Double,     // prepay deduction amount
    val depOverride: Int,            // 0 or 1
    val extraAmount: Double,
    val extraCur: String,
)

// ═══════════════════════════════════════════════
// SUBMIT DEPOSIT PAYMENT
// V1 parity: deposit_payment_submit (api.py:415-719)
// ═══════════════════════════════════════════════

/**
 * Request for POST /finance/deposits/payments
 */
data class SubmitDepositPaymentRequest(
    val poNums: List<String>,
    val paymentDate: String,               // YYYY-MM-DD
    val usePaymentDateRate: Boolean = false,
    val settlementRate: BigDecimal? = null,
    val items: List<DepositPaymentItemRequest> = emptyList(),
    val extraFee: BigDecimal? = null,
    val extraFeeCurrency: String? = null,
    val extraFeeNote: String? = null,
)

/**
 * Per-PO payment details within the submit request.
 * V1: api.py:449-451 (item_map entries)
 */
data class DepositPaymentItemRequest(
    val poNum: String,
    val paymentMode: String = "original",   // "original" or "custom"
    val customCurrency: String? = null,
    val customAmount: BigDecimal? = null,
    val prepayAmount: BigDecimal? = null,   // V1: dep_prepay_amount
    val coverStandard: Boolean = false,     // V1: dep_override
)

/**
 * Response for POST /finance/deposits/payments
 */
data class SubmitDepositPaymentResponse(
    val pmtNos: List<String>,
    val count: Int,
    val prepayCount: Int,
    val message: String,
)

// ═══════════════════════════════════════════════
// DELETE DEPOSIT PAYMENT
// V1 parity: deposit_payment_delete_api (api.py:1436-1619)
// ═══════════════════════════════════════════════

data class DeleteDepositPaymentResponse(
    val pmtNo: String,
    val affectedCount: Int,
    val message: String,
)

// ═══════════════════════════════════════════════
// VENDOR BALANCE
// V1 parity: get_vendor_balance_api (api.py:787-908)
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/deposits/vendor-balance
 * V1: api.py:895-903
 */
data class VendorBalanceDto(
    val supplierCode: String,
    val supplierName: String,
    val currency: String,          // supplier settlement currency
    val balanceBase: Double,       // balance in supplier currency
    val balanceUsd: Double,        // balance in USD
)

// ═══════════════════════════════════════════════
// DEPOSIT HISTORY
// V1 parity: deposit_history_api (api.py:1220-1434)
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/deposits/payments/{pmtNo}/history
 */
data class DepositHistoryResponse(
    val strategyVersions: List<DepositStrategyVersion>,
    val paymentVersions: List<DepositPaymentVersion>,
)

/**
 * Strategy version — left column of history view.
 * V1: api.py:1255-1322 (strategy_history items)
 */
data class DepositStrategyVersion(
    val seq: String,
    val dateRecord: String,
    val byUser: String,
    val note: String,
    val isInitial: Boolean,
    val data: Map<String, Any?>,
    val changes: List<FieldChange>,
)

/**
 * Payment version — right column of history view.
 * V1: api.py:1349-1426 (payment_history items)
 */
data class DepositPaymentVersion(
    val seq: String,
    val dateRecord: String,
    val byUser: String,
    val note: String,
    val isInitial: Boolean,
    val data: Map<String, Any?>,
    val changes: List<FieldChange>,
)

// ═══════════════════════════════════════════════
// DEPOSIT ORDERS
// V1 parity: deposit_orders_api (api.py:1072-1217)
// ═══════════════════════════════════════════════

/**
 * Response for GET /finance/deposits/payments/{pmtNo}/orders
 */
data class DepositOrdersResponse(
    val orders: List<DepositOrderDetail>,
)

/**
 * Per-PO order detail within a payment batch.
 * V1: api.py:1191-1206
 */
data class DepositOrderDetail(
    val poNum: String,
    val supplierCode: String,
    val poDate: String,
    val depositRmb: Double,
    val depositUsd: Double,
    val depositPercent: Double,
    val currency: String,
    val paymentDate: String,
    val exchangeRate: Double,
    val prepayUsedRmb: Double,
    val actualPaidRmb: Double,
    val items: List<DepositOrderItem>,
    val totalRmb: Double,
    val totalUsd: Double,
)

/**
 * SKU line item within an order.
 * V1: api.py:1175-1182
 */
data class DepositOrderItem(
    val sku: String,
    val qty: Int,
    val unitPrice: Double,
    val currency: String,
    val valueRmb: Double,
    val valueUsd: Double,
)
