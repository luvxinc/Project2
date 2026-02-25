package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import kotlin.math.abs
import kotlin.math.max

/**
 * PredictionAnalyzer — 企业级销量预测引擎。
 *
 * V1 精确对照: backend/core/services/prediction.py (405行)
 *
 * V1 分层策略:
 *   - 新品 (<3月数据): 平均销量 × 保守因子
 *   - 间歇性 (覆盖率<50%): Croston 方法
 *   - 低销量稳定 (月均≤50): 加权移动平均
 *   - 高销量稳定 (月均>50): 趋势 + 季节性
 *
 * V1 输出: Demand_Forecast_Detail_{file_suffix}.csv
 *        + Estimated_Monthly_SKU.csv (供 OrderingService 使用)
 *
 * V1 输出列:
 *   SKU, 预测值, 预测方法, 置信度, SKU类型, 月均销量,
 *   销售覆盖率, 波动系数, 近3月均值, 前3月均值, 趋势
 */
@Service
class PredictionAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // V1 parity: prediction.py L36-37
    private val recentWeight = 0.6
    private val olderWeight = 0.4

    // V1 parity: prediction.py L39-53 — 季节性月份权重
    private val seasonalFactors = mapOf(
        1 to 0.85, 2 to 0.80, 3 to 0.95, 4 to 1.00, 5 to 1.00, 6 to 0.95,
        7 to 0.90, 8 to 0.90, 9 to 1.05, 10 to 1.10, 11 to 1.20, 12 to 1.15,
    )

    /** 运行预测，返回预测结果（也被 OrderingAnalyzer 使用） */
    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 启动企业级销量预测引擎...")

        // V1 parity: prediction.py _aggregate_monthly_sales() — 加载24个月数据
        val monthlyMatrix = aggregateMonthlySales(config)
        if (monthlyMatrix.isEmpty()) {
            log.warn("⚠️ 预测数据为空")
            return AnalyzerResult("Prediction", false, error = "无交易数据")
        }

        val totalMonths = monthlyMatrix.values.first().size
        log.info("📊 数据范围: {} 个月, {} 个 SKU", totalMonths, monthlyMatrix.size)

        val results = mutableListOf<PredictionRow>()

        for ((sku, series) in monthlyMatrix) {
            val (category, stats) = classifySku(series, totalMonths)
            val (forecast, method) = when (category) {
                "new" -> forecastNewProduct(series)
                "intermittent" -> forecastIntermittent(series)
                "low_stable" -> forecastLowStable(series)
                else -> forecastHighStable(series)
            }
            val confidence = evaluateAccuracy(series)
            val values = series.toDoubleArray()
            val recent3 = if (values.size >= 3) values.takeLast(3).average() else values.average()
            val older3 = if (values.size >= 6) values.slice(values.size - 6 until values.size - 3).average()
                         else values.take(max(1, values.size - 3)).average()

            val trend = when {
                recent3 > older3 * 1.1 -> "📈 上升"
                recent3 < older3 * 0.9 -> "📉 下降"
                else -> "➡️ 稳定"
            }

            results.add(PredictionRow(
                sku = sku, forecast = forecast, method = method,
                confidence = confidence, category = category,
                avgMonthly = stats.avgMonthly, coverage = stats.coverage,
                cv = stats.cv, recent3 = recent3, older3 = older3, trend = trend,
            ))
        }

        results.sortByDescending { it.forecast }

        val zeroCount = results.count { it.forecast == 0.0 }
        val avgConfidence = if (results.isNotEmpty()) results.map { it.confidence }.average() else 0.0

        // V1 parity: 保存详细报告
        val headers = listOf("SKU", "预测值", "预测方法", "置信度", "SKU类型",
            "月均销量", "销售覆盖率", "波动系数", "近3月均值", "前3月均值", "趋势")
        val rows = results.map { r ->
            listOf<Any?>(r.sku, r.forecast.r(), r.method, r.confidence.r(),
                r.category, r.avgMonthly.r(), "%.0f%%".format(r.coverage * 100),
                r.cv.r(), r.recent3.r(), r.older3.r(), r.trend)
        }

        val footer = listOf(
            "📘 企业级预测引擎说明:",
            "1. 分层策略: 新品/间歇性/低销量稳定/高销量稳定",
            "2. 算法选择: 根据SKU特性自动选择最适合的方法",
            "3. 季节性: 内置电商月度季节因子",
            "4. 预测为0的SKU: $zeroCount 个",
            "5. 平均置信度: ${"%.1f".format(avgConfidence)}%",
            "6. 生成时间: ${LocalDate.now()}",
        )

        val filenames = mutableListOf<String>()
        val detailFilename = "Demand_Forecast_Detail_${config.fileSuffix}.csv"
        csvWriter.saveCsv(headers, rows, detailFilename, footer)
        filenames.add(detailFilename)

        // V1 parity: prediction.py L394-399 — 生成兼容格式 (供 OrderingService 使用)
        val compatHeaders = listOf("SKU", "BestForecast", "Best_Algo")
        val compatRows = results.map { listOf<Any?>(it.sku, it.forecast.r(), it.method) }
        val compatFilename = "Estimated_Monthly_SKU.csv"
        csvWriter.saveCsv(compatHeaders, compatRows, compatFilename, footer)
        filenames.add(compatFilename)

        log.info("✅ 预测完成: {} 个 SKU, 平均置信度 {:.1f}%", results.size, avgConfidence)
        return AnalyzerResult("Prediction", true, filenames.size, filenames)
    }

    /**
     * 获取预测数据（OrderingAnalyzer 调用）。
     */
    fun getPredictionData(config: ReportConfig): Map<String, Double> {
        val matrix = aggregateMonthlySales(config)
        if (matrix.isEmpty()) return emptyMap()

        val totalMonths = matrix.values.first().size
        return matrix.map { (sku, series) ->
            val (cat, _) = classifySku(series, totalMonths)
            val (forecast, _) = when (cat) {
                "new" -> forecastNewProduct(series)
                "intermittent" -> forecastIntermittent(series)
                "low_stable" -> forecastLowStable(series)
                else -> forecastHighStable(series)
            }
            sku to forecast
        }.toMap()
    }

    // ═══════════════════════════════════════════════════════
    // V1 parity: prediction.py _aggregate_monthly_sales() L71-131
    // ═══════════════════════════════════════════════════════

    private fun aggregateMonthlySales(config: ReportConfig): Map<String, List<Double>> {
        val endMonth = YearMonth.from(config.endDate).minusMonths(1)
        val startMonth = endMonth.minusMonths(23)
        val startDate = startMonth.atDay(1)
        val endDate = endMonth.atEndOfMonth()

        log.info("📥 正在加载训练数据: {} -> {}", startDate, endDate)
        val transactions = reportData.findTransactionsByDateRange(startDate, endDate)
        if (transactions.isEmpty()) return emptyMap()

        // Build month keys
        val months = (0L..23L).map { startMonth.plusMonths(it).toString() }
        val monthlyData = mutableMapOf<String, MutableMap<String, Int>>()

        for (tx in transactions) {
            val action = tx.action
            val lossRate = getLossRate(action, config)
            if (lossRate >= 1.0) continue
            val effectiveRatio = 1.0 - lossRate

            val monthKey = YearMonth.from(tx.orderDate.atZone(ZoneOffset.UTC)).toString()
            val quantity = tx.quantity
            if (quantity <= 0) continue

            val slots = tx.extractSkuSlots()
            for (slot in slots) {
                val netQty = (quantity * slot.perQty * effectiveRatio).toInt()
                val skuMonths = monthlyData.getOrPut(slot.sku) { mutableMapOf() }
                skuMonths[monthKey] = (skuMonths[monthKey] ?: 0) + netQty

                // V1 parity: prediction.py L124-126 — special SKU
                if (slot.sku in SpecialSkuRules.SOURCE_SKUS) {
                    val specialQty = (quantity * 2 * effectiveRatio).toInt()
                    val targetMonths = monthlyData.getOrPut(SpecialSkuRules.TARGET_SKU) { mutableMapOf() }
                    targetMonths[monthKey] = (targetMonths[monthKey] ?: 0) + specialQty
                }
            }
        }

        // Convert to aligned series
        return monthlyData.mapValues { (_, m) ->
            months.map { (m[it] ?: 0).toDouble() }
        }
    }

    private fun getLossRate(action: SalesAction, config: ReportConfig): Double {
        return when (action) {
            SalesAction.CA -> 1.0
            SalesAction.RE -> config.lrReturn
            SalesAction.CC -> config.lrCase
            SalesAction.CR -> config.lrRequest
            SalesAction.PD -> config.lrDispute
            SalesAction.NN -> 0.0
        }
    }

    // ═══════════════════════════════════════════════════════
    // Classification + Forecasting — V1 parity: prediction.py L133-306
    // ═══════════════════════════════════════════════════════

    private data class SkuStats(val avgMonthly: Double, val coverage: Double, val cv: Double)

    private fun classifySku(series: List<Double>, totalMonths: Int): Pair<String, SkuStats> {
        val monthsWithSales = series.count { it > 0 }
        val coverage = if (totalMonths > 0) monthsWithSales.toDouble() / totalMonths else 0.0
        val avg = series.average()
        val std = series.std()
        val cv = if (avg > 0) std / avg else 0.0

        val stats = SkuStats(avg.r2(), coverage.r2(), cv.r2())
        val category = when {
            monthsWithSales < 3 -> "new"
            coverage < 0.5 -> "intermittent"
            avg <= 50 -> "low_stable"
            else -> "high_stable"
        }
        return category to stats
    }

    /** V1: _forecast_new_product (prediction.py L162-187) */
    private fun forecastNewProduct(series: List<Double>): Pair<Double, String> {
        val nonZero = series.filter { it > 0 }
        if (nonZero.isEmpty()) return 0.0 to "无销售记录"

        val avg = nonZero.average()
        return when (nonZero.size) {
            1 -> (avg * 0.9).r1() to "新品-单月×0.9"
            2 -> (nonZero[1] * 0.6 + nonZero[0] * 0.4).r1() to "新品-双月加权"
            else -> avg.r1() to "新品-均值"
        }
    }

    /** V1: _forecast_intermittent — Croston method (prediction.py L189-213) */
    private fun forecastIntermittent(series: List<Double>): Pair<Double, String> {
        val nonZeroCount = series.count { it > 0 }
        if (nonZeroCount < 2) return series.average().r1() to "间歇性-均值回退"

        val alpha = 0.3
        var demand = series[series.indexOfFirst { it > 0 }]
        var interval = 1.0
        var lastIdx = series.indexOfFirst { it > 0 }

        for (i in lastIdx + 1 until series.size) {
            if (series[i] > 0) {
                val currentInt = i - lastIdx
                demand = alpha * series[i] + (1 - alpha) * demand
                interval = alpha * currentInt + (1 - alpha) * interval
                lastIdx = i
            }
        }
        if (interval == 0.0) return series.filter { it > 0 }.average().r1() to "间歇性-非零均值"
        return (demand / interval).r1() to "Croston方法"
    }

    /** V1: _forecast_low_stable (prediction.py L215-243) */
    private fun forecastLowStable(series: List<Double>): Pair<Double, String> {
        if (series.size < 3) return series.average().r1() to "均值回退"

        val recent = series.takeLast(3).average()
        val older = if (series.size >= 6) series.slice(series.size - 6 until series.size - 3).average()
                    else series.take(max(1, series.size - 3)).average()

        var forecast = recent * recentWeight + older * olderWeight
        val method: String
        when {
            recent > older * 1.2 -> { forecast *= 1.05; method = "加权均值+上升趋势" }
            recent < older * 0.8 -> { forecast *= 0.95; method = "加权均值+下降趋势" }
            else -> method = "加权移动平均"
        }
        return forecast.r1() to method
    }

    /** V1: _forecast_high_stable (prediction.py L245-277) */
    private fun forecastHighStable(series: List<Double>): Pair<Double, String> {
        if (series.size < 6) return forecastLowStable(series)

        val n = series.size
        val x = (0 until n).map { it.toDouble() }.toDoubleArray()
        val y = series.toDoubleArray()
        val (slope, intercept) = linearFit(x, y)

        val trendForecast = intercept + slope * n
        val nextMonth = (LocalDate.now().monthValue % 12) + 1
        val seasonalFactor = seasonalFactors[nextMonth] ?: 1.0

        val recentAvg = series.takeLast(3).average()
        val baseForecast = trendForecast * 0.5 + recentAvg * 0.5
        val forecast = max(baseForecast * seasonalFactor, recentAvg * 0.5)

        val trendDir = if (slope > 0) "↑" else if (slope < 0) "↓" else "→"
        return forecast.r1() to "趋势${trendDir}+季节×${seasonalFactor}"
    }

    /** V1: _evaluate_accuracy (prediction.py L279-305) */
    private fun evaluateAccuracy(series: List<Double>): Double {
        if (series.size < 4) return 50.0

        val train = series.dropLast(3)
        val test = series.takeLast(3)
        if (train.size < 3) return 50.0

        val pred = if (train.size > 3) {
            train.takeLast(3).average() * recentWeight + train.dropLast(3).average() * olderWeight
        } else {
            train.average()
        }

        val actualSum = test.sumOf { abs(it) }
        val errorSum = test.sumOf { abs(it - pred) }

        if (actualSum == 0.0) return if (errorSum < 1) 100.0 else 0.0
        val wmape = errorSum / actualSum
        return max(0.0, minOf(100.0, (1 - wmape) * 100)).r1()
    }

    // ═══ Math Helpers ═══

    private fun linearFit(x: DoubleArray, y: DoubleArray): Pair<Double, Double> {
        val n = x.size
        val sumX = x.sum(); val sumY = y.sum()
        val sumXY = x.zip(y.toTypedArray()).sumOf { (a, b) -> a * b }
        val sumX2 = x.sumOf { it * it }
        val denom = n * sumX2 - sumX * sumX
        if (denom == 0.0) return 0.0 to (sumY / n)
        val slope = (n * sumXY - sumX * sumY) / denom
        val intercept = (sumY - slope * sumX) / n
        return slope to intercept
    }

    private fun List<Double>.std(): Double {
        if (size <= 1) return 0.0
        val mean = average()
        return kotlin.math.sqrt(sumOf { (it - mean) * (it - mean) } / size)
    }

    private fun Double.r1() = (kotlin.math.round(this * 10) / 10.0)
    private fun Double.r2() = (kotlin.math.round(this * 100) / 100.0)
    private fun Double.r() = "%.1f".format(this)
}

private data class PredictionRow(
    val sku: String, val forecast: Double, val method: String,
    val confidence: Double, val category: String, val avgMonthly: Double,
    val coverage: Double, val cv: Double, val recent3: Double,
    val older3: Double, val trend: String,
)
