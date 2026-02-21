package com.mgmt.modules.purchase.application.dto

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

// ═══════════════════════════════════════════════
// SUPPLIER DTOs
// ═══════════════════════════════════════════════

data class SupplierResponse(
    val id: Long,
    val supplierCode: String,
    val supplierName: String,
    val status: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CreateSupplierRequest(
    val supplierCode: String,
    val supplierName: String,
    val category: String = "E",
    val currency: String = "USD",
    val floatCurrency: Boolean = false,
    val floatThreshold: BigDecimal = BigDecimal.ZERO,
    val requireDeposit: Boolean = false,
    val depositRatio: BigDecimal = BigDecimal.ZERO,
)

data class UpdateSupplierRequest(
    val supplierName: String? = null,
    val status: Boolean? = null,
)

data class SupplierStrategyResponse(
    val id: Long,
    val supplierId: Long,
    val supplierCode: String,
    val category: String,
    val currency: String,
    val floatCurrency: Boolean,
    val floatThreshold: Double,
    val requireDeposit: Boolean,
    val depositRatio: Double,
    val effectiveDate: LocalDate,
    val note: String?,
    val contractFile: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class SupplierWithStrategyResponse(
    val id: Long,
    val supplierCode: String,
    val supplierName: String,
    val status: Boolean,
    val latestStrategy: SupplierStrategyResponse?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ModifyStrategyRequest(
    val supplierCode: String,
    val category: String? = null,
    val currency: String? = null,
    val floatCurrency: Boolean? = null,
    val floatThreshold: BigDecimal? = null,
    val requireDeposit: Boolean? = null,
    val depositRatio: BigDecimal? = null,
    val effectiveDate: LocalDate,
    val note: String? = null,
    val status: Boolean? = null,
    val supplierName: String? = null,
    val override: Boolean = false,
)

// ═══════════════════════════════════════════════
// PURCHASE ORDER DTOs
// ═══════════════════════════════════════════════

data class PurchaseOrderQueryParams(
    val page: Int = 1,
    val limit: Int = 20,
    val search: String? = null,
    val supplierCode: String? = null,
    val status: String? = null,
    val includeDeleted: Boolean = true,
    val dateFrom: LocalDate? = null,
    val dateTo: LocalDate? = null,
)

data class PurchaseOrderResponse(
    val id: Long,
    val poNum: String,
    val supplierId: Long,
    val supplierCode: String,
    val poDate: LocalDate,
    val status: String,
    // V1 parity: summary fields for list view
    val itemCount: Int? = null,
    val totalAmount: Double? = null,
    val totalRmb: Double? = null,
    val totalUsd: Double? = null,
    val currency: String? = null,
    val exchangeRate: Double? = null,
    val isDeleted: Boolean = false,
    val shippingStatus: String? = null,
    // V1 parity: version seqs displayed as L01/V01
    val detailSeq: String? = null,
    val strategySeq: String? = null,
    val createdBy: String? = null,
    val updatedBy: String? = null,
    // Detail fields (only populated in detail endpoint)
    val items: List<PurchaseOrderItemResponse>? = null,
    val strategy: PurchaseOrderStrategyResponse? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class PurchaseOrderItemResponse(
    val id: Long,
    val sku: String,
    val quantity: Int,
    val unitPrice: Double,
    val currency: String,
    val exchangeRate: Double,
    val note: String?,
)

data class PurchaseOrderStrategyResponse(
    val id: Long,
    val strategyDate: LocalDate,
    val currency: String,
    val exchangeRate: Double,
    val rateMode: String,
    val floatEnabled: Boolean,
    val floatThreshold: Double,
    val requireDeposit: Boolean,
    val depositRatio: Double,
    val note: String?,
)

data class CreatePurchaseOrderRequest(
    val supplierCode: String,
    val poDate: LocalDate,
    val items: List<CreatePoItemRequest>,
    val strategy: CreatePoStrategyRequest,
)

data class CreatePoItemRequest(
    val sku: String,
    val quantity: Int,
    val unitPrice: BigDecimal,
    val currency: String = "RMB",
    val exchangeRate: BigDecimal = BigDecimal("7.0"),
    val note: String? = null,
)

data class CreatePoStrategyRequest(
    val strategyDate: LocalDate,
    val currency: String = "USD",
    val exchangeRate: BigDecimal = BigDecimal("7.0"),
    val rateMode: String = "auto",
    val floatEnabled: Boolean = false,
    val floatThreshold: BigDecimal = BigDecimal.ZERO,
    val requireDeposit: Boolean = false,
    val depositRatio: BigDecimal = BigDecimal.ZERO,
    val note: String? = null,
)

data class UpdatePurchaseOrderRequest(
    val status: String? = null,
    val items: List<CreatePoItemRequest>? = null,
    val strategy: CreatePoStrategyRequest? = null,
)

// ═══════════════════════════════════════════════
// SHIPMENT DTOs
// ═══════════════════════════════════════════════

data class ShipmentQueryParams(
    val page: Int = 1,
    val limit: Int = 20,
    val search: String? = null,
    val status: String? = null,
    val dateFrom: LocalDate? = null,
    val dateTo: LocalDate? = null,
    val includeDeleted: Boolean = false,
)

data class ShipmentResponse(
    val id: Long,
    val logisticNum: String,
    val sentDate: LocalDate,
    val etaDate: LocalDate?,
    val pallets: Int,
    val totalWeight: Double,
    val priceKg: Double,
    val logisticsCost: Double,
    val exchangeRate: Double,
    /** V1: in_send.mode — 'A' = auto, 'M' = manual */
    val rateMode: String = "M",
    val status: String,
    val note: String?,
    val items: List<ShipmentItemResponse>? = null,
    val itemCount: Int? = null,
    val totalValue: Double? = null,
    val isDeleted: Boolean = false,
    val createdBy: String? = null,
    val updatedBy: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** V1 parity: computed receive status — IN_TRANSIT / ALL_RECEIVED / DIFF_UNRESOLVED / DIFF_RESOLVED */
    val receiveStatus: String = "IN_TRANSIT",
)

data class ShipmentItemResponse(
    val id: Long,
    val poNum: String,
    val sku: String,
    val quantity: Int,
    val unitPrice: Double,
    val poChange: Boolean,
    val note: String?,
    /** V1 parity: ordered qty from PO for this (poNum, sku, unitPrice) */
    val orderedQty: Int? = null,
    /** V1 parity: total shipped across ALL shipments for this (poNum, sku) */
    val totalShipped: Int? = null,
)

/**
 * V1 parity: query.py L267-286 → get_shipment_items_api
 * Items grouped by (po_num, po_sku) with SUM(sent_quantity).
 * Different price tiers for same SKU are merged — matches V1 GROUP BY behavior.
 */
data class ShipmentItemGroupedResponse(
    val poNum: String,
    val sku: String,
    val sentQuantity: Int,    // V1: SUM(sent_quantity) across price tiers
    val unitPrice: Double,    // Representative price (highest tier, for display only)
)


data class CreateShipmentRequest(
    val logisticNum: String,
    val sentDate: LocalDate,
    val etaDate: LocalDate? = null,
    val pallets: Int = 0,
    val totalWeight: BigDecimal = BigDecimal.ZERO,
    val priceKg: BigDecimal = BigDecimal.ZERO,
    val logisticsCost: BigDecimal = BigDecimal.ZERO,
    val exchangeRate: BigDecimal = BigDecimal("7.0"),
    /** V1: is_manual_rate → mode. 'A' = auto, 'M' = manual */
    val rateMode: String = "M",
    val note: String? = null,
    val items: List<CreateShipmentItemRequest>,
)

data class CreateShipmentItemRequest(
    val poNum: String,
    val sku: String,
    val quantity: Int,
    val unitPrice: BigDecimal,
    val poChange: Boolean = false,
    val note: String? = null,
)

data class UpdateShipmentRequest(
    val etaDate: LocalDate? = null,
    val pallets: Int? = null,
    val totalWeight: BigDecimal? = null,
    val priceKg: BigDecimal? = null,
    val exchangeRate: BigDecimal? = null,
    val note: String? = null,
    /** V1 parity: optional item edits — full replacement of items list */
    val items: List<UpdateShipmentItemRequest>? = null,
)

/**
 * Item-level edit within an update-shipment request.
 * If `id` is present → update existing item.
 * If `id` is null → new item to add.
 * Items NOT in the list are soft-deleted (removed).
 */
data class UpdateShipmentItemRequest(
    val id: Long? = null,
    val poNum: String,
    val sku: String,
    val quantity: Int,
    val unitPrice: BigDecimal,
    val poChange: Boolean = false,
)

data class ShipmentAvailablePo(
    val poId: Long,
    val poNum: String,
    val supplierCode: String,
    val poDate: LocalDate,
    val items: List<ShipmentAvailablePoItem>,
)

data class ShipmentAvailablePoItem(
    val sku: String,
    val orderedQty: Int,
    val shippedQty: Int,
    val remainingQty: Int,
    val unitPrice: Double,
    val currency: String,
)

data class ShipmentEventResponse(
    val id: Long,
    val shipmentId: Long,
    val logisticNum: String,
    val eventType: String,
    val eventSeq: Int,
    val changes: String,
    val note: String?,
    val operator: String,
    val createdAt: Instant,
)

// ═══════════════════════════════════════════════
// RECEIVE DTOs
// ═══════════════════════════════════════════════

data class ReceiveResponse(
    val id: Long,
    val shipmentId: Long,
    val logisticNum: String,
    val poNum: String,
    val sku: String,
    val unitPrice: Double,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val receiveDate: LocalDate,
    val note: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class SubmitReceiveRequest(
    val logisticNum: String,
    val items: List<ReceiveItemInput>,
)

data class ReceiveItemInput(
    val sku: String,
    val unitPrice: BigDecimal,
    val receiveQuantity: Int,
    val receiveDate: LocalDate,
    val note: String? = null,
)

// ═══════════════════════════════════════════════
// PAYMENT DTOs
// ═══════════════════════════════════════════════

data class PaymentQueryParams(
    val page: Int = 1,
    val limit: Int = 20,
    val paymentType: String? = null,
    val poId: Long? = null,
    val poNum: String? = null,
    val supplierCode: String? = null,
)

data class PaymentResponse(
    val id: Long,
    val paymentType: String,
    val paymentNo: String,
    val poId: Long?,
    val poNum: String?,
    val shipmentId: Long?,
    val logisticNum: String?,
    val supplierId: Long?,
    val supplierCode: String?,
    val paymentDate: LocalDate,
    val currency: String,
    val cashAmount: Double,
    val prepayAmount: Double,
    val exchangeRate: Double,
    val rateMode: String,
    val extraAmount: Double,
    val extraCurrency: String?,
    val extraNote: String?,
    val prepayTranType: String?,
    val depositOverride: Boolean?,
    val note: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CreatePaymentRequest(
    val paymentType: String,
    val paymentNo: String,
    val poId: Long? = null,
    val poNum: String? = null,
    val shipmentId: Long? = null,
    val logisticNum: String? = null,
    val supplierId: Long? = null,
    val supplierCode: String? = null,
    val paymentDate: LocalDate,
    val currency: String = "USD",
    val cashAmount: BigDecimal = BigDecimal.ZERO,
    val prepayAmount: BigDecimal = BigDecimal.ZERO,
    val exchangeRate: BigDecimal = BigDecimal("7.0"),
    val rateMode: String = "auto",
    val extraAmount: BigDecimal = BigDecimal.ZERO,
    val extraCurrency: String? = null,
    val extraNote: String? = null,
    val prepayTranType: String? = null,
    val depositOverride: Boolean? = null,
    val note: String? = null,
)

// ═══════════════════════════════════════════════
// RECEIVE DIFF DTOs
// ═══════════════════════════════════════════════

data class ReceiveDiffResponse(
    val id: Long,
    val receiveId: Long,
    val logisticNum: String,
    val poNum: String,
    val sku: String,
    val poQuantity: Int,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val diffQuantity: Int,
    val status: String,
    val resolutionNote: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ResolveReceiveDiffRequest(
    val resolutionNote: String,
)

// ═══════════════════════════════════════════════
// RECEIVE MANAGEMENT DTOs (入库管理)
// V1 parity: receive_mgmt/{list,detail,edit,delete,history}.py
// ═══════════════════════════════════════════════

/** V1: receive_list_api response item */
data class ReceiveManagementItemResponse(
    val logisticNum: String,
    val sentDate: String,            // 发货日期 — from shipment.sentDate
    val receiveDate: String,
    val detailSeq: String,           // V1 parity: detail_seq — current version number (e.g. V01, V02)
    val updateDate: String,          // V1 parity: update_date — most recent update timestamp
    val status: String,              // IN_TRANSIT | ALL_RECEIVED | DIFF_UNRESOLVED | DIFF_RESOLVED | DELETED
    val canModify: Boolean,
    val canDelete: Boolean,
    val isDeleted: Boolean,
)


/** V1: receive_detail_api — items within a shipment */
data class ReceiveDetailItemResponse(
    val poNum: String,
    val sku: String,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val diff: Int,
    val itemStatus: String,          // normal | deficit | excess
)

/** V1: receive_detail_api full response */
data class ReceiveManagementDetailResponse(
    val logisticNum: String,
    val receiveDate: String,
    val etaDate: String,
    val pallets: Int,
    val receiveStatus: String,
    val note: String?,
    val createdBy: String?,
    val updatedBy: String?,
    val items: List<ReceiveDetailItemResponse>,
    val diffs: List<ReceiveDiffResponse>,
)

/** V1: receive_edit_submit_api input */
data class EditReceiveRequest(
    val note: String? = null,
    val items: List<EditReceiveItemInput>,
)

data class EditReceiveItemInput(
    val poNum: String,
    val sku: String,
    val receiveQuantity: Int,
)

/** V1: receive_edit_submit_api result */
data class EditReceiveResult(
    val updatedRows: Int,
    val diffRows: Int,
)

/** V1: delete/restore request — note is REQUIRED (V1 delete.py L50-51: 缺少删除备注 → 400) */
data class DeleteReceiveRequest(
    val note: String,               // Required — blank note → 400
)


/** V1 parity history.py — one SEQ version of receive records */
data class ReceiveHistoryVersion(
    val seq: String,                         // V1: seq field e.g. "V01", "R02"
    val versionDate: String,                 // V1: receive_date
    val updatedAt: String,                   // V1: update_date
    val updatedBy: String,                   // V1: by
    val note: String,                        // V1: note
    val isInitial: Boolean,                  // V1: is_initial (seq_idx == 0)
    val isActive: Boolean,                   // V1: not soft-deleted
    val items: List<ReceiveHistoryItem>,     // V1: items (only for initial version)
    val changes: List<ReceiveHistoryChange>, // V1: changes (only for non-initial versions)
)

/** V1 parity: one changed field from adjust action */
data class ReceiveHistoryChange(
    val type: String,        // "adjust" | "delete" | "restore"
    val poNum: String,
    val sku: String,
    val unitPrice: Double,
    val fields: List<ReceiveHistoryFieldChange>,
)

data class ReceiveHistoryFieldChange(
    val field: String,   // "入库数量"
    val old: Int,
    val new: Int,
)

data class ReceiveHistoryItem(
    val poNum: String,
    val sku: String,
    val unitPrice: Double,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val action: String,      // V1: action field ("new" | "adjust")
)

/** V1 parity: one SEQ version of diff records */
data class ReceiveDiffHistoryVersion(
    val seq: String,
    val receiveDate: String,
    val updatedBy: String,
    val note: String,
    val isInitial: Boolean,
    val items: List<ReceiveDiffHistoryItem>,     // only for initial
    val changes: List<ReceiveDiffHistoryChange>, // only for non-initial
)

data class ReceiveDiffHistoryItem(
    val poNum: String,
    val sku: String,
    val poQuantity: Int,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val diffQuantity: Int,
    val status: String,
    val action: String,
    val resolutionNote: String?,
    val updatedAt: String,
)

data class ReceiveDiffHistoryChange(
    val type: String,
    val poNum: String,
    val sku: String,
    val fields: List<ReceiveHistoryFieldChange>,
)

data class ReceiveHistoryResponse(
    val logisticNum: String,
    val receiveVersions: List<ReceiveHistoryVersion>,  // V1: receive_versions (by seq)
    val diffVersions: List<ReceiveDiffHistoryVersion>, // V1: diff_versions (by seq)
)


// ═══════════════════════════════════════════════
// RECEIVE GOODS DTOs (货物入库)
// V1 parity: receive/query.py + receive/submit.py
// ═══════════════════════════════════════════════

/** V1: get_pending_shipments_api — a pending shipment to receive */
data class PendingShipmentResponse(
    val id: Long,
    val logisticNum: String,
    val sentDate: String,
    val etaDate: String?,
    val pallets: Int,
    val items: List<PendingShipmentItemResponse>,
)

data class PendingShipmentItemResponse(
    val poNum: String,
    val sku: String,
    val sentQuantity: Int,
    val unitPrice: Double,
)


// ═══════════════════════════════════════════════
// ABNORMAL (RECEIVE DIFF) MANAGEMENT DTOs
// V1 parity: abnormal.py — list/detail/history/process/delete
// ═══════════════════════════════════════════════

/** V1: abnormal_list_api — grouped by (logisticNum, receiveDate) */
data class AbnormalListResponse(
    val logisticNum: String,
    val receiveDate: String,
    val status: String,                // pending | resolved | deleted
    val skuCount: Int,
    val totalDiff: Int,
    val note: String?,
)

/** V1: abnormal_detail_api — per-SKU diff detail */
data class AbnormalDetailItemResponse(
    val id: Long,
    val poNum: String,
    val sku: String,
    val poQuantity: Int,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val diffQuantity: Int,
    val status: String,                // pending | resolved
    val resolutionNote: String?,
    val unitPrice: Double?,            // V1: po_price from in_receive_final
    val currency: String?,             // V1: from in_po_strategy
)

/** V1: abnormal_detail_api full response */
data class AbnormalDetailResponse(
    val logisticNum: String,
    val receiveDate: String,
    val overallStatus: String,         // pending | resolved
    val items: List<AbnormalDetailItemResponse>,
    val summary: AbnormalSummary,
)

data class AbnormalSummary(
    val totalSkus: Int,
    val totalDiff: Int,
    val overReceived: Int,             // V1: negative diff (多收)
    val underReceived: Int,            // V1: positive diff (少收)
)

/** V1: abnormal_history_api — per-diff audit record */
data class AbnormalHistoryItemResponse(
    val id: Long,
    val poNum: String,
    val sku: String,
    val poQuantity: Int,
    val sentQuantity: Int,
    val receiveQuantity: Int,
    val diffQuantity: Int,
    val status: String,
    val resolutionNote: String?,
    val updatedBy: String?,
    val updatedAt: String,
    val createdAt: String,
)

// ═══════════════════════════════════════════════
// ABNORMAL PROCESS / DELETE DTOs
// ═══════════════════════════════════════════════

/**
 * V1: abnormal_process_api — process abnormal diffs by strategy.
 * po_methods: { "PO订货单号": { "positive": 1, "negative": 2 } }
 */
data class ProcessAbnormalRequest(
    val logisticNum: String,
    val note: String? = null,
    val delayDate: String? = null,
    val poMethods: Map<String, PoMethodStrategy>,
)

data class PoMethodStrategy(
    val positive: Int? = null,   // Strategy for shortage (diff > 0): 1/2/3/4
    val negative: Int? = null,   // Strategy for overage  (diff < 0): 1/2/4
)

/** V1: abnormal_delete_api — delete resolved abnormal records */
data class DeleteAbnormalRequest(
    val logisticNum: String,
)
