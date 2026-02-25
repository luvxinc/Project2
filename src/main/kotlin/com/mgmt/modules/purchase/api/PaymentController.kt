package com.mgmt.modules.purchase.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.response.PageMeta
import com.mgmt.common.response.PagedResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.auth.JwtTokenProvider
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.application.usecase.PaymentUseCase
import com.mgmt.modules.purchase.domain.model.Payment
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

/**
 * PaymentController — Unified payment REST API.
 *
 * Endpoints filter by paymentType query param.
 */
@RestController
@RequestMapping("/purchase/payments")
class PaymentController(
    private val paymentUseCase: PaymentUseCase,
) {

    @GetMapping
    @RequirePermission("module.purchase.po")
    fun findAll(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) paymentType: String?,
        @RequestParam(required = false) poId: Long?,
        @RequestParam(required = false) poNum: String?,
        @RequestParam(required = false) supplierCode: String?,
    ): ResponseEntity<Any> {
        val params = PaymentQueryParams(
            page = page, limit = limit,
            paymentType = paymentType, poId = poId, poNum = poNum, supplierCode = supplierCode,
        )
        val (payments, total) = paymentUseCase.findAll(params)
        val effectiveLimit = maxOf(1, minOf(limit, 100))

        return ResponseEntity.ok(PagedResponse(
            data = payments.map { toResponse(it) },
            meta = PageMeta.of(page, effectiveLimit, total),
        ))
    }

    @GetMapping("/{id}")
    @RequirePermission("module.purchase.po")
    fun findOne(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(toResponse(paymentUseCase.findOne(id))))

    @PostMapping
    @RequirePermission("module.purchase.po.add")
    @SecurityLevel(level = "L3", actionKey = "btn_add_payment")
    @AuditLog(module = "PURCHASE", action = "CREATE_PAYMENT", riskLevel = "HIGH")
    fun create(@RequestBody dto: CreatePaymentRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.ok(toResponse(paymentUseCase.create(dto, currentUsername()))))

    @DeleteMapping("/{id}")
    @RequirePermission("module.purchase.po.mgmt")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_payment")
    @AuditLog(module = "PURCHASE", action = "DELETE_PAYMENT", riskLevel = "HIGH")
    fun delete(@PathVariable id: Long): ResponseEntity<Any> =
        ResponseEntity.ok(ApiResponse.ok(mapOf("success" to paymentUseCase.softDelete(id, currentUsername()))))

    // ═══════════ Helpers ═══════════

    private fun toResponse(p: Payment) = PaymentResponse(
        id = p.id, paymentType = p.paymentType, paymentNo = p.paymentNo,
        poId = p.poId, poNum = p.poNum,
        shipmentId = p.shipmentId, logisticNum = p.logisticNum,
        supplierId = p.supplierId, supplierCode = p.supplierCode,
        paymentDate = p.paymentDate, currency = p.currency,
        cashAmount = p.cashAmount.toDouble(), prepayAmount = p.prepayAmount.toDouble(),
        exchangeRate = p.exchangeRate.toDouble(), rateMode = p.rateMode,
        extraAmount = p.extraAmount.toDouble(), extraCurrency = p.extraCurrency,
        extraNote = p.extraNote, prepayTranType = p.prepayTranType,
        depositOverride = p.depositOverride,
        note = p.note,
        createdAt = p.createdAt, updatedAt = p.updatedAt,
    )

    private fun currentUsername(): String {
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims
        return claims?.username ?: "system"
    }
}
