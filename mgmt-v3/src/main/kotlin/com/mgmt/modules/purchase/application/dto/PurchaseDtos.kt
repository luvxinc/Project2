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
    val type: String? = null,
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
    val type: String?,
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
    val type: String? = null,
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
)

data class ShipmentResponse(
    val id: Long,
    val logisticNum: String,
    val sentDate: LocalDate,
    val etaDate: LocalDate?,
    val pallets: Int,
    val logisticsCost: Double,
    val exchangeRate: Double,
    val status: String,
    val note: String?,
    val items: List<ShipmentItemResponse>? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ShipmentItemResponse(
    val id: Long,
    val poNum: String,
    val sku: String,
    val quantity: Int,
    val unitPrice: Double,
    val poChange: Boolean,
    val note: String?,
)

data class CreateShipmentRequest(
    val logisticNum: String,
    val sentDate: LocalDate,
    val etaDate: LocalDate? = null,
    val pallets: Int = 0,
    val logisticsCost: BigDecimal = BigDecimal.ZERO,
    val exchangeRate: BigDecimal = BigDecimal("7.0"),
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
