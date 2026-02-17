package com.mgmt.modules.vma.dto

import java.time.Instant
import java.time.LocalDate

// ================================================================
// Phase 5 DTOs — P-Valve Products, Inventory, Clinical Cases, Sites
// ================================================================

// ─── P-Valve Product DTOs ───────────────────────────────────────

data class CreatePValveProductRequest(
    val model: String,
    val specification: String,
    val diameterA: Double? = null,
    val diameterB: Double? = null,
    val diameterC: Double? = null,
    val expandedLengthD: Double? = null,
    val expandedLengthE: Double? = null,
    val crimpedTotalLength: Double? = null,
)

data class UpdatePValveProductRequest(
    val model: String? = null,
    val diameterA: Double? = null,
    val diameterB: Double? = null,
    val diameterC: Double? = null,
    val expandedLengthD: Double? = null,
    val expandedLengthE: Double? = null,
    val crimpedTotalLength: Double? = null,
)

data class CreateDeliverySystemProductRequest(
    val model: String,
    val specification: String,
    val fitPValveSpecs: List<String>? = null,
)

data class UpdateDeliverySystemProductRequest(
    val model: String? = null,
    val fitPValveSpecs: List<String>? = null,
)

data class UpdateFitRelationshipRequest(
    val deliverySystemSpec: String,
    val pvalveSpecs: List<String>,
)

data class PValveProductResponse(
    val id: String,
    val model: String,
    val specification: String,
    val diameterA: Double?,
    val diameterB: Double?,
    val diameterC: Double?,
    val expandedLengthD: Double?,
    val expandedLengthE: Double?,
    val crimpedTotalLength: Double?,
    val isActive: Boolean,
    val fits: List<FitRef>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class DeliverySystemProductResponse(
    val id: String,
    val model: String,
    val specification: String,
    val isActive: Boolean,
    val fits: List<FitRef>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class FitRef(
    val id: String,
    val model: String,
    val specification: String,
)

data class FitMatrixResponse(
    val pvalves: List<PValveProductResponse>,
    val deliverySystems: List<DeliverySystemProductResponse>,
)

// ─── Inventory Transaction DTOs ─────────────────────────────────

data class CreateInventoryTransactionRequest(
    val date: String,       // YYYY-MM-DD
    val action: String,     // REC_CN, OUT_CASE, etc.
    val productType: String,// PVALVE, DELIVERY_SYSTEM
    val specNo: String,
    val serialNo: String? = null,
    val qty: Int = 1,
    val expDate: String? = null,
    val inspection: String? = null,
    val notes: String? = null,
    val caseId: String? = null,
    val operator: String? = null,
    val location: String? = null,
    val batchNo: String? = null,
    val condition: List<Int>? = null,
)

data class UpdateInventoryTransactionRequest(
    val date: String? = null,
    val action: String? = null,
    val productType: String? = null,
    val specNo: String? = null,
    val serialNo: String? = null,
    val qty: Int? = null,
    val expDate: String? = null,
    val inspection: String? = null,
    val notes: String? = null,
    val caseId: String? = null,
    val operator: String? = null,
    val location: String? = null,
    val batchNo: String? = null,
    val condition: List<Int>? = null,
)

/** Receive from China — batch + product lines */
data class ReceiveFromChinaRequest(
    val batchNo: String,
    val poNo: String? = null,
    val dateShipped: String,
    val dateTimeReceived: String,  // "YYYY-MM-DD HH:MM PST"
    val operator: String,
    val comments: String? = null,
    val products: List<ReceiveProductLine>,
)

data class ReceiveProductLine(
    val productType: String,      // PVALVE, DELIVERY_SYSTEM
    val productModel: String,     // specification
    val serialNo: String,
    val qty: Int,
    val productCondition: String, // ACCEPT, REJECT
    val failedNoteIndices: List<Int>,
    val result: String,           // ACCEPT, REJECT
    val inspectionBy: String,
    val expDate: String? = null,
)

data class InventorySummaryRow(
    val specNo: String,
    val model: String?,
    val available: Int,
    val wip: Int,
    val nearExp: Int,
    val expired: Int,
    val total: Int,
)

data class InventoryDetailRow(
    val batchNo: String?,
    val specNo: String,
    val recDate: String?,
    val serialNo: String?,
    val expDate: String?,
    val quantity: Int,
    val actionDate: String?,
    val operator: String?,
    val transactionIds: List<String>,
)

// ─── Clinical Case DTOs ─────────────────────────────────────────

data class CreateClinicalCaseRequest(
    val caseNo: String? = null,
    val siteId: String,
    val patientId: String,
    val caseDate: String,
    val items: List<CaseLineItem>,
)

data class CaseLineItem(
    val productType: String,
    val specNo: String,
    val serialNo: String,
    val qty: Int,
    val expDate: String? = null,
    val batchNo: String? = null,
)

data class UpdateClinicalCaseInfoRequest(
    val caseNo: String? = null,
    val siteId: String? = null,
    val patientId: String? = null,
    val caseDate: String? = null,
)

data class UpdateCaseItemRequest(
    val specNo: String? = null,
    val serialNo: String? = null,
    val qty: Int? = null,
    val expDate: String? = null,
    val batchNo: String? = null,
)

data class AddCaseItemRequest(
    val productType: String,
    val specNo: String,
    val serialNo: String,
    val qty: Int,
    val expDate: String? = null,
    val batchNo: String? = null,
)

data class PickProductsRequest(
    val specNo: String,
    val qty: Int,
    val caseDate: String,
    val productType: String,
)

data class AvailableProductsRequest(
    val specNo: String,
    val caseDate: String,
    val productType: String,
)

data class CompleteCaseRequest(
    val items: List<CompleteCaseItem>,
)

data class CompleteCaseItem(
    val txnId: String,
    val returned: Boolean,
    val accepted: Boolean? = null,
    val returnCondition: List<Int>? = null,
)

data class PickedProduct(
    val serialNo: String,
    val specNo: String,
    val expDate: String?,
    val batchNo: String?,
    val qty: Int,
)

// ─── Site DTOs ──────────────────────────────────────────────────

data class CreateSiteRequest(
    val siteId: String,
    val siteName: String,
    val address: String,
    val address2: String? = null,
    val city: String,
    val state: String,
    val zipCode: String,
    val country: String,
)

data class UpdateSiteRequest(
    val siteName: String? = null,
    val address: String? = null,
    val address2: String? = null,
    val city: String? = null,
    val state: String? = null,
    val zipCode: String? = null,
    val country: String? = null,
)

// ─── Fridge Slot DTOs ───────────────────────────────────────────

data class PlaceFridgeSlotRequest(
    val shelfNo: Int,
    val rowNo: Int,
    val colNo: Int,
    val productType: String,   // PVALVE, DELIVERY_SYSTEM
    val specNo: String,
    val serialNo: String? = null,
    val placedBy: String? = null,
)

data class FridgeSlotResponse(
    val id: String,
    val shelfNo: Int,
    val rowNo: Int,
    val colNo: Int,
    val productType: String,
    val specNo: String,
    val serialNo: String?,
    val batchNo: String?,
    val expDate: String?,
    val placedAt: Instant,
    val placedBy: String?,
)

/**
 * Product eligible for fridge placement.
 * Only P-Valve products in Available / NearExp / Expired / Demo status.
 */
data class FridgeEligibleProduct(
    val specNo: String,
    val serialNo: String,
    val expDate: String?,
    val batchNo: String?,
    val status: String,    // AVAILABLE, NEAR_EXP, EXPIRED, DEMO
    val alreadyInFridge: Boolean,
)
