package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * ProfitMetrics — 每个聚合键 (SKU/Item ID/Full SKU) 的累加指标。
 *
 * V1 精确对照: ProfitAnalyzerBase._calculate_net_profit() + _accumulate_action_metrics()
 *   → base.py L182-331
 *
 * 所有字段名严格对应 V1 的 metrics[key][field]。
 */
class ProfitMetrics {
    // 数量 (V1: total_qty, cancel_qty, return_qty, request_qty, claim_qty, dispute_qty)
    var totalQty: Double = 0.0
    var cancelQty: Double = 0.0
    var returnQty: Double = 0.0
    var requestQty: Double = 0.0
    var claimQty: Double = 0.0
    var disputeQty: Double = 0.0

    // 金额 (V1: total_rev, cancel_rev, return_rev, request_rev, claim_rev, dispute_rev)
    var totalRev: BigDecimal = BigDecimal.ZERO
    var cancelRev: BigDecimal = BigDecimal.ZERO
    var returnRev: BigDecimal = BigDecimal.ZERO
    var requestRev: BigDecimal = BigDecimal.ZERO
    var claimRev: BigDecimal = BigDecimal.ZERO
    var disputeRev: BigDecimal = BigDecimal.ZERO

    // 成本 (V1: cog_value — 负数)
    var cogValue: BigDecimal = BigDecimal.ZERO

    // 费用 (V1: FeeBreakdown accumulated via _accumulate_fees)
    val fees: FeeBreakdown = FeeBreakdown()

    // Listing specific
    var title: String = ""

    // ═══ Computed Fields (V1: _calculate_net_profit) ═══

    /**
     * V1 parity: base.py L299-306
     * net_qty = total_qty - cancel_qty
     *     - return_qty * R['RETURN'] - request_qty * R['REQUEST']
     *     - claim_qty * R['CASE'] - dispute_qty * R['DISPUTE']
     */
    fun netQty(config: ReportConfig): Double {
        return totalQty - cancelQty -
            returnQty * config.lrReturn -
            requestQty * config.lrRequest -
            claimQty * config.lrCase -
            disputeQty * config.lrDispute
    }

    /**
     * V1 parity: base.py L307-310
     * net_rev = total_rev + cancel_rev + return_rev + request_rev + claim_rev + dispute_rev
     * (cancel/return/claim/dispute revs are negative or refund amounts)
     */
    val netRev: BigDecimal get() = totalRev + cancelRev + returnRev + requestRev + claimRev + disputeRev

    /**
     * V1 parity: base.py L326-330
     * profit = net_rev + cog_value + net_shipping + net_platform_fee
     *        + net_high_return_fee + net_low_rating_fee + net_third_party_fee
     *        + net_ad_fee + net_postage_cost + net_return_postage
     */
    val profit: BigDecimal
        get() = netRev + cogValue + fees.netShipping +
            fees.netPlatformFee + fees.netHighReturnFee + fees.netLowRatingFee +
            fees.netThirdPartyFee +
            fees.netAdFee + fees.netPostageCost + fees.netReturnPostage
}

/**
 * ProfitReportBuilder — 生成 V1 标准的 6 张报表 (A1-A3, B1-B3)。
 *
 * V1 精确对照: ProfitAnalyzerBase.generate_full_report_suite() → base.py L333-363
 *
 * A1: 数量表 → raw counts per key
 * A2: 数量占比表 → each cell / total_qty
 * A3: 数量结构环比表 → (cur% - prev%) / prev%
 * B1: 金额表 → financial breakdown per key
 * B2: 金额占比表 → each cell / total_rev
 * B3: 费用结构环比表
 */
class ProfitReportBuilder(private val config: ReportConfig) {

    /**
     * V1 parity: generate_full_report_suite() → base.py L333-363
     */
    fun build(
        metricsCur: Map<String, ProfitMetrics>,
        metricsPrev: Map<String, ProfitMetrics>,
        keyName: String
    ): List<Pair<String, CsvTable>> {
        // V1: map_a (数量表列), map_b (金额表列)
        val mapA = linkedMapOf(
            "总销量" to { m: ProfitMetrics -> m.totalQty },
            "总取消数" to { m: ProfitMetrics -> m.cancelQty },
            "总退货数(无平台介入)" to { m: ProfitMetrics -> m.returnQty },
            "总退货数(平台介入)" to { m: ProfitMetrics -> m.requestQty },
            "总退货数(平台强制退款)" to { m: ProfitMetrics -> m.claimQty },
            "强制退货(仅退款)" to { m: ProfitMetrics -> m.disputeQty },
            "净销售" to { m: ProfitMetrics -> m.netQty(config) },
        )

        val mapB = linkedMapOf<String, (ProfitMetrics) -> Any>(
            "总销售额" to { m -> m.totalRev.r() },
            "总取消额" to { m -> m.cancelRev.r() },
            "总退货额(无平台介入)" to { m -> m.returnRev.r() },
            "总退货额(平台介入)" to { m -> m.requestRev.r() },
            "总退货额(平台强制退款)" to { m -> m.claimRev.r() },
            "强制退款(仅退款)" to { m -> m.disputeRev.r() },
            "净销售" to { m -> m.netRev.r() },
            "净销售产品成本" to { m -> m.cogValue.r() },
            "净买家支付邮费" to { m -> m.fees.netShipping.r() },
            "净销售税" to { m -> m.fees.netTax.r() },
            "净固定平台费用" to { m -> m.fees.netPlatformFee.r() },
            "净高退货产品罚款" to { m -> m.fees.netHighReturnFee.r() },
            "净低账户评级罚款" to { m -> m.fees.netLowRatingFee.r() },
            "净第三方投诉罚款" to { m -> m.fees.netThirdPartyFee.r() },
            "净广告开销" to { m -> m.fees.netAdFee.r() },
            "退货包邮费用" to { m -> m.fees.netReturnPostage.r() },
            "净邮费支出" to { m -> m.fees.netPostageCost.r() },
            "盈亏" to { m -> m.profit.r() },
        )

        fun buildTable(metrics: Map<String, ProfitMetrics>, mapping: LinkedHashMap<String, (ProfitMetrics) -> Any>): CsvTable {
            val headers = listOf(keyName) + mapping.keys.toList()
            val rows = metrics.keys.sorted().map { key ->
                val m = metrics[key]!!
                listOf<Any?>(key) + mapping.values.map { fn -> fn(m) }
            }
            return CsvTable(headers, rows)
        }

        val dfA1 = buildTable(metricsCur, mapA.mapValues { (_, fn) -> { m: ProfitMetrics -> fn(m) } } as LinkedHashMap<String, (ProfitMetrics) -> Any>)
        val dfPA1 = buildTable(metricsPrev, mapA.mapValues { (_, fn) -> { m: ProfitMetrics -> fn(m) } } as LinkedHashMap<String, (ProfitMetrics) -> Any>)
        val dfB1 = buildTable(metricsCur, mapB)
        val dfPB1 = buildTable(metricsPrev, mapB)

        val dfA2 = calcPctTable(dfA1, "总销量")
        val dfA3 = calcMomTable(calcPctRaw(dfA1, "总销量"), calcPctRaw(dfPA1, "总销量"), keyName)
        val dfB2 = calcPctTable(dfB1, "总销售额")
        val dfB3 = calcMomTable(calcPctRaw(dfB1, "总销售额"), calcPctRaw(dfPB1, "总销售额"), keyName)

        return listOf(
            "A1_数量表" to dfA1,
            "A2_数量占比表" to dfA2,
            "A3_数量结构环比表" to dfA3,
            "B1_金额表" to dfB1,
            "B2_金额占比表" to dfB2,
            "B3_费用结构环比表" to dfB3,
        )
    }

    /**
     * V1 parity: _calc_pct() → base.py L365-371
     * Returns formatted percentage strings.
     */
    private fun calcPctTable(table: CsvTable, baseCol: String): CsvTable {
        val baseIdx = table.headers.indexOf(baseCol)
        if (baseIdx < 0) return table

        val newRows = table.rows.map { row ->
            val baseVal = toDouble(row[baseIdx])
            row.mapIndexed { idx, cell ->
                if (idx == 0 || idx == baseIdx) {
                    if (idx == baseIdx) "100.00%" else cell
                } else {
                    if (baseVal == 0.0) "0.00%"
                    else "%.2f%%".format(toDouble(cell) / baseVal * 100)
                }
            }
        }
        return CsvTable(table.headers, newRows)
    }

    /** Raw pct values (not formatted) for MoM calculation */
    private fun calcPctRaw(table: CsvTable, baseCol: String): CsvTable {
        val baseIdx = table.headers.indexOf(baseCol)
        if (baseIdx < 0) return table

        val newRows = table.rows.map { row ->
            val baseVal = toDouble(row[baseIdx])
            row.mapIndexed { idx, cell ->
                if (idx == 0) cell
                else if (baseVal == 0.0) 0.0
                else toDouble(cell) / baseVal
            }
        }
        return CsvTable(table.headers, newRows)
    }

    /**
     * V1 parity: _calc_mom() → base.py L380-403
     * MoM% = (v1 - v0) / |v0|
     */
    private fun calcMomTable(cur: CsvTable, prev: CsvTable, keyCol: String): CsvTable {
        val prevMap = mutableMapOf<Any?, List<Any?>>()
        for (row in prev.rows) {
            prevMap[row[0]] = row
        }

        val newRows = cur.rows.map { row ->
            val key = row[0]
            val prevRow = prevMap[key]
            row.mapIndexed { idx, cell ->
                if (idx == 0) cell
                else if (prevRow == null) "New"
                else {
                    val v1 = toDouble(cell)
                    val v0 = toDouble(prevRow.getOrNull(idx))
                    if (v0 == 0.0) "N/A"
                    else "%.2f%%".format((v1 - v0) / kotlin.math.abs(v0) * 100)
                }
            }
        }
        return CsvTable(cur.headers, newRows)
    }

    private fun toDouble(v: Any?): Double {
        return when (v) {
            null -> 0.0
            is Number -> v.toDouble()
            is String -> v.trimEnd('%').toDoubleOrNull() ?: 0.0
            else -> 0.0
        }
    }

    private fun BigDecimal.r(): BigDecimal = this.setScale(2, RoundingMode.HALF_UP)
}
