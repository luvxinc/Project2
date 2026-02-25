package com.mgmt.modules.sales.application.usecase.report

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * ReportGeneratorUseCase — 报表生成协调器。
 *
 * V1 精确对照: backend/core/services/report_generator.py
 *
 * V3 替代方案: 不再调 Python subprocess，直接调用 9 个 Kotlin 分析器。
 * 负责:
 *   1. 构建 ReportConfig（日期、用户、输出目录）
 *   2. 按顺序调用 9 个分析器
 *   3. 收集结果、汇总状态
 *   4. 返回最终生成结果
 */
@Service
class ReportGeneratorUseCase(
    private val salesQtyAnalyzer: SalesQtyAnalyzer,
    private val skuProfitAnalyzer: SkuProfitAnalyzer,
    private val listingProfitAnalyzer: ListingProfitAnalyzer,
    private val comboProfitAnalyzer: ComboProfitAnalyzer,
    private val customerAnalyzer: CustomerAnalyzer,
    private val shippingAnalyzer: ShippingAnalyzer,
    private val inventorySnapshotAnalyzer: InventorySnapshotAnalyzer,
    private val predictionAnalyzer: PredictionAnalyzer,
    private val orderingAnalyzer: OrderingAnalyzer,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Value("\${mgmt.report.output-dir:./output/reports}")
    private lateinit var baseOutputDir: String

    /**
     * Generate all 9 reports.
     *
     * @param startDate ISO date string (yyyy-MM-dd)
     * @param endDate ISO date string (yyyy-MM-dd)
     * @param username current user
     * @return list of AnalyzerResult
     */
    fun generateAll(
        startDate: String,
        endDate: String,
        username: String = "system",
        outputDir: Path? = null,
        lrCase: Double? = null,
        lrRequest: Double? = null,
        lrReturn: Double? = null,
        lrDispute: Double? = null,
        leadTime: Double? = null,
        safetyStock: Double? = null,
    ): List<AnalyzerResult> {
        log.info("╔══════════════════════════════════════════╗")
        log.info("║ V3 报表生成器 — 原生 Kotlin (无 Python)    ║")
        log.info("╚══════════════════════════════════════════╝")

        val start = java.time.LocalDate.parse(startDate)
        val end = java.time.LocalDate.parse(endDate)

        // Use provided outputDir (from Controller) or fall back to self-resolved
        val resolvedDir = outputDir ?: run {
            val safeUser = username.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.ifBlank { "default" }
            Paths.get(baseOutputDir, safeUser)
        }
        if (!Files.exists(resolvedDir)) Files.createDirectories(resolvedDir)

        val defaults = ReportConfig(startDate = start, endDate = end)
        val config = ReportConfig(
            startDate = start,
            endDate = end,
            fileSuffix = "${startDate}_${endDate}",
            lrCase = lrCase ?: defaults.lrCase,
            lrRequest = lrRequest ?: defaults.lrRequest,
            lrReturn = lrReturn ?: defaults.lrReturn,
            lrDispute = lrDispute ?: defaults.lrDispute,
            leadTime = leadTime ?: defaults.leadTime,
            safetyStock = safetyStock ?: defaults.safetyStock,
            outputDir = resolvedDir,
            username = username,
        )

        val csvWriter = ReportCsvWriter(resolvedDir)
        val results = mutableListOf<AnalyzerResult>()

        val analyzers: List<Pair<String, () -> AnalyzerResult>> = listOf(
            "1/9 SKU销量统计" to { salesQtyAnalyzer.run(config, csvWriter) },
            "2/9 SKU利润分析" to { skuProfitAnalyzer.run(config, csvWriter) },
            "3/9 Listing利润分析" to { listingProfitAnalyzer.run(config, csvWriter) },
            "4/9 Combo利润分析" to { comboProfitAnalyzer.run(config, csvWriter) },
            "5/9 客户画像分析" to { customerAnalyzer.run(config, csvWriter) },
            "6/9 物流费用分析" to { shippingAnalyzer.run(config, csvWriter) },
            "7/9 库存资产快照" to { inventorySnapshotAnalyzer.run(config, csvWriter) },
            "8/9 销量预测" to { predictionAnalyzer.run(config, csvWriter) },
            "9/9 智能补货" to { orderingAnalyzer.run(config, csvWriter) },
        )

        for ((label, runner) in analyzers) {
            log.info("▶ $label...")
            try {
                val result = runner()
                results.add(result)
                if (result.success) {
                    log.info("  ✅ {} — {} 个文件", result.name, result.fileCount)
                } else {
                    log.warn("  ⚠️ {} — {}", result.name, result.error)
                }
            } catch (e: Exception) {
                log.error("  ❌ $label 失败: ${e.message}", e)
                results.add(AnalyzerResult(label, false, error = e.message))
            }
        }

        val successCount = results.count { it.success }
        val totalFiles = results.sumOf { it.fileCount }
        log.info("══════════════════════════════════════")
        log.info("报表生成完成: {}/9 成功, {} 个文件输出到 {}", successCount, totalFiles, outputDir)
        log.info("══════════════════════════════════════")

        return results
    }
}
