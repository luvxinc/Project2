package com.mgmt.modules.inventory.application.dto

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

// ═══════════════════════════════════════════════
// STOCKTAKE DTOs
// ═══════════════════════════════════════════════

data class StocktakeResponse(
    val id: Long,
    val stocktakeDate: LocalDate,
    val note: String?,
    val itemCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class StocktakeDetailResponse(
    val id: Long,
    val stocktakeDate: LocalDate,
    val note: String?,
    val items: List<StocktakeItemResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class StocktakeItemResponse(
    val id: Long,
    val sku: String,
    val countedQty: Int,
)

data class CreateStocktakeRequest(
    val stocktakeDate: LocalDate,
    val note: String? = null,
    val items: List<CreateStocktakeItemRequest>,
)

data class CreateStocktakeItemRequest(
    val sku: String,
    val countedQty: Int,
)

data class UpdateStocktakeRequest(
    val note: String? = null,
    val items: List<CreateStocktakeItemRequest>? = null,
)

// ═══════════════════════════════════════════════
// WAREHOUSE LOCATION DTOs
// ═══════════════════════════════════════════════

data class WarehouseLocationResponse(
    val id: Long,
    val warehouse: String,
    val aisle: String,
    val bay: Int,
    val level: String,
    val bin: String,
    val slot: String,
    val barcode: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class CreateWarehouseLocationRequest(
    val warehouse: String,
    val aisle: String,
    val bay: Int,
    val level: String,
    val bin: String = "",
    val slot: String = "",
)

data class WarehouseLocationQueryParams(
    val page: Int = 1,
    val limit: Int = 50,
    val warehouse: String? = null,
    val search: String? = null,
)

// ═══════════════════════════════════════════════
// WAREHOUSE SHELF (batch creation) DTOs
// ═══════════════════════════════════════════════

data class BatchCreateWarehouseRequest(
    val warehouse: String,  // "WH01" — uppercase-normalized
    val aisles: Map<String, AisleConfig>,  // {"L": {...}, "R": {...}}
    val secCodeL2: String? = null,
)

data class AisleConfig(
    @field:Min(1) @field:Max(20)
    val bayCount: Int,
    val levels: List<String> = listOf("G", "M", "T"),
    @field:Min(0) @field:Max(10)
    val binCount: Int = 0,
    @field:Min(0) @field:Max(10)
    val slotCount: Int = 0,
    val customBays: Map<String, BayConfig>? = null,
)

data class BayConfig(
    val levels: List<String>? = null,
    val binCount: Int? = null,
    val slotCount: Int? = null,
)

data class WarehouseTreeResponse(
    val warehouses: List<WarehouseNode>,
    val totalWarehouses: Int,
    val totalLocations: Int,
)

data class WarehouseNode(
    val warehouse: String,
    val totalLocations: Int,
    val aisles: List<AisleNode>,
)

data class AisleNode(
    val aisle: String,
    val bays: List<BayNode>,
)

data class BayNode(
    val bay: Int,
    val levels: List<LevelNode>,
)

data class LevelNode(
    val level: String,
    val bins: List<BinNode>,
)

data class BinNode(
    val bin: Int,
    val slots: List<String>,
)

data class DownloadBarcodeRequest(
    val barcodes: List<String>,
)
