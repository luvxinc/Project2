package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal

/**
 * SalesQtyAnalyzer — SKU 销量统计分析。
 *
 * V1 精确对照: backend/core/services/finance/sales.py (170行)
 *
 * V1 功能:
 *   1. 按 SKU × Seller(88/Plus/Total) × Action(Sold/Canceled/Returned/Cased/Request/Dispute)
 *      统计数量
 *   2. 计算 Net = Sold - Canceled - Returned*LR_RETURN - Cased*LR_CASE
 *      - Request*LR_REQUEST - Dispute*LR_DISPUTE
 *   3. 计算各退货率百分比
 *   4. 特殊 SKU 规则: NU1C8E51C/K → 额外添加 NU1C8SKT7 × 2
 *
 * V1 输出 CSV 列 (每个 prefix 重复):
 *   SKU, {prefix}_Sold, {prefix}_Canceled, {prefix}_Canceled_%,
 *   {prefix}_Returned, {prefix}_Returned_%, {prefix}_Cased, {prefix}_Cased_%,
 *   {prefix}_Request, {prefix}_Request_%, {prefix}_Dispute, {prefix}_Dispute_%,
 *   {prefix}_Net
 *   prefix ∈ {"88", "plus", "total"}
 *
 * V1 文件名: SKU_Sold_{file_suffix}.csv
 */
@Service
class SalesQtyAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 开始分析销量: {} -> {}", config.startDate, config.endDate)

        val transactions = reportData.findTransactionsByDateRange(config.startDate, config.endDate)
        if (transactions.isEmpty()) {
            log.warn("⚠️ 期间无数据")
            return AnalyzerResult("SalesQty", false, error = "期间无数据")
        }
        log.info("📊 已加载原始记录: {} 条", transactions.size)

        val stats = mutableMapOf<String, SkuSalesStats>()

        for (tx in transactions) {
            processRow(tx, stats)
        }

        if (stats.isEmpty()) {
            log.warn("⚠️ 统计结果为空")
            return AnalyzerResult("SalesQty", false, error = "统计结果为空")
        }

        // Build CSV
        val filename = "SKU_Sold_${config.fileSuffix}.csv"
        val prefixes = listOf("88", "plus", "total")
        val metrics = listOf("Canceled", "Returned", "Cased", "Request", "Dispute")

        val headers = mutableListOf("SKU")
        for (p in prefixes) {
            headers.addAll(listOf(
                "${p}_Sold", "${p}_Canceled", "${p}_Canceled_%",
                "${p}_Returned", "${p}_Returned_%", "${p}_Cased", "${p}_Cased_%",
                "${p}_Request", "${p}_Request_%", "${p}_Dispute", "${p}_Dispute_%",
                "${p}_Net"
            ))
        }

        val rows = stats.entries.sortedByDescending { it.value.totalSold }.map { (sku, s) ->
            val row = mutableListOf<Any?>(sku)
            for (p in prefixes) {
                val sold = s.getSold(p)
                val canceled = s.getCanceled(p)
                val returned = s.getReturned(p)
                val cased = s.getCased(p)
                val request = s.getRequest(p)
                val dispute = s.getDispute(p)

                val net = (sold - canceled
                    - (returned * config.lrReturn).toInt()
                    - (cased * config.lrCase).toInt()
                    - (request * config.lrRequest).toInt()
                    - (dispute * config.lrDispute).toInt())

                row.addAll(listOf(
                    sold, canceled, pct(canceled, sold),
                    returned, pct(returned, sold),
                    cased, pct(cased, sold),
                    request, pct(request, sold),
                    dispute, pct(dispute, sold),
                    net
                ))
            }
            row
        }

        val footer = listOf(
            " ", "备注说明：",
            "1. 取消的订单不算库存消耗",
            "2. Case为客户投诉退货,平台介入强制退款,耗损率${(config.lrCase * 100).toInt()}%",
            "3. Request为客户申请退货,平台介入,卖家退款,耗损率${(config.lrRequest * 100).toInt()}%",
            "4. Return为客户申请退货,无平台介入,卖家退款, 耗损率${(config.lrReturn * 100).toInt()}%",
            "5. Dispute为客户通过银行投诉, 平台强制退款, 耗损率${(config.lrDispute * 100).toInt()}%",
        )

        val path = csvWriter.saveCsv(headers, rows, filename, footer)
        return if (path != null) {
            AnalyzerResult("SalesQty", true, 1, listOf(filename))
        } else {
            AnalyzerResult("SalesQty", false, error = "CSV写入失败")
        }
    }

    /**
     *
     * 处理单行数据，按 seller 归属到 88/plus/total 三个维度。
     */
    private fun processRow(tx: CleanedTransaction, stats: MutableMap<String, SkuSalesStats>) {
        val seller = (tx.seller ?: "").trim().lowercase()
        val action = tx.action
        val quantity = tx.quantity

        val skuList = extractSkuSlots(tx)

        val hasSpecial = skuList.any { it.sku in SpecialSkuRules.SOURCE_SKUS }
        val finalSkuList = if (hasSpecial) {
            skuList + SkuSlot(SpecialSkuRules.TARGET_SKU, SpecialSkuRules.TARGET_QTY)
        } else {
            skuList
        }

        // action_map: 88 → ["esparts88"], plus → ["espartsplus"], total → null
        // code_map: Canceled=CA, Returned=RE, Cased=CC, Request=CR, Dispute=PD
        for ((sku, qtyp) in finalSkuList) {
            val totalQty = quantity * qtyp
            val s = stats.getOrPut(sku) { SkuSalesStats() }

            // total (V1: prefix="total", target_sellers=None → always accumulate)
            s.totalSold += totalQty
            accumulateAction(s, "total", action, totalQty)

            // 88 (V1: prefix="88", target_sellers=["esparts88"])
            if (seller == "esparts88") {
                s.s88Sold += totalQty
                accumulateAction(s, "88", action, totalQty)
            }

            // plus (V1: prefix="plus", target_sellers=["espartsplus"])
            if (seller == "espartsplus") {
                s.plusSold += totalQty
                accumulateAction(s, "plus", action, totalQty)
            }
        }
    }

    private fun extractSkuSlots(tx: CleanedTransaction): List<SkuSlot> = tx.extractSkuSlots()

    /**
     * for label, code in code_map.items():
     *     if action == code: stats_dict[sku][f"{prefix}_{label}"] += total_qty
     */
    private fun accumulateAction(s: SkuSalesStats, prefix: String, action: SalesAction, qty: Int) {
        when (prefix) {
            "total" -> when (action) {
                SalesAction.CA -> s.totalCanceled += qty
                SalesAction.RE -> s.totalReturned += qty
                SalesAction.CC -> s.totalCased += qty
                SalesAction.CR -> s.totalRequest += qty
                SalesAction.PD -> s.totalDispute += qty
                else -> {}
            }
            "88" -> when (action) {
                SalesAction.CA -> s.s88Canceled += qty
                SalesAction.RE -> s.s88Returned += qty
                SalesAction.CC -> s.s88Cased += qty
                SalesAction.CR -> s.s88Request += qty
                SalesAction.PD -> s.s88Dispute += qty
                else -> {}
            }
            "plus" -> when (action) {
                SalesAction.CA -> s.plusCanceled += qty
                SalesAction.RE -> s.plusReturned += qty
                SalesAction.CC -> s.plusCased += qty
                SalesAction.CR -> s.plusRequest += qty
                SalesAction.PD -> s.plusDispute += qty
                else -> {}
            }
        }
    }

    private fun pct(part: Int, total: Int): String {
        if (total == 0) return "0.00%"
        return "%.2f%%".format(part.toDouble() / total * 100)
    }
}

/**
 * Per-SKU sales statistics across 3 seller dimensions.
 */
private data class SkuSalesStats(
    var s88Sold: Int = 0, var s88Canceled: Int = 0, var s88Returned: Int = 0,
    var s88Cased: Int = 0, var s88Request: Int = 0, var s88Dispute: Int = 0,

    var plusSold: Int = 0, var plusCanceled: Int = 0, var plusReturned: Int = 0,
    var plusCased: Int = 0, var plusRequest: Int = 0, var plusDispute: Int = 0,

    var totalSold: Int = 0, var totalCanceled: Int = 0, var totalReturned: Int = 0,
    var totalCased: Int = 0, var totalRequest: Int = 0, var totalDispute: Int = 0,
) {
    fun getSold(p: String) = when (p) { "88" -> s88Sold; "plus" -> plusSold; else -> totalSold }
    fun getCanceled(p: String) = when (p) { "88" -> s88Canceled; "plus" -> plusCanceled; else -> totalCanceled }
    fun getReturned(p: String) = when (p) { "88" -> s88Returned; "plus" -> plusReturned; else -> totalReturned }
    fun getCased(p: String) = when (p) { "88" -> s88Cased; "plus" -> plusCased; else -> totalCased }
    fun getRequest(p: String) = when (p) { "88" -> s88Request; "plus" -> plusRequest; else -> totalRequest }
    fun getDispute(p: String) = when (p) { "88" -> s88Dispute; "plus" -> plusDispute; else -> totalDispute }
}
