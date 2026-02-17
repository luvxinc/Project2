package com.mgmt.modules.products.application.dto

import java.math.BigDecimal
import java.time.Instant

// ═══════════ Query DTOs ═══════════

data class ProductQueryParams(
    val page: Int = 1,
    val limit: Int = 20,
    val search: String? = null,
    val category: String? = null,
    val status: String? = null,
)

// ═══════════ Create DTOs (V1: 9 fields) ═══════════

data class CreateProductRequest(
    val sku: String,
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    val cost: BigDecimal? = null,
    val freight: BigDecimal? = null,
    val weight: Int? = null,
    val upc: String? = null,
    val initialQty: Int? = null,   // V1: Initial_Qty → triggers Inventory module event
)

data class BatchCreateProductRequest(
    val products: List<CreateProductRequest>,
)

// ═══════════ Update DTOs ═══════════

data class UpdateProductRequest(
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    val cost: BigDecimal? = null,
    val freight: BigDecimal? = null,
    val weight: Int? = null,
    val upc: String? = null,
    val status: String? = null,
)

// V1: COGS batch update sends ALL 6 editable fields
data class CogsUpdateItem(
    val id: String,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    val cost: BigDecimal,
    val freight: BigDecimal,
    val weight: Int? = null,
)

data class BatchUpdateCogsRequest(
    val items: List<CogsUpdateItem>,
)

// ═══════════ Barcode DTOs (V1: sku + qtyPerBox + boxPerCtn) ═══════════

data class BarcodeItem(
    val sku: String,
    val qtyPerBox: Int,
    val boxPerCtn: Int,
)

data class GenerateBarcodeRequest(
    val items: List<BarcodeItem>,
)

// ═══════════ Metadata DTO (dropdown options for Create/COGS forms) ═══════════

data class ProductMetadataResponse(
    val categories: List<String>,
    val subcategories: List<String>,
    val types: List<String>,
    val existingSkus: List<String>,
)

// ═══════════ Response DTOs ═══════════

data class ProductResponse(
    val id: String,
    val sku: String,
    val name: String?,
    val category: String?,
    val subcategory: String?,
    val type: String?,
    val cost: Double,
    val freight: Double,
    val cogs: Double,
    val weight: Int,
    val upc: String?,
    val status: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val createdBy: String?,
    val updatedBy: String?,
)

data class BatchResult(
    val total: Int,
    val success: Int,
    val failed: Int,
    val results: List<BatchResultItem>,
)

data class BatchResultItem(
    val id: String? = null,
    val sku: String,
    val success: Boolean,
    val error: String? = null,
)
