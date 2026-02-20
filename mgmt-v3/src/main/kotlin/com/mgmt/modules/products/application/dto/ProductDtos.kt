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

// ═══════════ Create DTOs (V1 parity: 5 fields) ═══════════

data class CreateProductRequest(
    @field:jakarta.validation.constraints.NotBlank(message = "SKU is required")
    @field:jakarta.validation.constraints.Pattern(regexp = "^[A-Za-z0-9/_\\-]+$", message = "SKU can only contain letters, numbers, slashes, hyphens, and underscores")
    val sku: String,
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "Cost must be >= 0")
    val cost: BigDecimal? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "Freight must be >= 0")
    val freight: BigDecimal? = null,
    @field:jakarta.validation.constraints.Min(value = 0, message = "Weight must be >= 0")
    val weight: Int? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "COGS must be >= 0")
    val cogs: BigDecimal? = null,
    val upc: String? = null,
    @field:jakarta.validation.constraints.Min(value = 0, message = "MOQ must be >= 0")
    val moq: Int? = null,
)

data class BatchCreateProductRequest(
    val products: List<CreateProductRequest>,
)

// ═══════════ Update DTOs (V1 parity) ═══════════

data class UpdateProductRequest(
    val name: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val type: String? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "Cost must be >= 0")
    val cost: BigDecimal? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "Freight must be >= 0")
    val freight: BigDecimal? = null,
    @field:jakarta.validation.constraints.Min(value = 0, message = "Weight must be >= 0")
    val weight: Int? = null,
    @field:jakarta.validation.constraints.DecimalMin(value = "0", message = "COGS must be >= 0")
    val cogs: BigDecimal? = null,
    val upc: String? = null,
    val status: String? = null,
    @field:jakarta.validation.constraints.Min(value = 0, message = "MOQ must be >= 0")
    val moq: Int? = null,
)

// V1 parity: COGS batch update sends {id, cogs}
data class CogsItem(
    val id: String,
    val cogs: BigDecimal,
)

data class BatchUpdateCogsRequest(
    val items: List<CogsItem>,
)

// ═══════════ Barcode DTOs (V1 parity) ═══════════

data class GenerateBarcodeRequest(
    val items: List<BarcodeItem>,
) {
    data class BarcodeItem(
        val sku: String,
        val qtyPerBox: Int,
        val boxPerCtn: Int,
    )
}

// ═══════════ Metadata DTO (dropdown options for Create/COGS forms) ═══════════

data class ProductMetadataResponse(
    val categories: List<String>,
    val subcategories: List<String>,
    val types: List<String>,
    val existingSkus: List<String>,
)

// ═══════════ Response DTOs (V1 parity) ═══════════

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
    val moq: Int?,
    val upc: String?,
    val status: String,
    val createdAt: Instant,
    val updatedAt: Instant,
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
