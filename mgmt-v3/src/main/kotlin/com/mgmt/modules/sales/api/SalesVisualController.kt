package com.mgmt.modules.sales.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.sales.application.usecase.VisualAggregateUseCase
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * SalesVisualController — V1 parity: apps/visuals/views.py get_chart_data()
 *
 * Single endpoint that returns line or pie chart data.
 * V3 security: @RequirePermission + @AuditLog (V1 used session unlock).
 */
@RestController
@RequestMapping("/sales/visuals")
class SalesVisualController(
    private val aggregator: VisualAggregateUseCase
) {

    /**
     * GET /sales/visuals/chart-data
     *
     * V1 parity: GET /visuals/data/
     *
     * Query params:
     *   start   — YYYY-MM-DD
     *   end     — YYYY-MM-DD
     *   stores  — comma-separated: "88,esplus"
     *   type    — "line" | "pie"
     *   mode    — "Amount" | "Quantity" | "Order" | "Percentage"
     *   actions — comma-separated: "Sales,Cancel,Return,..."
     *   ships   — comma-separated: "shipRegular,shipFine,..."
     *   fees    — comma-separated: "cogs,platformFee"
     */
    @GetMapping("/chart-data")
    @RequirePermission("module.sales.visuals.view")
    @AuditLog(module = "SALES", action = "VIEW_CHART_DATA")
    fun getChartData(
        @RequestParam start: String,
        @RequestParam end: String,
        @RequestParam(defaultValue = "") stores: String,
        @RequestParam(defaultValue = "line") type: String,
        @RequestParam(defaultValue = "Amount") mode: String,
        @RequestParam(defaultValue = "") actions: String,
        @RequestParam(defaultValue = "") ships: String,
        @RequestParam(defaultValue = "") fees: String
    ): ResponseEntity<Map<String, Any>> {
        val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val startDate = LocalDate.parse(start, fmt)
        val endDate = LocalDate.parse(end, fmt)

        val storeList = stores.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val actionList = actions.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val shipList = ships.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val feeList = fees.split(",").map { it.trim() }.filter { it.isNotEmpty() }

        val result = aggregator.aggregate(
            startDate = startDate,
            endDate = endDate,
            stores = storeList,
            chartType = type,
            mode = mode,
            actions = actionList,
            ships = shipList,
            fees = feeList
        )

        return ResponseEntity.ok(result)
    }
}
