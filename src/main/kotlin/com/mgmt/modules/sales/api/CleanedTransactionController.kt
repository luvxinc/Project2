package com.mgmt.modules.sales.api

import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.application.usecase.CleanedTransactionUseCase
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * CleanedTransactionController — 清洗后交易数据 REST API (只读 + 统计)。
 *
 * V1 对应:
 *   - views.py tab_transaction → 展示 Data_Clean_Log 数据
 *   - views.py _get_data_cutoff_date → 最新日期
 *   - views.py _get_db_stats_before → 统计信息
 *   - ETLRepository.get_transactions_by_date → 日期范围查询
 */
@RestController
@RequestMapping("/api/sales/cleaned-transactions")
class CleanedTransactionController(
    private val useCase: CleanedTransactionUseCase,
) {

    @GetMapping
    @RequirePermission("module.sales.transactions")
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) seller: String?,
        @RequestParam(required = false) orderNumber: String?,
        @RequestParam(required = false) action: String?,
        @RequestParam(required = false) dateFrom: String?,
        @RequestParam(required = false) dateTo: String?,
    ): ResponseEntity<Map<String, Any>> {
        val params = CleanedTransactionQueryParams(page, limit, seller, orderNumber, action, dateFrom, dateTo)
        val (items, total) = useCase.findAll(params)
        return ResponseEntity.ok(mapOf(
            "success" to true,
            "data" to items.map { it.toResponse() },
            "total" to total,
            "page" to page,
            "limit" to limit,
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.sales.transactions")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        val tx = useCase.findOne(id)
        return ResponseEntity.ok(mapOf("success" to true, "data" to tx.toResponse()))
    }

    @GetMapping("/by-order/{orderNumber}")
    @RequirePermission("module.sales.transactions")
    fun getByOrderNumber(@PathVariable orderNumber: String): ResponseEntity<Map<String, Any>> {
        val txs = useCase.findByOrderNumber(orderNumber)
        return ResponseEntity.ok(mapOf("success" to true, "data" to txs.map { it.toResponse() }))
    }

    /** V1: _get_db_stats_before + _get_data_cutoff_date */
    @GetMapping("/stats")
    @RequirePermission("module.sales.transactions")
    fun stats(): ResponseEntity<Map<String, Any>> {
        val stats = useCase.getStats()
        return ResponseEntity.ok(mapOf("success" to true, "data" to stats))
    }

    // ═══════════ Mapping ═══════════

    /**
     * V1 Transformer output_cols → CleanedTransactionResponse
     * SKU slots: 只返回非空的 (减少 JSON payload)
     */
    private fun CleanedTransaction.toResponse(): CleanedTransactionResponse {
        val slots = (1..10).mapNotNull { i ->
            val sku = when (i) {
                1 -> sku1; 2 -> sku2; 3 -> sku3; 4 -> sku4; 5 -> sku5
                6 -> sku6; 7 -> sku7; 8 -> sku8; 9 -> sku9; 10 -> sku10
                else -> null
            }
            val qty = when (i) {
                1 -> quantity1; 2 -> quantity2; 3 -> quantity3; 4 -> quantity4; 5 -> quantity5
                6 -> quantity6; 7 -> quantity7; 8 -> quantity8; 9 -> quantity9; 10 -> quantity10
                else -> null
            }
            val qtyp = when (i) {
                1 -> qtyp1; 2 -> qtyp2; 3 -> qtyp3; 4 -> qtyp4; 5 -> qtyp5
                6 -> qtyp6; 7 -> qtyp7; 8 -> qtyp8; 9 -> qtyp9; 10 -> qtyp10
                else -> null
            }
            if (sku != null) SkuSlotResponse(i, sku, qty, qtyp) else null
        }

        return CleanedTransactionResponse(
            id = id, seller = seller, orderNumber = orderNumber,
            itemId = itemId, orderDate = orderDate, action = action.name,
            saleAmount = saleAmount, shippingFee = shippingFee,
            taxAmount = taxAmount, netAmount = netAmount,
            adFee = adFee, otherFee = otherFee,
            skuSlots = slots, createdAt = createdAt,
        )
    }
}
