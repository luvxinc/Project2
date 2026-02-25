package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/**
 * CustomerAnalyzer — R-F-P-L-D 客户聚类分析。
 *
 * V1 精确对照: backend/core/services/crm.py (131行)
 *
 * V1 功能:
 *   1. 加载过去 365 天交易数据
 *   2. 计算 RFM 模型 (Recency, Frequency, Net_Monetary)
 *   3. 计算 AOV, ReturnRate
 *   4. 调用诊断类进行分层
 *
 * V1 输出 CSV 列:
 *   buyer username, Frequency, Gross_Monetary, Refund, Net_Monetary,
 *   Recency, AOV, Total_Lines, ReturnRate, BadCount, DisputeCount
 *
 * V1 文件名: Analysis_Customer_RFM_{file_suffix}.csv
 */
@Service
class CustomerAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 启动 R-F-P-L-D 客户聚类分析...")

        // V1 parity: crm.py L96-101 — 加载过去一年交易数据
        val endDt = config.endDate
        val startDt = endDt.minusDays(365)
        log.info("加载过去一年 (365天) 交易数据: {} -> {}...", startDt, endDt)

        val transactions = reportData.findTransactionsByDateRange(startDt, endDt)
        if (transactions.isEmpty()) {
            log.warn("⚠️ 过去一年无交易数据")
            return AnalyzerResult("Customer", false, error = "过去一年无交易数据")
        }

        // V1 parity: crm.py L108-109 — 计算 RFM
        log.info("正在计算动态净值 RFM 模型...")
        val rfmData = calculateRfm(transactions, endDt)

        if (rfmData.isEmpty()) {
            log.warn("⚠️ 计算后无有效客户数据")
            return AnalyzerResult("Customer", false, error = "无有效客户数据")
        }

        // V1 parity: crm.py L125 — sort by Net_Monetary desc
        val sorted = rfmData.sortedByDescending { it.netMonetary }

        // Build CSV
        val headers = listOf(
            "buyer username", "Frequency", "Gross_Monetary", "Refund",
            "Net_Monetary", "Recency", "AOV", "Total_Lines",
            "ReturnRate", "BadCount", "DisputeCount"
        )

        val rows = sorted.map { r ->
            listOf<Any?>(
                r.buyer, r.frequency, r.grossMonetary.r(), r.refund.r(),
                r.netMonetary.r(), r.recency, r.aov.r(), r.totalLines,
                "%.2f%%".format(r.returnRate * 100), r.badCount, r.disputeCount
            )
        }

        val filename = "Analysis_Customer_RFM_${config.fileSuffix}.csv"
        val path = csvWriter.saveCsv(headers, rows, filename)
        return if (path != null) {
            log.info("✅ 客户分析已生成: {}", filename)
            AnalyzerResult("Customer", true, 1, listOf(filename))
        } else {
            AnalyzerResult("Customer", false, error = "CSV写入失败")
        }
    }

    /**
     * V1 parity: crm.py _calculate_rfm_1y() L25-89
     *
     * RFM = Recency + Frequency + Monetary (Net)
     * + BadCount (退货相关 action 计数) + DisputeCount (CC/PD)
     */
    private fun calculateRfm(
        transactions: List<CleanedTransaction>,
        analysisEndDate: LocalDate,
    ): List<CustomerRfm> {
        val analysisEndInstant = analysisEndDate.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)

        // V1 parity: crm.py L45-46
        val badActions = setOf(SalesAction.CA, SalesAction.RE, SalesAction.CR, SalesAction.CC, SalesAction.PD)
        val disputeActions = setOf(SalesAction.CC, SalesAction.PD)

        // V1 parity: crm.py L58-71 — groupby("buyer username")
        data class BuyerAgg(
            var orderNumbers: MutableSet<String> = mutableSetOf(),
            var grossRevenue: BigDecimal = BigDecimal.ZERO,
            var refundTotal: BigDecimal = BigDecimal.ZERO,
            var lastDate: Instant = Instant.EPOCH,
            var badCount: Int = 0,
            var disputeCount: Int = 0,
            var totalLines: Int = 0,
        )

        val buyerMap = mutableMapOf<String, BuyerAgg>()

        for (tx in transactions) {
            val buyer = tx.buyerUsername?.trim() ?: continue
            if (buyer.isBlank()) continue

            val agg = buyerMap.getOrPut(buyer) { BuyerAgg() }

            agg.totalLines++
            tx.orderNumber?.let { agg.orderNumbers.add(it) }
            agg.grossRevenue += tx.saleAmount
            agg.refundTotal += tx.refundAmount

            if (tx.orderDate.isAfter(agg.lastDate)) {
                agg.lastDate = tx.orderDate
            }
            if (tx.action in badActions) agg.badCount++
            if (tx.action in disputeActions) agg.disputeCount++
        }

        // V1 parity: crm.py L78-88 — build RFM rows
        return buyerMap.map { (buyer, agg) ->
            val frequency = agg.orderNumbers.size
            val netMonetary = agg.grossRevenue + agg.refundTotal  // V1: Refund 是负数
            val recency = ChronoUnit.DAYS.between(agg.lastDate, analysisEndInstant).toInt()
            val aov = if (frequency > 0) netMonetary.divide(BigDecimal.valueOf(frequency.toLong()), 2, RoundingMode.HALF_UP)
                      else BigDecimal.ZERO
            val returnRate = if (agg.totalLines > 0) agg.badCount.toDouble() / agg.totalLines else 0.0

            CustomerRfm(
                buyer = buyer,
                frequency = frequency,
                grossMonetary = agg.grossRevenue,
                refund = agg.refundTotal,
                netMonetary = netMonetary,
                recency = recency,
                aov = aov,
                totalLines = agg.totalLines,
                returnRate = returnRate,
                badCount = agg.badCount,
                disputeCount = agg.disputeCount,
            )
        }
    }

    private fun BigDecimal.r() = this.setScale(2, RoundingMode.HALF_UP)
}

private data class CustomerRfm(
    val buyer: String,
    val frequency: Int,
    val grossMonetary: BigDecimal,
    val refund: BigDecimal,
    val netMonetary: BigDecimal,
    val recency: Int,
    val aov: BigDecimal,
    val totalLines: Int,
    val returnRate: Double,
    val badCount: Int,
    val disputeCount: Int,
)
