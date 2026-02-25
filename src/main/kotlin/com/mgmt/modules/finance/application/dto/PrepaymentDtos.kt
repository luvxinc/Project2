package com.mgmt.modules.finance.application.dto

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

// ═══════════════════════════════════════════════
// SUPPLIER BALANCE DTOs
// V1 parity: supplier_balance_api
// ═══════════════════════════════════════════════

data class SupplierBalanceResponse(
    val supplierCode: String,
    val supplierName: String,
    val currency: String,       // supplier's settlement currency
    val balance: Double,        // current balance in settlement currency
)

// ═══════════════════════════════════════════════
// TRANSACTION LIST DTOs
// V1 parity: transaction_list_api
// ═══════════════════════════════════════════════

data class TransactionQueryParams(
    val supplierCode: String,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val preset: String? = null,     // 6m / 1y / 2y
)

data class TransactionListResponse(
    val supplierCode: String,
    val supplierName: String,
    val supplierCurrency: String,
    val beginningBalance: Double,
    val transactions: List<TransactionItem>,
    val filter: TransactionFilter,
)

data class TransactionItem(
    val id: Long,
    val tranNum: String,            // V1: tran_num = payment_no
    val tranDate: String,           // YYYY-MM-DD
    val tranCurrReq: String,        // supplier required currency
    val tranCurrUse: String,        // actual payment currency
    val tranAmount: Double,         // payment amount
    val tranType: String,           // deposit / usage / refund / withdraw / rate
    val exchangeRate: Double,       // usd_rmb
    val rateMode: String,           // auto / manual
    val tranSeq: String,            // V1: tran_seq → from payment_events latest
    val tranBy: String,             // operator
    val tranNote: String,           // note
    val convertedAmount: Double,    // amount converted to supplier currency
    val runningBalance: Double,     // cumulative balance
    val hasFile: Boolean,           // whether files exist
    val isDeleted: Boolean,         // whether soft-deleted
)

data class TransactionFilter(
    val dateFrom: String?,
    val dateTo: String?,
)

// ═══════════════════════════════════════════════
// CREATE PREPAYMENT DTOs
// V1 parity: submit_prepay_api
// ═══════════════════════════════════════════════

data class CreatePrepaymentRequest(
    val supplierCode: String,
    val tranDate: LocalDate,
    val tranCurrReq: String,        // supplier required currency
    val tranCurrUse: String,        // actual payment currency
    val exchangeRate: BigDecimal,   // usd_rmb
    val rateMode: String = "manual",// auto / manual
    val amount: BigDecimal,         // positive amount
    val note: String,               // required
)

data class CreatePrepaymentResponse(
    val id: Long,
    val tranNum: String,            // generated tran_num (payment_no)
    val fileSaved: Boolean,
    val message: String,
)

// ═══════════════════════════════════════════════
// HISTORY DTOs
// V1 parity: prepay_history_api (3-column layout)
// ═══════════════════════════════════════════════

data class PrepaymentHistoryResponse(
    val tranNum: String,
    val supplierCode: String,
    val supplierStrategyVersions: List<StrategyVersionItem>,  // left column
    val rateVersions: List<RateVersionItem>,                  // middle column
    val amountVersions: List<AmountVersionItem>,              // right column
)

/** Left column: supplier strategy changes (from supplier_strategies table) */
data class StrategyVersionItem(
    val seq: String,                // S1, S2, ...
    val date: String,               // created_at or effective_date
    val by: String,                 // operator
    val note: String,
    val isInitial: Boolean,
    val effectiveDate: String,
    val currency: String? = null,   // only for initial
    val changes: List<FieldChange>,
)

/** Middle column: rate/currency changes (from payment_events) */
data class RateVersionItem(
    val seq: String,                // T01, T02, ... (from event_seq)
    val date: String,               // event created_at
    val by: String,
    val note: String,
    val isInitial: Boolean,
    val exchangeRate: Double,
    val tranCurrUse: String,
    val changes: List<FieldChange>,
)

/** Right column: amount changes (from payment_events) */
data class AmountVersionItem(
    val seq: String,
    val date: String,
    val by: String,
    val note: String,
    val isInitial: Boolean,
    val eventType: String,          // CREATE / DELETE / RESTORE / AMOUNT_CHANGE
    val currency: String,
    val exchangeRate: Double,
    val amount: Double? = null,     // only for initial
    val usdAmount: Double? = null,  // only for initial
    val changes: List<FieldChange>,
)

data class FieldChange(
    val field: String,
    val old: String,
    val new: String,
)

// ═══════════════════════════════════════════════
// FILE MANAGEMENT DTOs
// V1 parity: file_info_api / serve_file_api / upload_file_api / delete_file_api
// ═══════════════════════════════════════════════

data class FileInfoResponse(
    val tranNum: String,
    val year: String,
    val hasFile: Boolean,
    val latestFile: String?,
    val files: List<FileItem>,
)

data class FileItem(
    val name: String,
    val size: Long,
    val modified: Long,             // epoch millis
)

// ═══════════════════════════════════════════════
// EXCHANGE RATE DTOs
// V1 parity: rate_api
// ═══════════════════════════════════════════════

data class ExchangeRateResponse(
    val rate: Double,
    val source: String,             // recent_transaction / default
)

// ═══════════════════════════════════════════════
// EVENT DTOs (internal use for audit trail)
// ═══════════════════════════════════════════════

data class PaymentEventResponse(
    val id: Long,
    val paymentId: Long,
    val paymentNo: String,
    val eventType: String,
    val eventSeq: Int,
    val changes: String,            // raw JSONB
    val note: String?,
    val operator: String,
    val createdAt: Instant,
)
