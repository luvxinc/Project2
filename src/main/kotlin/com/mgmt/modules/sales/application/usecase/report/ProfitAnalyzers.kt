package com.mgmt.modules.sales.application.usecase.report

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.LocalDate

/**
 * ListingProfitAnalyzer — 按 Item ID 归集财务数据。
 *
 * V1 精确对照: backend/core/services/finance/profit_listing.py (89行)
 *
 * 聚合逻辑复用 ProfitAggregator.aggregate(keyExtractor = { tx.itemId })
 * 报表生成复用 ProfitReportBuilder.build()
 *
 * V1 输出: Profit_Analysis_Listing_{file_suffix}.csv
 *   内含: A1-A3 数量表, B1-B3 金额表 (6张表)
 */
@Service
class ListingProfitAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 Listing 利润分析: {} -> {}", config.startDate, config.endDate)

        val skuCostMap = reportData.buildSkuCostMap()
        val curTx = reportData.findTransactionsByDateRange(config.startDate, config.endDate)

        if (curTx.isEmpty()) {
            log.warn("⚠️ 本期无数据，无法分析")
            return AnalyzerResult("ListingProfit", false, error = "本期无数据")
        }
        log.info("📊 已加载原始记录: {} 条", curTx.size)

        val prevRange = computePrevRange(config.startDate, config.endDate)
        val prevTx = reportData.findTransactionsByDateRange(prevRange.first, prevRange.second)

        // 聚合 — 复用共享聚合器 (key = item_id)
        log.info("正在聚合本期数据...")
        val mCur = ProfitAggregator.aggregate(curTx, skuCostMap,
            keyExtractor = { it.itemId },
            titleExtractor = { it.itemTitle })
        log.info("正在聚合上期数据(用于环比)...")
        val mPrev = ProfitAggregator.aggregate(prevTx, skuCostMap,
            keyExtractor = { it.itemId },
            titleExtractor = { it.itemTitle })

        // 报表生成 — 复用共享报表构建器
        val builder = ProfitReportBuilder(config)
        val tables = builder.build(mCur, mPrev, keyName = "Item ID")

        val filename = "Profit_Analysis_Listing_${config.fileSuffix}.csv"
        val path = csvWriter.saveMultiTableCsv(filename, tables)
        return if (path != null) {
            log.info("✅ Listing 利润报表已生成: {}", filename)
            AnalyzerResult("ListingProfit", true, 1, listOf(filename))
        } else {
            AnalyzerResult("ListingProfit", false, error = "CSV写入失败")
        }
    }
}

/**
 * ComboProfitAnalyzer — 按 Full SKU 组合归集财务数据。
 *
 * V1 精确对照: backend/core/services/finance/profit_combo.py (85行)
 *
 * 聚合逻辑复用 ProfitAggregator.aggregate(keyExtractor = { tx.fullSku })
 * 报表生成复用 ProfitReportBuilder.build()
 *
 * V1 输出: Profit_Analysis_Combo_{file_suffix}.csv
 */
@Service
class ComboProfitAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 Combo 利润分析: {} -> {}", config.startDate, config.endDate)

        val skuCostMap = reportData.buildSkuCostMap()
        val curTx = reportData.findTransactionsByDateRange(config.startDate, config.endDate)

        if (curTx.isEmpty()) {
            log.warn("⚠️ 本期无数据，无法分析")
            return AnalyzerResult("ComboProfit", false, error = "本期无数据")
        }
        log.info("📊 已加载原始记录: {} 条", curTx.size)

        val prevRange = computePrevRange(config.startDate, config.endDate)
        val prevTx = reportData.findTransactionsByDateRange(prevRange.first, prevRange.second)

        log.info("正在聚合本期数据...")
        val mCur = ProfitAggregator.aggregate(curTx, skuCostMap,
            keyExtractor = { it.fullSku })
        log.info("正在聚合上期数据(用于环比)...")
        val mPrev = ProfitAggregator.aggregate(prevTx, skuCostMap,
            keyExtractor = { it.fullSku })

        val builder = ProfitReportBuilder(config)
        val tables = builder.build(mCur, mPrev, keyName = "Full SKU")

        val filename = "Profit_Analysis_Combo_${config.fileSuffix}.csv"
        val path = csvWriter.saveMultiTableCsv(filename, tables)
        return if (path != null) {
            log.info("✅ Combo 利润报表已生成: {}", filename)
            AnalyzerResult("ComboProfit", true, 1, listOf(filename))
        } else {
            AnalyzerResult("ComboProfit", false, error = "CSV写入失败")
        }
    }
}

/**
 * SkuProfitAnalyzer — SKU 级利润分析器（按成本权重分摊）。
 *
 * V1 精确对照: backend/core/services/finance/profit_sku.py (227行)
 *
 * 关键差异: 使用 ProfitAggregator.aggregateBySku()（按成本权重分摊），
 *          而非 Listing/Combo 的 weight=1.0 聚合。
 *
 * V1 输出: Profit_Analysis_SKU_{file_suffix}.csv
 */
@Service
class SkuProfitAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 SKU 利润分析: {} -> {}", config.startDate, config.endDate)

        val skuCostMap = reportData.buildSkuCostMap()
        val curTx = reportData.findTransactionsByDateRange(config.startDate, config.endDate)

        if (curTx.isEmpty()) {
            log.warn("⚠️ 本期无数据，无法分析")
            return AnalyzerResult("SkuProfit", false, error = "本期无数据")
        }
        log.info("📊 已加载原始记录: {} 条", curTx.size)

        val prevRange = computePrevRange(config.startDate, config.endDate)
        val prevTx = reportData.findTransactionsByDateRange(prevRange.first, prevRange.second)

        // 聚合 — 使用 SKU 级分摊聚合器
        log.info("正在聚合本期数据...")
        val mCur = ProfitAggregator.aggregateBySku(curTx, skuCostMap)
        log.info("正在聚合上期数据(用于环比)...")
        val mPrev = ProfitAggregator.aggregateBySku(prevTx, skuCostMap)

        val builder = ProfitReportBuilder(config)
        val tables = builder.build(mCur, mPrev, keyName = "SKU")

        val filename = "Profit_Analysis_SKU_${config.fileSuffix}.csv"
        val path = csvWriter.saveMultiTableCsv(filename, tables)
        return if (path != null) {
            log.info("✅ SKU 利润与诊断报表已生成: {}", filename)
            AnalyzerResult("SkuProfit", true, 1, listOf(filename))
        } else {
            AnalyzerResult("SkuProfit", false, error = "CSV写入失败")
        }
    }
}

// ═══════════════════════════════════════════════════════
// Shared utility — prev range computation
// ═══════════════════════════════════════════════════════

/**
 * prev_end = start - 1day, prev_start = prev_end - delta
 */
fun computePrevRange(startDate: LocalDate, endDate: LocalDate): Pair<LocalDate, LocalDate> {
    val delta = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate)
    val prevEnd = startDate.minusDays(1)
    val prevStart = prevEnd.minusDays(delta)
    return prevStart to prevEnd
}
