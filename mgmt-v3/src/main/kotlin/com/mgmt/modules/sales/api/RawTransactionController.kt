package com.mgmt.modules.sales.api

import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.application.usecase.RawTransactionUseCase
import com.mgmt.modules.sales.domain.model.RawTransaction
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * RawTransactionController — 原始交易数据 REST API (只读)。
 *
 * V1 对应: views.py tab_transaction (读 Data_Transaction)
 * ETL 写入 API (Upload/Parse/Transform) 在后续块中实现。
 */
@RestController
@RequestMapping("/api/sales/raw-transactions")
class RawTransactionController(
    private val useCase: RawTransactionUseCase,
) {

    @GetMapping
    @RequirePermission("module.sales.transactions.view")
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) source: String?,
        @RequestParam(required = false) seller: String?,
        @RequestParam(required = false) orderNumber: String?,
        @RequestParam(required = false) uploadBatchId: String?,
    ): ResponseEntity<Map<String, Any>> {
        val params = RawTransactionQueryParams(page, limit, source, seller, orderNumber, uploadBatchId)
        val (items, total) = useCase.findAll(params)
        return ResponseEntity.ok(mapOf(
            "success" to true,
            "data" to items.map { it.toListResponse() },
            "total" to total,
            "page" to page,
            "limit" to limit,
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.sales.transactions.view")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        val tx = useCase.findOne(id)
        return ResponseEntity.ok(mapOf("success" to true, "data" to tx.toDetailResponse()))
    }

    @GetMapping("/by-order/{orderNumber}")
    @RequirePermission("module.sales.transactions.view")
    fun getByOrderNumber(@PathVariable orderNumber: String): ResponseEntity<Map<String, Any>> {
        val txs = useCase.findByOrderNumber(orderNumber)
        return ResponseEntity.ok(mapOf("success" to true, "data" to txs.map { it.toListResponse() }))
    }

    // ═══════════ Mapping ═══════════

    private fun RawTransaction.toListResponse() = RawTransactionResponse(
        id = id, source = source, uploadBatchId = uploadBatchId,
        seller = seller, orderNumber = orderNumber, itemId = itemId,
        orderDate = orderDate, buyer = buyer,
        saleAmount = saleAmount, shippingFee = shippingFee,
        taxAmount = taxAmount, totalAmount = totalAmount,
        itemCount = items.size, createdAt = createdAt,
    )

    private fun RawTransaction.toDetailResponse() = RawTransactionDetailResponse(
        id = id, source = source, uploadBatchId = uploadBatchId,
        seller = seller, orderNumber = orderNumber, itemId = itemId,
        orderDate = orderDate, buyer = buyer,
        saleAmount = saleAmount, shippingFee = shippingFee,
        taxAmount = taxAmount, totalAmount = totalAmount,
        netAmount = netAmount, adFee = adFee,
        promoListing = promoListing, listingFee = listingFee,
        intlFee = intlFee, otherFee = otherFee,
        rowHash = rowHash,
        items = items.map { RawTransactionItemResponse(it.id, it.sku, it.quantity, it.unitPrice) },
        createdAt = createdAt,
    )
}
