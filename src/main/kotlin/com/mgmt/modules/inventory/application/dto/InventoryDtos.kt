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
    val locationDetails: List<CreateStocktakeLocationDetailRequest>? = null,
)

data class CreateStocktakeItemRequest(
    val sku: String,
    val countedQty: Int,
)

data class CreateStocktakeLocationDetailRequest(
    val sku: String,
    val qtyPerBox: Int,
    val numOfBox: Int,
    val warehouse: String,
    val aisle: String,   // WLR: L/R
    val bay: Int,        // LOC: number
    val level: String,   // LEVEL: G/M/T
    val bin: String = "",  // SLR: L/R or empty
    val slot: String = "", // LLR: L/R or empty
)

data class UpdateStocktakeRequest(
    val note: String? = null,
    val items: List<CreateStocktakeItemRequest>? = null,
    val locationDetails: List<CreateStocktakeLocationDetailRequest>? = null,
)

// Single-record update for location detail (History page inline edit)
data class UpdateLocationDetailRequest(
    val qtyPerBox: Int? = null,
    val numOfBox: Int? = null,
    val warehouse: String? = null,
    val aisle: String? = null,
    val bay: Int? = null,
    val level: String? = null,
    val bin: String? = null,
    val slot: String? = null,
)

// Single-record update for legacy item (History page inline edit)
data class UpdateStocktakeItemRequest(
    val countedQty: Int,
)

// Add single item to existing stocktake (History page add SKU)
data class AddStocktakeItemRequest(
    val sku: String,
    val countedQty: Int,
)

// Add single location detail to existing stocktake (History page add SKU)
data class AddLocationDetailRequest(
    val sku: String,
    val qtyPerBox: Int,
    val numOfBox: Int,
    val warehouse: String,
    val aisle: String,
    val bay: Int,
    val level: String,
    val bin: String = "",
    val slot: String = "",
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
    val hasInventory: Boolean = false,
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
    val hasInventory: Boolean = false,
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
    val bin: String,
    val slots: List<String>,
)

data class DownloadBarcodeRequest(
    val barcodes: List<String>,
)

// ═══════════════════════════════════════════════
// STOCKTAKE LOCATION DETAIL DTOs
// ═══════════════════════════════════════════════

data class StocktakeLocationDetailResponse(
    val id: Long,
    val locationId: Long,
    val sku: String,
    val qtyPerBox: Int,
    val numOfBox: Int,
    val totalQty: Int,
    val warehouse: String,
    val aisle: String,
    val bay: Int,
    val level: String,
    val bin: String,
    val slot: String,
    val barcode: String?,
)

// ═══════════════════════════════════════════════
// WAREHOUSE INVENTORY DTOs (3D Hover + Product List)
// ═══════════════════════════════════════════════

data class WarehouseInventoryResponse(
    val warehouse: String,
    val locations: List<LocationInventoryItem>,
    val totalLocations: Int,
    val occupiedLocations: Int,
)

data class LocationInventoryItem(
    val locationId: Long,
    val aisle: String,
    val bay: Int,
    val level: String,
    val bin: String,
    val slot: String,
    val barcode: String?,
    val items: List<LocationSkuItem>,
)

data class LocationSkuItem(
    val sku: String,
    val qtyPerBox: Int,
    val numOfBox: Int,
    val totalQty: Int,
)

data class WarehouseProductListResponse(
    val warehouse: String,
    val products: List<WarehouseProductSummary>,
    val totalSkus: Int,
    val totalQuantity: Int,
    val totalValue: BigDecimal,
)

data class WarehouseProductSummary(
    val sku: String,
    val totalQty: Int,
    val fifoCost: BigDecimal,
    val totalValue: BigDecimal,
)

// ═══════════════════════════════════════════════
// STOCKTAKE EVENT DTOs (History)
// ═══════════════════════════════════════════════

data class StocktakeEventResponse(
    val id: Long,
    val stocktakeId: Long,
    val eventType: String,
    val summary: String?,
    val createdBy: String?,
    val createdAt: Instant,
)

