package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.usecase.report.ReportDataRepository
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields
import kotlin.math.abs

/**
 * VisualAggregateUseCase — V1 parity: core/services/visual_service.py
 *
 * Loads cleaned_transactions, aggregates by time grain + action,
 * produces line chart series and pie chart breakdown data.
 *
 * V1 Action mapping: NN→Sales, CA→Cancel, RE→Return, CR→Request, CC→Case, PD→Dispute
 * V1 Time grain:     ≤35 days → Day, ≤180 days → Week, >180 days → Month
 * V1 Data modes:     Amount($), Quantity(units), Order(count), Percentage(%)
 */
@Service
class VisualAggregateUseCase(
    private val reportData: ReportDataRepository
) {

    // V1 parity: views.py L20-27
    private val ACTION_LABELS = mapOf(
        SalesAction.NN to "Sales",
        SalesAction.CA to "Cancel",
        SalesAction.RE to "Return",
        SalesAction.CR to "Request",
        SalesAction.CC to "Case",
        SalesAction.PD to "Dispute"
    )

    // V1 parity: views.py L29-34 (ship filter Chinese → column key)
    private val SHIP_FILTERS = mapOf(
        "shipRegular" to "Total_ShipRegular",
        "shipFine"    to "Total_ShipUnder",
        "shipOver"    to "Total_ShipOver",
        "shipReturn"  to "Total_ShipReturn"
    )

    // V1 parity: views.py L35-38
    private val FEE_FILTERS = mapOf(
        "cogs"        to "Total_COGS",
        "platformFee" to "Total_PlatformFee"
    )

    // V1 parity: visual_service.py L48-56
    private fun getGrain(start: LocalDate, end: LocalDate): String {
        val days = ChronoUnit.DAYS.between(start, end)
        return when {
            days <= 35  -> "D"
            days <= 180 -> "W"
            else        -> "M"
        }
    }

    // V1 parity: visual_service.py L40-43
    private val STORE_MAP = mapOf("88" to "esparts88", "esplus" to "espartsplus")

    /**
     * Main entry point — returns structured chart data.
     */
    fun aggregate(
        startDate: LocalDate,
        endDate: LocalDate,
        stores: List<String>,
        chartType: String,       // "line" | "pie"
        mode: String,            // "Amount" | "Quantity" | "Order" | "Percentage"
        actions: List<String>,   // filter keys: "Sales","Cancel",...
        ships: List<String>,     // filter keys: "shipRegular","shipFine",...
        fees: List<String>       // filter keys: "cogs","platformFee"
    ): Map<String, Any> {
        if (stores.isEmpty()) {
            return mapOf("categories" to emptyList<String>(), "series" to emptyList<Any>(), "pie_data" to emptyList<Any>())
        }

        // 1. Load transactions
        val dbStores = stores.map { STORE_MAP[it] ?: it }
        val allTx = reportData.findTransactionsByDateRange(startDate, endDate)
            .filter { it.seller in dbStores }

        if (allTx.isEmpty()) {
            return mapOf("categories" to emptyList<String>(), "series" to emptyList<Any>(), "pie_data" to emptyList<Any>())
        }

        // 2. Build SKU cost map (FIFO first, COGS fallback) — reuse from reports
        val skuCostMap = reportData.buildSkuCostMap()

        // 3. Enrich each transaction with calculated fields
        data class EnrichedRow(
            val tx: CleanedTransaction,
            val dateKey: String,       // aggregation key
            val actionLabel: String,   // "Sales", "Cancel", etc.
            val amount: BigDecimal,    // sale_amount
            val qty: Int,              // quantity
            val orderNum: String,      // for order count
            val shipRegular: BigDecimal,
            val shipUnder: BigDecimal,
            val shipOver: BigDecimal,
            val shipReturn: BigDecimal,
            val platformFee: BigDecimal,
            val cogs: BigDecimal
        )

        val grain = getGrain(startDate, endDate)
        val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val weekFields = WeekFields.ISO

        val rows = allTx.map { tx ->
            val ld = tx.orderDate.atZone(ZoneOffset.UTC).toLocalDate()
            val dateKey = when (grain) {
                "D" -> ld.format(fmt)
                "W" -> {
                    // Week start (Monday)
                    val weekStart = ld.with(weekFields.dayOfWeek(), 1)
                    weekStart.format(fmt)
                }
                else -> "${ld.year}-${ld.monthValue.toString().padStart(2, '0')}-01"
            }

            val actionLabel = ACTION_LABELS[tx.action] ?: "Sales"

            // V1 parity: shipping labels — take abs() for display
            val shipReg = tx.labelRegular.abs()
            val shipUnd = tx.labelUnderpay.abs()
            val shipOvr = tx.labelOverpay.abs()
            val shipRet = tx.labelReturn.abs()

            // V1 parity: platform fee = sum of FVF + regulatory + intl (abs)
            val platFee = (tx.fvfFeeFixed + tx.fvfFeeVariable + tx.regulatoryFee + tx.intlFee).abs()

            // V1 parity: COGS vectorized calculation (sku1-10 × qty × unit_cost)
            val baseQty = tx.quantity.toBigDecimal()
            var totalCogs = BigDecimal.ZERO
            val skuSlots = listOf(
                tx.sku1 to tx.quantity1, tx.sku2 to tx.quantity2, tx.sku3 to tx.quantity3,
                tx.sku4 to tx.quantity4, tx.sku5 to tx.quantity5, tx.sku6 to tx.quantity6,
                tx.sku7 to tx.quantity7, tx.sku8 to tx.quantity8, tx.sku9 to tx.quantity9,
                tx.sku10 to tx.quantity10
            )
            for ((sku, perQty) in skuSlots) {
                if (sku.isNullOrBlank()) continue
                val unitCost = skuCostMap[sku.trim().uppercase()] ?: BigDecimal.ZERO
                totalCogs += unitCost * (perQty ?: 0).toBigDecimal() * baseQty
            }

            EnrichedRow(
                tx = tx, dateKey = dateKey, actionLabel = actionLabel,
                amount = tx.saleAmount, qty = tx.quantity,
                orderNum = tx.orderNumber ?: "",
                shipRegular = shipReg, shipUnder = shipUnd, shipOver = shipOvr, shipReturn = shipRet,
                platformFee = platFee, cogs = totalCogs.abs()
            )
        }

        // 4. Branch: PIE
        if (chartType == "pie") {
            return calculatePieData(rows)
        }

        // 5. Branch: LINE — Aggregate by [dateKey, action]
        val allDateKeys = rows.map { it.dateKey }.distinct().sorted()

        // Build series based on user selections
        val seriesList = mutableListOf<Map<String, Any>>()
        val isPct = mode == "Percentage"
        val isQty = mode == "Quantity"
        val isOrd = mode == "Order"

        // Percentage base: total Sales Amount per date
        val salesByDate = if (isPct) {
            rows.filter { it.actionLabel == "Sales" }
                .groupBy { it.dateKey }
                .mapValues { (_, g) -> g.sumOf { it.amount }.abs().let { if (it == BigDecimal.ZERO) BigDecimal.ONE else it } }
        } else emptyMap()

        // Action series
        for (actionFilter in actions) {
            val grouped = rows.filter { it.actionLabel == actionFilter }.groupBy { it.dateKey }
            val data = allDateKeys.map { dk ->
                val group = grouped[dk] ?: emptyList()
                val raw = when {
                    isQty -> group.sumOf { it.qty }.toBigDecimal()
                    isOrd -> group.map { it.orderNum }.distinct().count().toBigDecimal()
                    else  -> group.sumOf { it.amount }
                }
                if (isPct) {
                    val base = salesByDate[dk] ?: BigDecimal.ONE
                    raw.abs().multiply(BigDecimal(100)).divide(base, 1, RoundingMode.HALF_UP).toDouble()
                } else {
                    raw.setScale(2, RoundingMode.HALF_UP).toDouble()
                }
            }
            seriesList.add(mapOf("name" to actionFilter, "data" to data))
        }

        // Ship series (only for Amount/Percentage modes)
        if (!isQty && !isOrd) {
            for (shipFilter in ships) {
                val grouped = rows.groupBy { it.dateKey }
                val data = allDateKeys.map { dk ->
                    val group = grouped[dk] ?: emptyList()
                    val raw = when (shipFilter) {
                        "shipRegular" -> group.sumOf { it.shipRegular }
                        "shipFine"    -> group.sumOf { it.shipUnder }
                        "shipOver"    -> group.sumOf { it.shipOver }
                        "shipReturn"  -> group.sumOf { it.shipReturn }
                        else -> BigDecimal.ZERO
                    }
                    if (isPct) {
                        val base = salesByDate[dk] ?: BigDecimal.ONE
                        raw.abs().multiply(BigDecimal(100)).divide(base, 1, RoundingMode.HALF_UP).toDouble()
                    } else {
                        raw.setScale(2, RoundingMode.HALF_UP).toDouble()
                    }
                }
                val label = when (shipFilter) {
                    "shipRegular" -> "Ship Regular"
                    "shipFine"    -> "Ship Fine"
                    "shipOver"    -> "Ship Overpay"
                    "shipReturn"  -> "Ship Return"
                    else -> shipFilter
                }
                seriesList.add(mapOf("name" to label, "data" to data))
            }
        }

        // Fee series (only for Amount/Percentage modes)
        if (!isQty && !isOrd) {
            for (feeFilter in fees) {
                val grouped = rows.groupBy { it.dateKey }
                val data = allDateKeys.map { dk ->
                    val group = grouped[dk] ?: emptyList()
                    val raw = when (feeFilter) {
                        "cogs"        -> group.sumOf { it.cogs }
                        "platformFee" -> group.sumOf { it.platformFee }
                        else -> BigDecimal.ZERO
                    }
                    if (isPct) {
                        val base = salesByDate[dk] ?: BigDecimal.ONE
                        raw.abs().multiply(BigDecimal(100)).divide(base, 1, RoundingMode.HALF_UP).toDouble()
                    } else {
                        raw.setScale(2, RoundingMode.HALF_UP).toDouble()
                    }
                }
                val label = when (feeFilter) {
                    "cogs"        -> "COGS"
                    "platformFee" -> "Platform Fee"
                    else -> feeFilter
                }
                seriesList.add(mapOf("name" to label, "data" to data))
            }
        }

        return mapOf(
            "categories" to allDateKeys,
            "series" to seriesList
        )
    }

    /**
     * V1 parity: views.py calculate_pie_data() L196-308
     * 5 slices: Net Sales, Net Returns, Shipping, COGS, Platform Fee
     */
    private fun calculatePieData(rows: List<Any>): Map<String, Any> {
        @Suppress("UNCHECKED_CAST")
        val typedRows = rows as List<*>

        // Use reflection-free approach: re-cast
        data class PieRow(
            val actionLabel: String, val amount: BigDecimal,
            val shipRegular: BigDecimal, val shipUnder: BigDecimal,
            val shipOver: BigDecimal, val shipReturn: BigDecimal,
            val platformFee: BigDecimal, val cogs: BigDecimal
        )

        val pieRows = typedRows.mapNotNull { r ->
            // We know the actual type from aggregate()
            val f = r!!::class.java
            try {
                PieRow(
                    actionLabel = f.getDeclaredField("actionLabel").apply { isAccessible = true }.get(r) as String,
                    amount = f.getDeclaredField("amount").apply { isAccessible = true }.get(r) as BigDecimal,
                    shipRegular = f.getDeclaredField("shipRegular").apply { isAccessible = true }.get(r) as BigDecimal,
                    shipUnder = f.getDeclaredField("shipUnder").apply { isAccessible = true }.get(r) as BigDecimal,
                    shipOver = f.getDeclaredField("shipOver").apply { isAccessible = true }.get(r) as BigDecimal,
                    shipReturn = f.getDeclaredField("shipReturn").apply { isAccessible = true }.get(r) as BigDecimal,
                    platformFee = f.getDeclaredField("platformFee").apply { isAccessible = true }.get(r) as BigDecimal,
                    cogs = f.getDeclaredField("cogs").apply { isAccessible = true }.get(r) as BigDecimal
                )
            } catch (_: Exception) { null }
        }

        val vSales = pieRows.filter { it.actionLabel == "Sales" }.sumOf { it.amount }
        val retActions = listOf("Cancel", "Return", "Request", "Case", "Dispute")
        val retByAction = retActions.associateWith { act ->
            pieRows.filter { it.actionLabel == act }.sumOf { it.amount }.abs()
        }
        val vRetMag = retByAction.values.fold(BigDecimal.ZERO) { acc, v -> acc + v }

        // V1 parity: |Regular| + |Fine| - |Overpay| + |ReturnLabel|
        val vShipReg = pieRows.sumOf { it.shipRegular }
        val vShipFine = pieRows.sumOf { it.shipUnder }
        val vShipOver = pieRows.sumOf { it.shipOver }
        val vShipRet = pieRows.sumOf { it.shipReturn }
        val vShipVal = vShipReg + vShipFine - vShipOver + vShipRet

        val vCogs = pieRows.sumOf { it.cogs }
        val vFees = pieRows.sumOf { it.platformFee }

        // V1 parity: v_net_sales = v_sales - v_ret_mag - v_ship_val - v_cogs_val - v_fees_val
        val vNetSales = vSales - vRetMag - vShipVal - vCogs - vFees

        val denom = if (vSales != BigDecimal.ZERO) vSales else BigDecimal.ONE

        fun mkSlice(name: String, value: BigDecimal, details: Map<String, Any>? = null): Map<String, Any> {
            return mapOf(
                "name" to name,
                "value" to value.setScale(2, RoundingMode.HALF_UP).toDouble(),
                "percentage" to value.multiply(BigDecimal(100)).divide(denom, 1, RoundingMode.HALF_UP).toDouble(),
                "details" to (details ?: emptyMap<String, Any>())
            )
        }

        val pieData = mutableListOf<Map<String, Any>>()

        // 1. Net Sales
        pieData.add(mkSlice("Net Sales", vNetSales))

        // 2. Net Returns (with details)
        val retDetails = retByAction.filter { it.value > BigDecimal("0.01") }
            .mapValues { it.value.setScale(2, RoundingMode.HALF_UP).toDouble() }
        pieData.add(mkSlice("Net Returns", vRetMag, retDetails))

        // 3. Shipping
        val shipDetails = mapOf(
            "Regular" to vShipReg.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Fine" to vShipFine.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Overpay" to vShipOver.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Return" to vShipRet.setScale(2, RoundingMode.HALF_UP).toDouble()
        )
        pieData.add(mkSlice("Shipping", vShipVal, shipDetails))

        // 4. COGS
        pieData.add(mkSlice("COGS", vCogs))

        // 5. Platform Fee
        pieData.add(mkSlice("Platform Fee", vFees))

        return mapOf("pie_data" to pieData)
    }
}
