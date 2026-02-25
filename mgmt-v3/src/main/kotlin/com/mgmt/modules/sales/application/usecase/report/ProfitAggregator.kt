package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * ProfitAggregator — 共享的利润聚合逻辑。
 *
 * V1 中 Listing/Combo 的 _aggregate() 逻辑几乎完全相同：
 *   - 按 key 分组（Item ID / Full SKU）
 *   - weight = 1.0（无分摊）
 *   - 使用基类的 _accumulate_action_metrics + _calculate_row_cost + _accumulate_fees
 *
 * SKU 利润分析器有独特的按成本权重分摊逻辑，不使用此聚合器。
 *
 * 对应 V1 代码:
 *   - profit_listing.py L28-59   (Listing _aggregate)
 *   - profit_combo.py L28-55     (Combo _aggregate)
 */
object ProfitAggregator {

    /**
     * 按指定 key 聚合交易数据，weight = 1.0。
     *
     * V1 parity: profit_listing.py _aggregate / profit_combo.py _aggregate
     * 唯一的差异是 keyExtractor 返回的值不同。
     *
     * @param transactions 清洗后的交易数据
     * @param skuCostMap SKU → 单位成本
     * @param keyExtractor 从交易行提取聚合 key 的函数
     * @param titleExtractor 可选，提取 title 的函数（Listing 用）
     */
    fun aggregate(
        transactions: List<CleanedTransaction>,
        skuCostMap: Map<String, BigDecimal>,
        keyExtractor: (CleanedTransaction) -> String?,
        titleExtractor: ((CleanedTransaction) -> String?)? = null,
    ): Map<String, ProfitMetrics> {
        val metrics = mutableMapOf<String, ProfitMetrics>()

        for (tx in transactions) {
            val rawKey = keyExtractor(tx) ?: continue
            val key = rawKey.trim().uppercase().replace(".0", "")
            if (key.isBlank() || key == "0") continue

            val m = metrics.getOrPut(key) { ProfitMetrics() }

            // V1 parity: 记录 Title (profit_listing.py L40-41)
            if (titleExtractor != null && m.title.isBlank()) {
                m.title = (titleExtractor(tx) ?: "").trim()
            }

            val qtySets = tx.quantity
            val action = tx.action
            val revenue = tx.saleAmount
            val refund = tx.refundAmount
            val weight = BigDecimal.ONE

            // V1 parity: _accumulate_action_metrics (base.py L182-221, weight=1.0)
            accumulateActionMetrics(m, action, qtySets.toDouble(), revenue, refund, weight)

            // V1 parity: _calculate_row_cost (base.py L223-260, include_special_sku=true)
            val rowCost = calculateRowCost(tx, qtySets, skuCostMap, includeSpecialSku = true)
            m.cogValue += -rowCost  // V1: cog_value += -row_cost (成本是负支出)

            // V1 parity: _accumulate_fees (base.py L172-176, weight=1.0)
            m.fees.addFrom(tx, weight)
        }
        return metrics
    }

    /**
     * SKU 级聚合（按成本权重分摊）。
     *
     * V1 精确对照: profit_sku.py _aggregate() L30-120
     *
     * 关键差异: revenue/refund/fees 按 "该 SKU 成本占订单总成本的比例" 分摊。
     */
    fun aggregateBySku(
        transactions: List<CleanedTransaction>,
        skuCostMap: Map<String, BigDecimal>,
    ): Map<String, ProfitMetrics> {
        val metrics = mutableMapOf<String, ProfitMetrics>()

        for (tx in transactions) {
            val qtySets = tx.quantity
            val action = tx.action
            val revenue = tx.saleAmount
            val refund = tx.refundAmount

            // V1 parity: profit_sku.py L43-69
            // 1. 解析当前行包含的所有 SKU 及其价值
            val skuSlots = tx.extractSkuSlots()
            if (skuSlots.isEmpty()) continue

            val skuUnits = mutableMapOf<String, Double>()
            val skuValues = mutableMapOf<String, BigDecimal>()
            var orderTotalCost = BigDecimal.ZERO

            for (slot in skuSlots) {
                val units = (slot.perQty * qtySets).toDouble()
                val unitCost = skuCostMap[slot.sku] ?: BigDecimal.ZERO
                val value = unitCost * BigDecimal.valueOf(units)

                skuUnits[slot.sku] = units
                skuValues[slot.sku] = value
                orderTotalCost += value
            }

            // V1 parity: profit_sku.py L73-78
            // 防御：如果总成本为0，按数量均摊
            if (orderTotalCost.compareTo(BigDecimal.ZERO) == 0) {
                val totalUnits = skuUnits.values.sum()
                for ((sku, units) in skuUnits) {
                    skuValues[sku] = BigDecimal.valueOf(units)
                }
                orderTotalCost = BigDecimal.valueOf(totalUnits)
            }

            // V1 parity: profit_sku.py L81-118
            for ((sku, units) in skuUnits) {
                val m = metrics.getOrPut(sku) { ProfitMetrics() }

                // 计算分摊权重
                val w = if (orderTotalCost.compareTo(BigDecimal.ZERO) > 0) {
                    skuValues[sku]!!.divide(orderTotalCost, 10, RoundingMode.HALF_UP)
                } else {
                    BigDecimal.ZERO
                }

                // 累加数量（不分摊）
                accumulateActionMetrics(m, action, units, revenue, refund, w)

                // 累加成本（直接计算，不分摊）
                val unitCost = skuCostMap[sku] ?: BigDecimal.ZERO
                m.cogValue += -(unitCost * BigDecimal.valueOf(units))

                // 累加费用（按权重分摊）
                m.fees.addFrom(tx, w)
            }
        }
        return metrics
    }

    /**
     * V1 parity: base.py L182-221 _accumulate_action_metrics
     */
    private fun accumulateActionMetrics(
        m: ProfitMetrics,
        action: SalesAction,
        qty: Double,
        revenue: BigDecimal,
        refund: BigDecimal,
        weight: BigDecimal,
    ) {
        m.totalQty += qty
        when (action) {
            SalesAction.CA -> { m.cancelQty += qty; m.cancelRev += refund * weight }
            SalesAction.RE -> { m.returnQty += qty; m.returnRev += refund * weight }
            SalesAction.CR -> { m.requestQty += qty; m.requestRev += refund * weight }
            SalesAction.CC -> { m.claimQty += qty; m.claimRev += refund * weight }
            SalesAction.PD -> { m.disputeQty += qty; m.disputeRev += refund * weight }
            SalesAction.NN -> { /* NN: only totalQty accumulated above */ }
        }
        m.totalRev += revenue * weight
    }

    /**
     * V1 parity: base.py L223-260 _calculate_row_cost
     *
     * 计算单行的总成本。
     * includeSpecialSku: NU1C8E51C/K → +NU1C8SKT7 成本 × 2
     */
    private fun calculateRowCost(
        tx: CleanedTransaction,
        qtySets: Int,
        skuCostMap: Map<String, BigDecimal>,
        includeSpecialSku: Boolean,
    ): BigDecimal {
        var totalCost = BigDecimal.ZERO
        val slots = tx.extractSkuSlots()

        for (slot in slots) {
            val unitCost = skuCostMap[slot.sku] ?: BigDecimal.ZERO
            totalCost += unitCost * BigDecimal.valueOf((slot.perQty * qtySets).toLong())

            // V1 parity: base.py L256-258
            if (includeSpecialSku && slot.sku in SpecialSkuRules.SOURCE_SKUS) {
                val extraCost = skuCostMap[SpecialSkuRules.TARGET_SKU] ?: BigDecimal.ZERO
                totalCost += extraCost * BigDecimal.valueOf((2 * qtySets).toLong())
            }
        }
        return totalCost
    }
}
