package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * ShippingAnalyzer — 物流费用分析。
 *
 * V1 精确对照: backend/core/services/logistics.py (175行)
 *
 * V1 输出 5 张表:
 *   表1_费用汇总: 总邮费/超支/罚款 + 环比
 *   表2_单数汇总: 总订单数 + 环比
 *   表3_Combo详情: 按 Full SKU Combo 维度的邮费明细
 *   表4_罚款金额Top10: 超过5单的 Combo 按罚款比例排名
 *   表5_罚款单数Top10: 超过5单的 Combo 按罚款单数比例排名
 *
 * V1 文件名: Analysis_Shipping_{file_suffix}.csv
 */
@Service
class ShippingAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("🚀 开始物流分析: {} -> {}", config.startDate, config.endDate)

        val curTx = reportData.findTransactionsByDateRange(config.startDate, config.endDate)
        val prevRange = computePrevRange(config.startDate, config.endDate)
        val prevTx = reportData.findTransactionsByDateRange(prevRange.first, prevRange.second)

        // V1 parity: logistics.py L32-38
        val df3Cur = computeComboDetails(curTx)
        val df3Prev = computeComboDetails(prevTx)

        val t1 = buildTable1(df3Cur, df3Prev)
        val t2 = buildTable2(curTx, prevTx)
        val t3 = buildTable3(df3Cur)
        val t4 = buildTable4(df3Cur)
        val t5 = buildTable5(df3Cur)

        val tables = listOf(
            "表1_费用汇总" to t1,
            "表2_单数汇总" to t2,
            "表3_Combo详情" to t3,
            "表4_罚款金额Top10" to t4,
            "表5_罚款单数Top10" to t5,
        )

        val filename = "Analysis_Shipping_${config.fileSuffix}.csv"
        val path = csvWriter.saveMultiTableCsv(filename, tables)
        return if (path != null) {
            log.info("✅ 物流报表已生成: {}", filename)
            AnalyzerResult("Shipping", true, 1, listOf(filename))
        } else {
            AnalyzerResult("Shipping", false, error = "CSV写入失败")
        }
    }

    // ═══════════════════════════════════════════════════════
    // V1 parity: _compute_df3() → logistics.py L52-108
    // ═══════════════════════════════════════════════════════

    private data class ComboRow(
        val combo: String,
        var originalPostage: BigDecimal = BigDecimal.ZERO, // 原始邮费
        var overpayPostage: BigDecimal = BigDecimal.ZERO,  // 超支邮费
        var underpayPostage: BigDecimal = BigDecimal.ZERO,  // 邮费罚款
        var returnPostage: BigDecimal = BigDecimal.ZERO,    // 包邮退货邮费
        var originalCount: Int = 0,
        var overpayCount: Int = 0,
        var underpayCount: Int = 0,
        var returnCount: Int = 0,
    )

    private fun computeComboDetails(transactions: List<CleanedTransaction>): List<ComboRow> {
        if (transactions.isEmpty()) return emptyList()

        // V1: order_meta = df.groupby("order number")["full sku"].first()
        val comboMap = mutableMapOf<String, String>() // order_number → full_sku
        for (tx in transactions) {
            val orderNum = tx.orderNumber ?: continue
            if (orderNum !in comboMap) {
                comboMap[orderNum] = (tx.fullSku ?: "Unknown").trim()
            }
        }

        // V1: group by order number, sum label columns
        data class OrderLabel(
            var labelCost: BigDecimal = BigDecimal.ZERO,
            var labelUnderpay: BigDecimal = BigDecimal.ZERO,
            var labelOverpay: BigDecimal = BigDecimal.ZERO,
            var labelReturn: BigDecimal = BigDecimal.ZERO,
        )

        val orderLabels = mutableMapOf<String, OrderLabel>()
        for (tx in transactions) {
            val orderNum = tx.orderNumber ?: continue
            val ol = orderLabels.getOrPut(orderNum) { OrderLabel() }
            ol.labelCost += tx.labelCost
            ol.labelUnderpay += tx.labelUnderpay
            ol.labelOverpay += tx.labelOverpay
            ol.labelReturn += tx.labelReturn
        }

        // V1: accumulate per combo
        val money = mutableMapOf<String, ComboRow>()
        val ordersByCombo = mutableMapOf<String, MutableSet<String>>()

        for ((orderNum, ol) in orderLabels) {
            val combo = comboMap[orderNum] ?: "Unknown"
            val cr = money.getOrPut(combo) { ComboRow(combo) }
            val currentTotal = ol.labelCost + ol.labelUnderpay + ol.labelOverpay
            cr.originalPostage += currentTotal
            cr.overpayPostage += ol.labelOverpay
            cr.underpayPostage += ol.labelUnderpay
            cr.returnPostage += ol.labelReturn

            ordersByCombo.getOrPut(combo) { mutableSetOf() }.add(orderNum)

            // V1: over/underpay/return detection per order
            if (ol.labelOverpay > BigDecimal("0.001")) cr.overpayCount++
            if (ol.labelUnderpay.abs() > BigDecimal("0.001")) cr.underpayCount++
            if (ol.labelReturn > BigDecimal("0.001")) cr.returnCount++
        }

        for ((combo, orders) in ordersByCombo) {
            money[combo]?.originalCount = orders.size
        }

        return money.values.sortedByDescending { it.originalPostage }
    }

    // ═══════════════════════════════════════════════════════
    // Table builders — V1 parity: logistics.py L110-142
    // ═══════════════════════════════════════════════════════

    /** V1: _table1() → 费用汇总 (logistics.py L110-121) */
    private fun buildTable1(cur: List<ComboRow>, prev: List<ComboRow>): CsvTable {
        val cTotal = cur.sumOf { it.originalPostage }
        val cOver = cur.sumOf { it.overpayPostage }
        val cFine = cur.sumOf { it.underpayPostage }
        val pTotal = prev.sumOfBd { it.originalPostage }
        val pOver = prev.sumOfBd { it.overpayPostage }
        val pFine = prev.sumOfBd { it.underpayPostage }

        return CsvTable(
            headers = listOf("项目", "费用", "比例", "环比"),
            rows = listOf(
                listOf("总邮费(Total)", cTotal.r(), "100.00%", diff(cTotal, pTotal)),
                listOf("超支邮费(Over)", cOver.r(), pct(cOver, cTotal), diff(cOver, pOver)),
                listOf("罚款邮费(Fine)", cFine.r(), pct(cFine, cTotal), diff(cFine, pFine)),
            )
        )
    }

    /** V1: _table2() → 单数汇总 (logistics.py L123-128) */
    private fun buildTable2(curTx: List<CleanedTransaction>, prevTx: List<CleanedTransaction>): CsvTable {
        val cCnt = curTx.mapNotNull { it.orderNumber }.distinct().size
        val pCnt = prevTx.mapNotNull { it.orderNumber }.distinct().size
        val d = if (pCnt == 0) "0.00%" else "%.2f%%".format((cCnt - pCnt).toDouble() / pCnt * 100)
        return CsvTable(
            headers = listOf("项目", "单数", "比例", "环比"),
            rows = listOf(listOf("总订单数", cCnt, "100%", d))
        )
    }

    /** V1: df3 直接作为 表3 (logistics.py L42) */
    private fun buildTable3(combos: List<ComboRow>): CsvTable {
        val headers = listOf(
            "Combo", "原始邮费", "超支邮费", "邮费罚款", "包邮退货邮费",
            "原始单数", "超支单数", "罚款单数", "包邮退货单数",
            "罚款比例", "罚款单数比例", "总订单数"
        )
        val rows = combos.map { cr ->
            listOf<Any?>(
                cr.combo, cr.originalPostage.r(5), cr.overpayPostage.r(5),
                cr.underpayPostage.r(5), cr.returnPostage.r(5),
                cr.originalCount, cr.overpayCount, cr.underpayCount, cr.returnCount,
                pct(cr.underpayPostage, cr.originalPostage),
                pct(cr.underpayCount, cr.originalCount),
                cr.originalCount
            )
        }
        return CsvTable(headers, rows)
    }

    /** V1: _table4() → 罚款金额Top10 (logistics.py L130-135) */
    private fun buildTable4(combos: List<ComboRow>): CsvTable {
        val filtered = combos.filter { it.originalCount > 5 }
            .sortedByDescending { pctVal(it.underpayPostage, it.originalPostage) }
            .take(10)
        return CsvTable(
            headers = listOf("Combo", "原始邮费", "邮费罚款", "罚款比例"),
            rows = filtered.map { listOf(it.combo, it.originalPostage.r(), it.underpayPostage.r(), pct(it.underpayPostage, it.originalPostage)) }
        )
    }

    /** V1: _table5() → 罚款单数Top10 (logistics.py L137-142) */
    private fun buildTable5(combos: List<ComboRow>): CsvTable {
        val filtered = combos.filter { it.originalCount > 5 }
            .sortedByDescending { pctVal(it.underpayCount, it.originalCount) }
            .take(10)
        return CsvTable(
            headers = listOf("Combo", "原始单数", "罚款单数", "罚款单数比例"),
            rows = filtered.map { listOf(it.combo, it.originalCount, it.underpayCount, pct(it.underpayCount, it.originalCount)) }
        )
    }

    // ═══ Utility ═══

    private fun pct(part: BigDecimal, total: BigDecimal): String {
        if (total.compareTo(BigDecimal.ZERO) == 0) return "0.00%"
        return "%.2f%%".format(part.divide(total, 10, RoundingMode.HALF_UP).multiply(BigDecimal(100)).toDouble())
    }

    private fun pct(part: Int, total: Int): String {
        if (total == 0) return "0.00%"
        return "%.2f%%".format(part.toDouble() / total * 100)
    }

    private fun pctVal(part: BigDecimal, total: BigDecimal): Double {
        if (total.compareTo(BigDecimal.ZERO) == 0) return 0.0
        return part.divide(total, 10, RoundingMode.HALF_UP).toDouble()
    }

    private fun pctVal(part: Int, total: Int): Double {
        if (total == 0) return 0.0
        return part.toDouble() / total
    }

    private fun diff(cur: BigDecimal, prev: BigDecimal): String {
        if (prev.compareTo(BigDecimal.ZERO) == 0) return "0.00%"
        return "%.2f%%".format(cur.subtract(prev).divide(prev, 10, RoundingMode.HALF_UP).multiply(BigDecimal(100)).toDouble())
    }

    private fun BigDecimal.r(scale: Int = 2) = this.setScale(scale, RoundingMode.HALF_UP)

    private fun <T> List<T>.sumOfBd(selector: (T) -> BigDecimal): BigDecimal =
        fold(BigDecimal.ZERO) { acc, e -> acc + selector(e) }
}
