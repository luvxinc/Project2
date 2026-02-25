package com.mgmt.modules.sales.application.usecase.report

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * InventorySnapshotAnalyzer — 库存资产快照。
 *
 * V1 精确对照: backend/core/services/inventory_snapshot.py (297行)
 *
 * V1 输出列:
 *   SKU, Category, Actual_Qty, FIFO_Qty, FIFO_Value,
 *   Order_Qty, Order_Value, Transit_Qty, Transit_Value,
 *   Total_Pipeline, Total_Pipeline_Value
 *
 * V1 文件名: Inventory_Asset_Snapshot_{file_suffix}.csv
 *
 * V3 数据源映射:
 *   - V1 Data_COGS → V3 products (sku, category, cogs)
 *   - V1 in_dynamic_fifo_layers → V3 fifo_layers
 *   - V1 in_po_final → V3 purchase_order_items
 *   - V1 in_send_final → V3 shipment_items
 *   - V1 in_receive_final → V3 receive_items
 *   - V1 Data_Inventory → V3 fifo_transactions (computed stock)
 */
@Service
class InventorySnapshotAnalyzer(
    private val reportData: ReportDataRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun run(config: ReportConfig, csvWriter: ReportCsvWriter): AnalyzerResult {
        log.info("📸 开始执行库存资产快照分析...")

        // 1. 获取所有 SKU
        val allProducts = reportData.findAllProductsMeta()
        if (allProducts.isEmpty()) {
            log.warn("⚠️ 无SKU数据，跳过快照生成。")
            return AnalyzerResult("InventorySnapshot", false, error = "无SKU数据")
        }

        // 2. 获取各数据源
        log.info("正在读取库存数据...")
        val actualInv = reportData.findCurrentInventory()
        val fifoData = reportData.findFifoInventoryData()
        val supplyChainData = reportData.findSupplyChainData()

        // 3. 组装结果
        log.info("正在生成快照报表...")
        var totalActualQty = 0
        var totalFifoQty = 0
        var totalFifoValue = BigDecimal.ZERO
        var totalOrderQty = 0
        var totalOrderValue = BigDecimal.ZERO
        var totalTransitQty = 0
        var totalTransitValue = BigDecimal.ZERO

        val headers = listOf(
            "SKU", "Category", "Actual_Qty", "FIFO_Qty", "FIFO_Value",
            "Order_Qty", "Order_Value", "Transit_Qty", "Transit_Value",
            "Total_Pipeline", "Total_Pipeline_Value"
        )

        val rows = allProducts.sortedBy { it.sku }.map { product ->
            val sku = product.sku.trim().uppercase()

            val aQty = actualInv[sku] ?: 0
            val fifo = fifoData[sku]
            val fQty = fifo?.qty ?: 0
            val fVal = fifo?.value ?: BigDecimal.ZERO
            val sc = supplyChainData[sku]
            val oQty = sc?.orderQty ?: 0
            val oVal = sc?.orderValue ?: BigDecimal.ZERO
            val tQty = sc?.transitQty ?: 0
            val tVal = sc?.transitValue ?: BigDecimal.ZERO

            totalActualQty += aQty
            totalFifoQty += fQty
            totalFifoValue += fVal
            totalOrderQty += oQty
            totalOrderValue += oVal
            totalTransitQty += tQty
            totalTransitValue += tVal

            listOf<Any?>(
                sku, product.category ?: "",
                aQty, fQty, fVal.r(5),
                oQty, oVal.r(5), tQty, tVal.r(5),
                fQty + oQty + tQty,
                (fVal + oVal + tVal).r(5),
            )
        }.sortedByDescending { (it[10] as BigDecimal).toDouble() }

        val totalPipeline = totalFifoQty + totalOrderQty + totalTransitQty
        val totalPipelineValue = totalFifoValue + totalOrderValue + totalTransitValue

        val footer = listOf(
            "📘 库存资产快照说明:",
            "1. 实际库存数量 (Actual): %,d".format(totalActualQty),
            "2. FIFO理论库存: %,d 件, 价值 $%,.2f".format(totalFifoQty, totalFifoValue),
            "3. 下订数量: %,d 件, 价值 $%,.2f".format(totalOrderQty, totalOrderValue),
            "4. 在途数量: %,d 件, 价值 $%,.2f".format(totalTransitQty, totalTransitValue),
            "5. 总Pipeline: %,d 件".format(totalPipeline),
            "6. 总Pipeline价值: $%,.2f".format(totalPipelineValue),
            "",
            "字段说明:",
            "- Actual_Qty: 实际盘点库存",
            "- FIFO_Qty/Value: 理论库存及landed_price价值",
            "- Order_Qty/Value: 已下单未发货 (PO - Sent)",
            "- Transit_Qty/Value: 已发货未收货 (Sent - Received)",
            "- Total_Pipeline: FIFO + 下订 + 在途",
        )

        val filename = "Inventory_Asset_Snapshot_${config.fileSuffix}.csv"
        val path = csvWriter.saveCsv(headers, rows, filename, footer)
        return if (path != null) {
            log.info("✅ 库存快照已生成 (Pipeline Value: \$%,.2f)".format(totalPipelineValue))
            AnalyzerResult("InventorySnapshot", true, 1, listOf(filename))
        } else {
            AnalyzerResult("InventorySnapshot", false, error = "CSV写入失败")
        }
    }

    private fun BigDecimal.r(scale: Int) = this.setScale(scale, RoundingMode.HALF_UP)
}
