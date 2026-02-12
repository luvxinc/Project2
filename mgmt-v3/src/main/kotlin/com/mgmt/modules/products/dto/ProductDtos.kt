package com.mgmt.modules.products.dto

import java.math.BigDecimal

// ═══════════ Query DTOs ═══════════

data class ProductQueryParams(
    val page: Int = 1,
    val limit: Int = 20,
    val search: String? = null,
    val category: String? = null,
    val status: String? = null,  // ACTIVE, INACTIVE
)

// ═══════════ Create DTOs ═══════════

data class CreateProductRequest(
    val sku: String,
    val name: String? = null,
    val category: String? = null,
    val cogs: BigDecimal? = null,
    val upc: String? = null,
)

data class BatchCreateProductRequest(
    val products: List<CreateProductRequest>,
)

// ═══════════ Update DTOs ═══════════

data class UpdateProductRequest(
    val name: String? = null,
    val category: String? = null,
    val cogs: BigDecimal? = null,
    val upc: String? = null,
    val status: String? = null,  // ACTIVE, INACTIVE
)

data class CogsItem(
    val id: String,
    val cogs: BigDecimal,
)

data class BatchUpdateCogsRequest(
    val items: List<CogsItem>,
)

// ═══════════ Barcode DTOs ═══════════

data class GenerateBarcodeRequest(
    val skus: List<String>,
    val copiesPerSku: Int = 1,
    val format: String = "CODE128",  // CODE128, EAN13, UPC
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
    val createdAt: Any,
    val updatedAt: Any,
)

data class PaginatedProductResponse(
    val data: List<ProductResponse>,
    val meta: PaginationMeta,
)

data class PaginationMeta(
    val total: Long,
    val page: Int,
    val limit: Int,
    val totalPages: Int,
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
