package com.mgmt.modules.inventory.application.dto

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
