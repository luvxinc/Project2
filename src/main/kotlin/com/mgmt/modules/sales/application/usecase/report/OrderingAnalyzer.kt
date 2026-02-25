package com.mgmt.modules.sales.application.usecase.report

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.sqrt

/**
 * OrderingAnalyzer — 智能补货决策分析器。
 *
 * V1 精确对照: backend/core/services/ordering.py (276行)
 *
 * V1 对照要点 (ordering.py L25-276):
 *   1. ABC 分类用 预估销售额 = 预测 × Cog (金额 Pareto), 阈值 80/95
 *   2. Z-Score 按服务水平: {0.98→2.05, 0.95→1.65, 0.90→1.28}
 *   3. 安全库存 = max(Z × √LeadTime × 波动率, MinSafety × 预测)
 *   4. 目标库存 = LeadTime × 月预测 + 安全库存
 *   5. 可用库存 = 理论库存 + 已定未发 + 在途未到
 *   6. 缺口 = 目标库存 - 可用库存
 *   7. MOQ 向上取整: 余数 >= 0.33 → ceil, 否则 floor
 *   8. 决策标签: 紧急/高优/建议/可延迟/不需要 (5级)
 *
 * V1 输出列:
 *   SKU, ABC等级, 紧急程度, 建议订货, 备注,
 *   预测月消耗, 目标服务水平, 安全库存, 目标库存,
 *   理论库存, 已定未发, 在途未到, 可用库存, 缺口,
 *   库存金额, 订货金额, 周转天数, 波动率, Cog, MOQ
 *
 * V1 文件名: Smart_Ordering_Plan_{file_suffix}.csv
 */
@Service
class OrderingAnalyzer(
    private val reportData: ReportDataRepository,
    private val predictionAnalyzer: PredictionAnalyzer,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private val zScoreMap = mapOf(0.98 to 2.05, 0.95 to 1.65, 0.90 to 1.28, 0.85 to 1.04)

    private val criticalThreshold = 0.3
    private val highThreshold = 0.6
    private val mediumThreshold = 0.9

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 [企业级] 启动智能补货计算 (Lead={}月, Safety={}月)...",
            config.leadTime, config.safetyStock)

        // 1. 获取预测数据 (from PredictionAnalyzer — 复用)
        val forecasts = predictionAnalyzer.getPredictionData(config)
        if (forecasts.isEmpty()) {
            log.warn("⚠️ 预测数据为空，无法计算补货")
            return AnalyzerResult("Ordering", false, error = "预测数据为空")
        }
        log.info("📊 预测数据 {} 个 SKU", forecasts.size)

        // 2. 加载辅助数据
        val skuCostMap = reportData.buildSkuCostMap()
        val currentStock = reportData.findCurrentInventory()
        val moqMap = reportData.findSkuMoq()
        val volatilityMap = reportData.findHistoricalVolatility()
        val supplyChainData = reportData.findSupplyChainData()

        // 3. ABC 分类: ordering.py L103-120
        // V1 用 预估销售额 = 预测 × Cog 做金额 Pareto
        val abcResult = classifyAbc(forecasts, skuCostMap)

        // 4. 逐 SKU 补货计算: ordering.py L122-209
        val results = mutableListOf<OrderingRow>()
        val leadTime = config.leadTime    // 月数
        val minSafety = config.safetyStock // 月数

        for ((sku, monthForecast) in forecasts) {
            val abc = abcResult[sku]?.abc ?: "C"
            val serviceLevel = abcResult[sku]?.serviceLevel ?: 0.90
            val cog = skuCostMap[sku] ?: BigDecimal.ZERO
            val moq = moqMap[sku] ?: 100
            val sc = supplyChainData[sku]

            var volatility = volatilityMap[sku] ?: (monthForecast * 0.5)
            if (volatility <= 0) volatility = monthForecast * 0.5

            val zScore = zScoreMap[serviceLevel] ?: 1.28
            val ssStat = zScore * sqrt(leadTime) * volatility
            val ssMin = minSafety * monthForecast
            val safetyStock = max(ssStat, ssMin)

            val targetStock = leadTime * monthForecast + safetyStock
            val theoryInv = (currentStock[sku] ?: 0).toDouble()
            val orderQty = (sc?.orderQty ?: 0).toDouble()
            val transitQty = (sc?.transitQty ?: 0).toDouble()
            val availableStock = theoryInv + orderQty + transitQty
            val gap = targetStock - availableStock

            var suggestQty = 0
            var urgency: String
            var note: String

            if (gap <= 0) {
                urgency = "不需要"
                note = "库存充足"
            } else if (monthForecast * 6 < moq) {
                urgency = "不需要"
                note = "销量过低 (6月预测 < MOQ:$moq)"
            } else {
                val factor = gap / moq
                val remainder = factor - factor.toInt()
                val rounds = if (remainder >= 0.33) ceil(factor).toInt() else floor(factor).toInt()
                suggestQty = max(rounds * moq, 0)

                val stockRatio = if (targetStock > 0) availableStock / targetStock else 1.0
                when {
                    stockRatio < criticalThreshold -> {
                        urgency = "🔴 紧急"
                        note = "库存告急 (${"%,.0f".format(stockRatio * 100)}%)"
                    }
                    stockRatio < highThreshold -> {
                        urgency = "🟠 高优"
                        note = "建议尽快补货 (${"%,.0f".format(stockRatio * 100)}%)"
                    }
                    stockRatio < mediumThreshold -> {
                        urgency = "🟡 建议"
                        note = "正常补货"
                    }
                    else -> {
                        urgency = "🟢 可延迟"
                        note = "可延迟下单"
                    }
                }

                if (suggestQty == 0) {
                    urgency = "不需要"
                    note = "缺口微小"
                }
            }

            val invValue = theoryInv * cog.toDouble()
            val orderValue = suggestQty * cog.toDouble()
            val turnoverDays = if (monthForecast > 0) theoryInv / monthForecast * 30 else 999.0

            results.add(OrderingRow(
                sku = sku, abc = abc, urgency = urgency,
                suggestQty = suggestQty, note = note,
                forecast = monthForecast, serviceLevel = serviceLevel,
                safetyStock = safetyStock, targetStock = targetStock,
                theoryInv = theoryInv, orderOnHand = orderQty,
                transitOnHand = transitQty, availableStock = availableStock,
                gap = gap, invValue = invValue, orderValue = orderValue,
                turnoverDays = turnoverDays, volatility = volatility,
                cog = cog.toDouble(), moq = moq,
            ))
        }

        val urgencyOrder = mapOf(
            "🔴 紧急" to 0, "🟠 高优" to 1, "🟡 建议" to 2,
            "🟢 可延迟" to 3, "不需要" to 4
        )
        results.sortWith(compareBy<OrderingRow> {
            urgencyOrder[it.urgency] ?: 4
        }.thenByDescending { it.suggestQty })

        // Build CSV: ordering.py L216-220
        val headers = listOf(
            "SKU", "ABC等级", "紧急程度", "建议订货", "备注",
            "预测月消耗", "目标服务水平", "安全库存", "目标库存",
            "理论库存", "已定未发", "在途未到", "可用库存", "缺口",
            "库存金额", "订货金额", "周转天数", "波动率", "Cog", "MOQ"
        )

        val rows = results.map { r ->
            listOf<Any?>(
                r.sku, r.abc, r.urgency, r.suggestQty, r.note,
                r.forecast.r(), r.serviceLevel, r.safetyStock.r(),
                r.targetStock.r(), r.theoryInv.r(), r.orderOnHand.r(),
                r.transitOnHand.r(), r.availableStock.r(), r.gap.r(),
                r.invValue.r2(), r.orderValue.r2(), r.turnoverDays.r(),
                r.volatility.r2(), r.cog.r2(), r.moq,
            )
        }

        val urgentCount = results.count { it.urgency.contains("紧急") || it.urgency.contains("高优") }
        val totalOrderValue = results.sumOf { it.orderValue }
        val totalInvValue = results.sumOf { it.invValue }

        val footer = listOf(
            "📘 企业级智能补货系统说明:",
            "1. 参数: Lead=${config.leadTime}月, MinSafety=${config.safetyStock}月",
            "2. 安全库存公式: Z × √(LeadTime) × σ (历史波动率)",
            "3. 目标库存公式: Forecast × LeadTime + SafetyStock",
            "4. 紧急/高优SKU: ${urgentCount} 个",
            "5. 总库存金额: \$%,.2f".format(totalInvValue),
            "6. 建议订货金额: \$%,.2f".format(totalOrderValue),
        )

        val filename = "Smart_Ordering_Plan_${config.fileSuffix}.csv"
        val path = csvWriter.saveCsv(headers, rows, filename, footer)
        return if (path != null) {
            log.info("✅ 补货计划生成完成: {}", filename)
            AnalyzerResult("Ordering", true, 1, listOf(filename))
        } else {
            AnalyzerResult("Ordering", false, error = "CSV写入失败")
        }
    }

    /**
     * ABC 分类用金额 Pareto (预测 × Cog), 阈值 80/95
     */
    data class AbcEntry(val abc: String, val serviceLevel: Double)

    private fun classifyAbc(
        forecasts: Map<String, Double>,
        costMap: Map<String, BigDecimal>,
    ): Map<String, AbcEntry> {
        data class SkuSalesValue(val sku: String, val value: Double)

        val items = forecasts.map { (sku, forecast) ->
            val cog = costMap[sku]?.toDouble() ?: 0.0
            SkuSalesValue(sku, forecast * cog)
        }.sortedByDescending { it.value }

        val totalValue = items.sumOf { it.value }
        if (totalValue <= 0) {
            return items.associate { it.sku to AbcEntry("C", 0.90) }
        }

        var cumSum = 0.0
        return items.associate { item ->
            cumSum += item.value
            val pct = cumSum / totalValue
            val entry = when {
                pct <= 0.80 -> AbcEntry("A", 0.98)
                pct <= 0.95 -> AbcEntry("B", 0.95)
                else -> AbcEntry("C", 0.90)
            }
            item.sku to entry
        }
    }

    private fun Double.r() = "%.1f".format(this)
    private fun Double.r2() = "%.2f".format(this)
}

private data class OrderingRow(
    val sku: String, val abc: String, val urgency: String,
    val suggestQty: Int, val note: String,
    val forecast: Double, val serviceLevel: Double,
    val safetyStock: Double, val targetStock: Double,
    val theoryInv: Double, val orderOnHand: Double,
    val transitOnHand: Double, val availableStock: Double,
    val gap: Double, val invValue: Double, val orderValue: Double,
    val turnoverDays: Double, val volatility: Double,
    val cog: Double, val moq: Int,
)
