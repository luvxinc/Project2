package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.PurchaseOrderUseCase
import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import com.mgmt.modules.purchase.infrastructure.excel.PoExcelService
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

/**
 * PurchaseOrderController — PO lifecycle REST API.
 *
 *
 * Endpoints (8):
 *   GET    /purchase/orders                - PO list (paginated)
 *   GET    /purchase/orders/{id}           - PO detail with items + strategy
 *   POST   /purchase/orders               - Create PO
 *   PATCH  /purchase/orders/{id}          - Update PO (status / items)
 *   DELETE /purchase/orders/{id}          - Soft delete
 *   POST   /purchase/orders/{id}/restore  - Restore soft-deleted PO
 */
@RestController
@RequestMapping("/purchase/orders")
class PurchaseOrderController(
    private val poUseCase: PurchaseOrderUseCase,
    private val excelService: PoExcelService,
) {

    @GetMapping
    @RequirePermission("module.purchase.po")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) supplierCode: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) dateFrom: String?,
        @RequestParam(required = false) dateTo: String?,
    ): ResponseEntity<Any> {
        val params = PurchaseOrderQueryParams(
            page = page, limit = limit, search = search,
            supplierCode = supplierCode, status = status,
            includeDeleted = true,
            dateFrom = dateFrom?.let { java.time.LocalDate.parse(it) },
            dateTo = dateTo?.let { java.time.LocalDate.parse(it) },
        )
        val (orders, total) = poUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = orders.map { toListResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.po")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> {
        val po = poUseCase.findOne(id)
        val items = poUseCase.getItems(id)
        val strategy = poUseCase.getStrategy(id)
        return ResponseEntity.ok(ApiResponse.ok(toDetailResponse(po, items, strategy)))
    }

    @PostMapping
    @RequirePermission("module.purchase.po.add")
    @SecurityLevel(level = "L3", actionKey = "btn_submit_po")
    @AuditLog(module = "PURCHASE", action = "CREATE_PO", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreatePurchaseOrderRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(poUseCase.create(dto, currentUsername()))))

    @PatchMapping("/{id}")
    @RequirePermission("module.purchase.po.mgmt")
    @SecurityLevel(level = "L3", actionKey = "btn_po_modify")
    @AuditLog(module = "PURCHASE", action = "UPDATE_PO", riskLevel = "HIGH")
    fun update(@PathVariable id: Long, @RequestBody dto: UpdatePurchaseOrderRequest): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(poUseCase.update(id, dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.po.mgmt")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_po")
    @AuditLog(module = "PURCHASE", action = "DELETE_PO", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to poUseCase.softDelete(id, currentUsername()))))

    @PostMapping("/{id}/restore")
    @RequirePermission("module.purchase.po.mgmt")
    @SecurityLevel(level = "L2", actionKey = "btn_restore_po")
    @AuditLog(module = "PURCHASE", action = "RESTORE_PO", riskLevel = "MEDIUM")
    fun restore(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(poUseCase.restore(id, currentUsername()))))

    // ═══════════ Event History (Audit Compliance) ═══════════

    /** Get full audit history for a PO — append-only event chain */
    @GetMapping("/{id}/history")
    @RequirePermission("module.purchase.po")
    fun getHistory(@PathVariable id: Long): ResponseEntity<Any> {
        val events = poUseCase.getHistory(id)
        return ResponseEntity.ok(ApiResponse.ok(events.map { ev ->
            mapOf(
                "id" to ev.id,
                "eventType" to ev.eventType,
                "eventSeq" to ev.eventSeq,
                "changes" to ev.changes,
                "note" to ev.note,
                "operator" to ev.operator,
                "createdAt" to ev.createdAt,
            )
        }))
    }

    // ═══════════ Exchange Rate ═══════════

    /**
     * V1: get_exchange_rate_api — auto-fetch USD/CNY rate from multiple sources.
     * Sources: fawazahmed0 CDN → Frankfurter → open.er-api → manual fallback.
     */
    @GetMapping("/exchange-rate")
    @RequirePermission("module.purchase.po.add")
    fun getExchangeRate(@RequestParam date: String): ResponseEntity<Any> {
        val poDate = java.time.LocalDate.parse(date)
        val today = java.time.LocalDate.now()

        if (poDate.isAfter(today)) {
            return ResponseEntity.ok(ApiResponse.ok(mapOf(
                "rate" to null,
                "source" to "manual_required",
                "need_manual" to true,
                "is_future" to true,
                "message" to "Future date — manual rate required",
            )))
        }

        // Try fetching from external APIs (same sources as V1)
        val dateStr = poDate.toString() // YYYY-MM-DD
        val sources = listOf(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json" to "fawazahmed0",
            "https://api.frankfurter.app/${dateStr}?from=USD&to=CNY" to "frankfurter",
            "https://open.er-api.com/v6/latest/USD" to "open.er-api",
            "https://api.exchangerate-api.com/v4/latest/USD" to "exchangerate-api",
        )

        for ((url, sourceName) in sources) {
            try {
                val conn = java.net.URI(url).toURL().openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"

                if (conn.responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    val rate = when (sourceName) {
                        "fawazahmed0" -> {
                            val m = Regex(""""cny"\s*:\s*([\d.]+)""").find(body)
                            m?.groupValues?.get(1)?.toDoubleOrNull()
                        }
                        "frankfurter" -> {
                            val m = Regex(""""CNY"\s*:\s*([\d.]+)""").find(body)
                            m?.groupValues?.get(1)?.toDoubleOrNull()
                        }
                        "open.er-api" -> {
                            val m = Regex(""""CNY"\s*:\s*([\d.]+)""").find(body)
                            m?.groupValues?.get(1)?.toDoubleOrNull()
                        }
                        "exchangerate-api" -> {
                            val m = Regex(""""CNY"\s*:\s*([\d.]+)""").find(body)
                            m?.groupValues?.get(1)?.toDoubleOrNull()
                        }
                        else -> null
                    }

                    if (rate != null && rate > 0) {
                        val rounded = Math.round(rate * 10000.0) / 10000.0
                        return ResponseEntity.ok(ApiResponse.ok(mapOf(
                            "rate" to rounded,
                            "source" to "api",
                            "source_name" to sourceName,
                            "need_manual" to false,
                            "is_future" to false,
                            "rate_date" to dateStr,
                        )))
                    }
                }
                conn.disconnect()
            } catch (_: Exception) {
                // Try next source
            }
        }

        // All sources failed
        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "rate" to null,
            "source" to "manual_required",
            "need_manual" to true,
            "is_future" to false,
            "message" to "Could not fetch rate automatically",
        )))
    }

    // ═══════════ Excel ═══════════

    /** V1: generate_prefilled_template_api — reads V1 template, fills metadata, locks cells, adds protection */
    @GetMapping("/template")
    @RequirePermission("module.purchase.po.add")
    fun downloadTemplate(
        @RequestParam supplierCode: String,
        @RequestParam date: String,
        @RequestParam(defaultValue = "USD") currency: String,
        @RequestParam(defaultValue = "0") exchangeRate: Double,
        @RequestParam(defaultValue = "false") floatEnabled: Boolean,
        @RequestParam(defaultValue = "0") floatThreshold: Double,
        @RequestParam(defaultValue = "false") depositEnabled: Boolean,
        @RequestParam(defaultValue = "0") depositRatio: Double,
    ): ResponseEntity<ByteArray> {
        val poDate = java.time.LocalDate.parse(date)
        val bytes = excelService.generateTemplate(
            supplierCode = supplierCode.uppercase(),
            poDate = poDate,
            currency = currency.uppercase(),
            exchangeRate = exchangeRate,
            floatEnabled = floatEnabled,
            floatThreshold = floatThreshold,
            depositEnabled = depositEnabled,
            depositRatio = depositRatio,
            username = currentUsername(),
        )
        val filename = "PO_Template_${supplierCode.uppercase()}_${date}.xlsx"
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(bytes)
    }

    /** V1: parse_po_excel_api — upload & validate Excel with SKU/supplier/date/currency checks */
    @PostMapping("/parse-excel")
    @RequirePermission("module.purchase.po.add")
    fun parseExcel(
        @RequestParam file: MultipartFile,
        @RequestParam supplierCode: String,
        @RequestParam date: String,
        @RequestParam(defaultValue = "USD") currency: String,
    ): ResponseEntity<Any> {
        val poDate = java.time.LocalDate.parse(date)
        val result = excelService.parseUploadedExcel(
            file.inputStream, supplierCode.uppercase(), poDate, currency.uppercase()
        )
        return ResponseEntity.ok(ApiResponse.ok(result))
    }

    /** V1: download_po_excel_api — export PO with formatted cells */
    @GetMapping("/{id}/export")
    @RequirePermission("module.purchase.po")
    fun exportExcel(@PathVariable id: Long): ResponseEntity<ByteArray> {
        val po = poUseCase.findOne(id)
        val items = poUseCase.getItems(id)
        val strategy = poUseCase.getStrategy(id)
        val bytes = excelService.exportPo(po, items, strategy)
        val filename = "${po.poNum}_current.xlsx"
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(bytes)
    }

    // ═══════════ Helpers ═══════════

    /**
     */
    private fun toListResponse(po: PurchaseOrder): PurchaseOrderResponse {
        val isDeleted = po.deletedAt != null
        val items = if (!isDeleted) poUseCase.getItems(po.id) else emptyList()
        val strategy = poUseCase.getStrategy(po.id)
        val exchangeRate = strategy?.exchangeRate?.toDouble() ?: 1.0
        val currency = strategy?.currency ?: "USD"

        var totalAmount = 0.0
        items.forEach { totalAmount += it.quantity * it.unitPrice.toDouble() }
        val totalRmb: Double
        val totalUsd: Double
        if (currency == "USD") {
            totalUsd = Math.round(totalAmount * 100000.0) / 100000.0
            totalRmb = Math.round(totalAmount * exchangeRate * 100000.0) / 100000.0
        } else {
            totalRmb = Math.round(totalAmount * 100000.0) / 100000.0
            totalUsd = if (exchangeRate > 0) Math.round(totalAmount / exchangeRate * 100000.0) / 100000.0 else 0.0
        }

        val shippingStatus = if (isDeleted) "deleted" else poUseCase.calculateShippingStatus(po.id)

        return PurchaseOrderResponse(
            id = po.id, poNum = po.poNum, supplierId = po.supplierId,
            supplierCode = po.supplierCode, poDate = po.poDate, status = po.status,
            itemCount = items.size,
            totalAmount = totalAmount, totalRmb = totalRmb, totalUsd = totalUsd,
            currency = currency, exchangeRate = exchangeRate,
            isDeleted = isDeleted, shippingStatus = shippingStatus,
            detailSeq = "L${String.format("%02d", po.detailSeq)}",
            strategySeq = strategy?.let { "V${String.format("%02d", it.strategySeq)}" },
            createdBy = po.createdBy, updatedBy = po.updatedBy, createdAt = po.createdAt, updatedAt = po.updatedAt,
        )
    }

    private fun toResponse(po: PurchaseOrder) = PurchaseOrderResponse(
        id = po.id, poNum = po.poNum, supplierId = po.supplierId,
        supplierCode = po.supplierCode, poDate = po.poDate, status = po.status,
        isDeleted = po.deletedAt != null,
        createdBy = po.createdBy, updatedBy = po.updatedBy, createdAt = po.createdAt, updatedAt = po.updatedAt,
    )

    private fun toDetailResponse(
        po: PurchaseOrder,
        items: List<PurchaseOrderItem>,
        strategy: PurchaseOrderStrategy?,
    ): PurchaseOrderResponse {
        val exchangeRate = strategy?.exchangeRate?.toDouble() ?: 1.0
        val currency = strategy?.currency ?: "USD"
        var totalAmount = 0.0
        items.forEach { totalAmount += it.quantity * it.unitPrice.toDouble() }
        val totalRmb: Double
        val totalUsd: Double
        if (currency == "USD") {
            totalUsd = Math.round(totalAmount * 100000.0) / 100000.0
            totalRmb = Math.round(totalAmount * exchangeRate * 100000.0) / 100000.0
        } else {
            totalRmb = Math.round(totalAmount * 100000.0) / 100000.0
            totalUsd = if (exchangeRate > 0) Math.round(totalAmount / exchangeRate * 100000.0) / 100000.0 else 0.0
        }

        return PurchaseOrderResponse(
            id = po.id, poNum = po.poNum, supplierId = po.supplierId,
            supplierCode = po.supplierCode, poDate = po.poDate, status = po.status,
            itemCount = items.size,
            totalAmount = totalAmount, totalRmb = totalRmb, totalUsd = totalUsd,
            currency = currency, exchangeRate = exchangeRate,
            isDeleted = po.deletedAt != null,
            shippingStatus = if (po.deletedAt != null) "deleted" else poUseCase.calculateShippingStatus(po.id),
            detailSeq = "L${String.format("%02d", po.detailSeq)}",
            strategySeq = strategy?.let { "V${String.format("%02d", it.strategySeq)}" },
            items = items.map { toItemResponse(it) },
            strategy = strategy?.let { toStrategyResponse(it) },
            createdBy = po.createdBy, updatedBy = po.updatedBy, createdAt = po.createdAt, updatedAt = po.updatedAt,
        )
    }

    private fun toItemResponse(item: PurchaseOrderItem) = PurchaseOrderItemResponse(
        id = item.id, sku = item.sku, quantity = item.quantity,
        unitPrice = Math.round(item.unitPrice.toDouble() * 100000.0) / 100000.0, currency = item.currency,
        exchangeRate = item.exchangeRate.toDouble(), note = item.note,
    )

    private fun toStrategyResponse(s: PurchaseOrderStrategy) = PurchaseOrderStrategyResponse(
        id = s.id, strategyDate = s.strategyDate, currency = s.currency,
        exchangeRate = s.exchangeRate.toDouble(), rateMode = s.rateMode,
        floatEnabled = s.floatEnabled, floatThreshold = s.floatThreshold.toDouble(),
        requireDeposit = s.requireDeposit, depositRatio = s.depositRatio.toDouble(),
        note = s.note,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
