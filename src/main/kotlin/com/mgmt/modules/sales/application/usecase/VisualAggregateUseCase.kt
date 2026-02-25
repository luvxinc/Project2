package com.mgmt.modules.sales.application.usecase

import com.mgmt.modules.sales.application.usecase.report.ReportDataRepository
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields

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
    private val log = LoggerFactory.getLogger(VisualAggregateUseCase::class.java)

    // V1 parity: views.py L20-27
    private val ACTION_LABELS = mapOf(
        SalesAction.NN to "Sales",
        SalesAction.CA to "Cancel",
        SalesAction.RE to "Return",
        SalesAction.CR to "Request",
        SalesAction.CC to "Case",
        SalesAction.PD to "Dispute"
    )

    private val STORE_MAP = mapOf("88" to "esparts88", "esplus" to "espartsplus")

    private fun getGrain(start: LocalDate, end: LocalDate): String {
        val days = ChronoUnit.DAYS.between(start, end)
        return when {
            days <= 35  -> "D"
            days <= 180 -> "W"
            else        -> "M"
        }
    }

    /**
     * Main entry point — returns structured chart data.
     */
    fun aggregate(
        startDate: LocalDate,
        endDate: LocalDate,
        stores: List<String>,
        chartType: String,
        mode: String,
        actions: List<String>,
        ships: List<String>,
        fees: List<String>
    ): Map<String, Any> {
        if (stores.isEmpty()) {
            return emptyResult()
        }

        val t0 = System.currentTimeMillis()

        // 1. Load transactions — filtered at DB level by date, then by store in-memory
        val dbStores = stores.map { STORE_MAP[it] ?: it }
        val allTx = reportData.findTransactionsByDateRange(startDate, endDate)
            .filter { it.seller in dbStores }

        if (allTx.isEmpty()) {
            log.info("Visual aggregate: no data for {} → {} stores={}", startDate, endDate, dbStores)
            return emptyResult()
        }

        // 2. Build SKU cost map (FIFO → COGS fallback)
        val skuCostMap = reportData.buildSkuCostMap()

        // 3. Enrich each transaction
        val grain = getGrain(startDate, endDate)
        val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val weekFields = WeekFields.ISO

        val rows = allTx.map { tx -> enrichRow(tx, grain, fmt, weekFields, skuCostMap) }

        log.info("Visual aggregate: {} rows enriched in {}ms (grain={}, type={}, mode={})",
            rows.size, System.currentTimeMillis() - t0, grain, chartType, mode)

        // 4. Branch: PIE
        if (chartType == "pie") {
            return calculatePieData(rows)
        }

        // 5. Branch: LINE
        return calculateLineData(rows, allDateKeys = rows.map { it.dateKey }.distinct().sorted(),
            mode = mode, actions = actions, ships = ships, fees = fees)
    }

    // ═══════════════════════════════════════════════
    // Enrichment
    // ═══════════════════════════════════════════════

    private fun enrichRow(
        tx: CleanedTransaction,
        grain: String,
        fmt: DateTimeFormatter,
        weekFields: WeekFields,
        skuCostMap: Map<String, BigDecimal>
    ): EnrichedRow {
        val ld = tx.orderDate.atZone(ZoneOffset.UTC).toLocalDate()
        val dateKey = when (grain) {
            "D" -> ld.format(fmt)
            "W" -> ld.with(weekFields.dayOfWeek(), 1).format(fmt)
            else -> "${ld.year}-${ld.monthValue.toString().padStart(2, '0')}-01"
        }

        val actionLabel = ACTION_LABELS[tx.action] ?: "Sales"

        // Shipping labels (abs)
        val shipReg = tx.labelRegular.abs()
        val shipUnd = tx.labelUnderpay.abs()
        val shipOvr = tx.labelOverpay.abs()
        val shipRet = tx.labelReturn.abs()

        // Platform fee = sum(FVF + regulatory + intl).abs()
        val platFee = (tx.fvfFeeFixed + tx.fvfFeeVariable + tx.regulatoryFee + tx.intlFee).abs()

        // COGS: sku1-10 × qty × unit_cost
        val baseQty = tx.quantity.toBigDecimal()
        var totalCogs = BigDecimal.ZERO
        for ((sku, perQty) in skuSlots(tx)) {
            if (sku.isNullOrBlank()) continue
            val unitCost = skuCostMap[sku.trim().uppercase()] ?: BigDecimal.ZERO
            totalCogs += unitCost * (perQty ?: 0).toBigDecimal() * baseQty
        }

        return EnrichedRow(
            dateKey = dateKey, actionLabel = actionLabel,
            amount = tx.saleAmount, qty = tx.quantity,
            orderNum = tx.orderNumber ?: "",
            shipRegular = shipReg, shipUnder = shipUnd, shipOver = shipOvr, shipReturn = shipRet,
            platformFee = platFee, cogs = totalCogs.abs()
        )
    }

    private fun skuSlots(tx: CleanedTransaction): List<Pair<String?, Int?>> = listOf(
        tx.sku1 to tx.quantity1, tx.sku2 to tx.quantity2, tx.sku3 to tx.quantity3,
        tx.sku4 to tx.quantity4, tx.sku5 to tx.quantity5, tx.sku6 to tx.quantity6,
        tx.sku7 to tx.quantity7, tx.sku8 to tx.quantity8, tx.sku9 to tx.quantity9,
        tx.sku10 to tx.quantity10
    )

    // ═══════════════════════════════════════════════
    // Line Chart Aggregation
    // ═══════════════════════════════════════════════

    private fun calculateLineData(
        rows: List<EnrichedRow>,
        allDateKeys: List<String>,
        mode: String,
        actions: List<String>,
        ships: List<String>,
        fees: List<String>
    ): Map<String, Any> {
        val seriesList = mutableListOf<Map<String, Any>>()
        val isPct = mode == "Percentage"
        val isQty = mode == "Quantity"
        val isOrd = mode == "Order"

        // Pre-compute: group rows by dateKey ONCE
        val rowsByDate = rows.groupBy { it.dateKey }

        // Percentage base: total Sales Amount per date
        val salesByDate = if (isPct) {
            rows.filter { it.actionLabel == "Sales" }
                .groupBy { it.dateKey }
                .mapValues { (_, g) ->
                    g.sumOf { it.amount }.abs().let { if (it == BigDecimal.ZERO) BigDecimal.ONE else it }
                }
        } else emptyMap()

        // Action series
        val rowsByAction = rows.groupBy { it.actionLabel }
        for (actionFilter in actions) {
            val actionRows = rowsByAction[actionFilter] ?: emptyList()
            val grouped = actionRows.groupBy { it.dateKey }
            val data = allDateKeys.map { dk ->
                val group = grouped[dk] ?: emptyList()
                val raw = when {
                    isQty -> group.sumOf { it.qty }.toBigDecimal()
                    isOrd -> group.map { it.orderNum }.distinct().count().toBigDecimal()
                    else  -> group.sumOf { it.amount }
                }
                toDisplayValue(raw, isPct, salesByDate[dk])
            }
            seriesList.add(mapOf("name" to actionFilter, "data" to data))
        }

        // Ship series (only for Amount/Percentage modes)
        if (!isQty && !isOrd) {
            val SHIP_LABELS = mapOf(
                "shipRegular" to "Ship Regular", "shipFine" to "Ship Fine",
                "shipOver" to "Ship Overpay", "shipReturn" to "Ship Return"
            )
            for (shipFilter in ships) {
                val data = allDateKeys.map { dk ->
                    val group = rowsByDate[dk] ?: emptyList()
                    val raw = when (shipFilter) {
                        "shipRegular" -> group.sumOf { it.shipRegular }
                        "shipFine"    -> group.sumOf { it.shipUnder }
                        "shipOver"    -> group.sumOf { it.shipOver }
                        "shipReturn"  -> group.sumOf { it.shipReturn }
                        else -> BigDecimal.ZERO
                    }
                    toDisplayValue(raw, isPct, salesByDate[dk])
                }
                seriesList.add(mapOf("name" to (SHIP_LABELS[shipFilter] ?: shipFilter), "data" to data))
            }
        }

        // Fee series (only for Amount/Percentage modes)
        if (!isQty && !isOrd) {
            val FEE_LABELS = mapOf("cogs" to "COGS", "platformFee" to "Platform Fee")
            for (feeFilter in fees) {
                val data = allDateKeys.map { dk ->
                    val group = rowsByDate[dk] ?: emptyList()
                    val raw = when (feeFilter) {
                        "cogs"        -> group.sumOf { it.cogs }
                        "platformFee" -> group.sumOf { it.platformFee }
                        else -> BigDecimal.ZERO
                    }
                    toDisplayValue(raw, isPct, salesByDate[dk])
                }
                seriesList.add(mapOf("name" to (FEE_LABELS[feeFilter] ?: feeFilter), "data" to data))
            }
        }

        return mapOf("categories" to allDateKeys, "series" to seriesList)
    }

    private fun toDisplayValue(raw: BigDecimal, isPct: Boolean, salesBase: BigDecimal?): Double {
        return if (isPct) {
            val base = salesBase ?: BigDecimal.ONE
            raw.abs().multiply(BigDecimal(100)).divide(base, 1, RoundingMode.HALF_UP).toDouble()
        } else {
            raw.setScale(2, RoundingMode.HALF_UP).toDouble()
        }
    }

    // ═══════════════════════════════════════════════
    // Pie Chart Aggregation — zero reflection
    // ═══════════════════════════════════════════════

    private fun calculatePieData(rows: List<EnrichedRow>): Map<String, Any> {
        val vSales = rows.filter { it.actionLabel == "Sales" }.sumOf { it.amount }

        val retActions = listOf("Cancel", "Return", "Request", "Case", "Dispute")
        val retByAction = retActions.associateWith { act ->
            rows.filter { it.actionLabel == act }.sumOf { it.amount }.abs()
        }
        val vRetMag = retByAction.values.fold(BigDecimal.ZERO) { acc, v -> acc + v }

        // V1 parity: |Regular| + |Fine| - |Overpay| + |ReturnLabel|
        val vShipReg = rows.sumOf { it.shipRegular }
        val vShipFine = rows.sumOf { it.shipUnder }
        val vShipOver = rows.sumOf { it.shipOver }
        val vShipRet = rows.sumOf { it.shipReturn }
        val vShipVal = vShipReg + vShipFine - vShipOver + vShipRet

        val vCogs = rows.sumOf { it.cogs }
        val vFees = rows.sumOf { it.platformFee }

        // V1 parity: net = sales - returns - shipping - cogs - fees
        val vNetSales = vSales - vRetMag - vShipVal - vCogs - vFees
        val denom = if (vSales != BigDecimal.ZERO) vSales else BigDecimal.ONE

        fun mkSlice(name: String, value: BigDecimal, details: Map<String, Any>? = null): Map<String, Any> =
            mapOf(
                "name" to name,
                "value" to value.setScale(2, RoundingMode.HALF_UP).toDouble(),
                "percentage" to value.multiply(BigDecimal(100)).divide(denom, 1, RoundingMode.HALF_UP).toDouble(),
                "details" to (details ?: emptyMap<String, Any>())
            )

        val retDetails = retByAction.filter { it.value > BigDecimal("0.01") }
            .mapValues { it.value.setScale(2, RoundingMode.HALF_UP).toDouble() }

        val shipDetails = mapOf(
            "Regular" to vShipReg.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Fine" to vShipFine.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Overpay" to vShipOver.setScale(2, RoundingMode.HALF_UP).toDouble(),
            "Return" to vShipRet.setScale(2, RoundingMode.HALF_UP).toDouble()
        )

        return mapOf("pie_data" to listOf(
            mkSlice("Net Sales", vNetSales),
            mkSlice("Net Returns", vRetMag, retDetails),
            mkSlice("Shipping", vShipVal, shipDetails),
            mkSlice("COGS", vCogs),
            mkSlice("Platform Fee", vFees)
        ))
    }

    private fun emptyResult() = mapOf(
        "categories" to emptyList<String>(),
        "series" to emptyList<Any>(),
        "pie_data" to emptyList<Any>()
    )
}

/**
 * Top-level data class for enriched transaction rows.
 * Extracted from local scope to enable type-safe pie aggregation.
 */
data class EnrichedRow(
    val dateKey: String,
    val actionLabel: String,
    val amount: BigDecimal,
    val qty: Int,
    val orderNum: String,
    val shipRegular: BigDecimal,
    val shipUnder: BigDecimal,
    val shipOver: BigDecimal,
    val shipReturn: BigDecimal,
    val platformFee: BigDecimal,
    val cogs: BigDecimal
)
