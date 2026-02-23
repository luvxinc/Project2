package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.model.PaymentEvent
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.POPaymentRepository
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.SupplierStrategyRepository
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate

/**
 * POPaymentUseCase — PO payment (balance payment) submit and delete.
 *
 * Key differences from DepositPaymentUseCase:
 *   - pmt_no format: PPMT_YYYYMMDD_N## (not DPMT)
 *   - paymentType = "po" (not "deposit")
 *   - Balance = totalAmount - depositPaid - poPaid (not depositAmount - paid)
 *   - Prepay link note: "POPAY_{pmtNo}_原始记录"
 */
@Service
class POPaymentUseCase(
    private val poPaymentRepository: POPaymentRepository,
    private val depositPaymentRepository: DepositPaymentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
    private val supplierStrategyRepository: SupplierStrategyRepository,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Submit PO payment (balance payment).
     */
    @Transactional
    fun submitPayment(request: SubmitPOPaymentRequest, username: String): SubmitPOPaymentResponse {
        require(request.poNums.isNotEmpty()) { "po_nums must not be empty" }
        require(request.paymentDate.isNotBlank()) { "payment_date must not be empty" }

        val paymentDate = LocalDate.parse(request.paymentDate)
        val tranDateStr = request.paymentDate.replace("-", "")  // YYYYMMDD

        val itemMap = request.items.associateBy { it.poNum }

        data class OrderInfo(
            val poNum: String,
            val supplierCode: String,
            val currency: String,
            val exchangeRate: BigDecimal,
            val totalAmount: BigDecimal,
            val depositPaid: BigDecimal,
            val poPaid: BigDecimal,
        )

        val orders = mutableListOf<OrderInfo>()
        for (poNum in request.poNums) {
            val strategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum)
                ?: continue
            val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val totalAmount = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
            val supplierCode = poNum.take(2).uppercase()

            // Get existing deposit paid
            val depositPayments = depositPaymentRepository.findByPoNumActive(poNum)
            val depositPaid = depositPayments.sumOf { it.cashAmount.add(it.prepayAmount) }

            // Get existing PO paid
            val poPayments = poPaymentRepository.findByPoNumActive(poNum)
            val poPaid = poPayments.sumOf { it.cashAmount.add(it.prepayAmount) }

            orders.add(OrderInfo(
                poNum = poNum,
                supplierCode = supplierCode,
                currency = strategy.currency,
                exchangeRate = strategy.exchangeRate,
                totalAmount = totalAmount,
                depositPaid = depositPaid,
                poPaid = poPaid,
            ))
        }

        if (orders.isEmpty()) {
            throw IllegalArgumentException("No valid orders found")
        }

        // Generate pmt_no: PPMT_{YYYYMMDD}_N##
        val pmtPrefix = "PPMT_${tranDateStr}_N%"
        val latestNos = poPaymentRepository.findLatestPaymentNoForDate(pmtPrefix, PageRequest.of(0, 1))
        val pmtNo = if (latestNos.isEmpty()) {
            "PPMT_${tranDateStr}_N01"
        } else {
            val lastNo = latestNos[0]
            try {
                val lastSeq = lastNo.substringAfterLast("_N").toInt()
                "PPMT_${tranDateStr}_N${(lastSeq + 1).toString().padStart(2, '0')}"
            } catch (_: Exception) {
                "PPMT_${tranDateStr}_N01"
            }
        }

        log.info("[POPayment] Generated pmt_no: {}", pmtNo)

        // Extra fee split
        val extraFee = request.extraFee?.toDouble() ?: 0.0
        val orderCount = orders.size
        val avgExtraFee = if (extraFee > 0 && orderCount > 0) extraFee / orderCount else 0.0

        var insertCount = 0
        var prepayInsertCount = 0
        val generatedPmtNos = mutableListOf<String>()

        for (order in orders) {
            val poNum = order.poNum
            val uItem = itemMap[poNum]

            // Determine exchange rate
            val rate = if (request.usePaymentDateRate && request.settlementRate != null
                && request.settlementRate > BigDecimal.ZERO) {
                request.settlementRate
            } else {
                order.exchangeRate
            }

            val poCurMode = if (request.usePaymentDateRate) "auto" else "manual"

            // Determine payment currency and amount
            val poCur: String
            val poPaid: BigDecimal
            val paymentMode = uItem?.paymentMode ?: "original"

            if (paymentMode == "custom") {
                poCur = uItem?.customCurrency ?: order.currency
                poPaid = uItem?.customAmount ?: BigDecimal.ZERO
            } else {
                poCur = order.currency
                // Original mode: calculate remaining balance (totalAmount - depositPaid - poPaid)
                val remaining = order.totalAmount.subtract(order.depositPaid).subtract(order.poPaid)
                poPaid = remaining.max(BigDecimal.ZERO)
            }

            // Prepay amount
            val poPrepayAmount = uItem?.prepayAmount ?: BigDecimal.ZERO

            // Override flag
            val poOverride = uItem?.coverStandard ?: false

            // Extra fee for this order
            val cfExtraAmount: BigDecimal
            val cfExtraCur: String
            val cfExtraNote: String
            if (avgExtraFee > 0) {
                cfExtraAmount = BigDecimal.valueOf(avgExtraFee)
                cfExtraCur = request.extraFeeCurrency ?: ""
                cfExtraNote = request.extraFeeNote ?: ""
            } else {
                cfExtraAmount = BigDecimal.ZERO
                cfExtraCur = ""
                cfExtraNote = ""
            }

            // Skip condition
            if (poPaid <= BigDecimal("0.001")
                && poPrepayAmount <= BigDecimal("0.001")
                && cfExtraAmount <= BigDecimal.ZERO) {
                continue
            }

            // Create Payment record
            val now = Instant.now()
            val payment = Payment(
                paymentType = "po",
                paymentNo = pmtNo,
                poNum = poNum,
                paymentDate = paymentDate,
                currency = poCur,
                cashAmount = poPaid,
                prepayAmount = poPrepayAmount,
                exchangeRate = rate,
                rateMode = poCurMode,
                extraAmount = cfExtraAmount,
                extraCurrency = if (cfExtraCur.isNotBlank()) cfExtraCur else null,
                extraNote = if (cfExtraNote.isNotBlank()) cfExtraNote else null,
                depositOverride = poOverride,
                note = "原始货款单",
                createdAt = now,
                updatedAt = now,
                createdBy = username,
                updatedBy = username,
            )
            val saved = poPaymentRepository.save(payment)

            // Create PaymentEvent
            val snapshot = mapOf(
                "poNum" to poNum,
                "cashAmount" to saved.cashAmount.toPlainString(),
                "prepayAmount" to saved.prepayAmount.toPlainString(),
                "currency" to saved.currency,
                "exchangeRate" to saved.exchangeRate.toPlainString(),
                "rateMode" to saved.rateMode,
                "depositOverride" to saved.depositOverride.toString(),
                "extraAmount" to saved.extraAmount.toPlainString(),
                "extraCurrency" to (saved.extraCurrency ?: ""),
                "extraNote" to (saved.extraNote ?: ""),
                "paymentDate" to saved.paymentDate.toString(),
            )
            val event = PaymentEvent(
                paymentId = saved.id,
                paymentNo = pmtNo,
                eventType = "CREATE",
                eventSeq = 1,
                changes = objectMapper.writeValueAsString(snapshot),
                note = "原始货款单",
                operator = username,
            )
            paymentEventRepository.save(event)

            insertCount++
            if (pmtNo !in generatedPmtNos) {
                generatedPmtNos.add(pmtNo)
            }

            // Create prepay usage record if prepayAmount > 0.001
            if (poPrepayAmount > BigDecimal("0.001")) {
                createPrepayUsageRecord(
                    pmtNo = pmtNo,
                    supplierCode = order.supplierCode,
                    paymentDate = paymentDate,
                    tranDateStr = tranDateStr,
                    orderCurrency = order.currency,
                    rate = rate,
                    poCurMode = poCurMode,
                    prepayAmount = poPrepayAmount,
                    username = username,
                )
                prepayInsertCount++
            }
        }

        if (insertCount == 0) {
            return SubmitPOPaymentResponse(
                pmtNos = emptyList(),
                count = 0,
                prepayCount = 0,
                message = "finance.poPayment.messages.noRecordsCreated",
            )
        }

        log.info("[POPayment] Created {} PO payment records, {} prepay records", insertCount, prepayInsertCount)

        return SubmitPOPaymentResponse(
            pmtNos = generatedPmtNos,
            count = insertCount,
            prepayCount = prepayInsertCount,
            message = "finance.poPayment.messages.paymentSuccess",
        )
    }

    /**
     * Delete PO payment.
     */
    @Transactional
    fun deletePayment(paymentNo: String, username: String): DeletePOPaymentResponse {
        require(paymentNo.isNotBlank()) { "payment_no must not be empty" }

        val payments = poPaymentRepository.findActiveByPaymentNo(paymentNo)
        require(payments.isNotEmpty()) { "No active payments found for $paymentNo" }

        val now = Instant.now()
        var affectedCount = 0

        for (payment in payments) {
            // Soft delete
            payment.deletedAt = now
            payment.updatedAt = now
            payment.updatedBy = username
            poPaymentRepository.save(payment)

            // Create DELETE event
            val eventSeq = paymentEventRepository.findMaxEventSeq(payment.id) + 1
            val event = PaymentEvent(
                paymentId = payment.id,
                paymentNo = paymentNo,
                eventType = "DELETE",
                eventSeq = eventSeq,
                changes = objectMapper.writeValueAsString(mapOf(
                    "deletedAt" to now.toString(),
                    "poNum" to (payment.poNum ?: ""),
                )),
                note = "删除订单付款",
                operator = username,
            )
            paymentEventRepository.save(event)

            // Prepay restoration
            if (payment.prepayAmount > BigDecimal("0")) {
                restorePrepayBalance(
                    pmtNo = paymentNo,
                    payment = payment,
                    username = username,
                )
            }

            affectedCount++
        }

        return DeletePOPaymentResponse(
            pmtNo = paymentNo,
            affectedCount = affectedCount,
            message = "finance.poPayment.messages.paymentDeleted",
        )
    }

    // ═══════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════

    private fun createPrepayUsageRecord(
        pmtNo: String,
        supplierCode: String,
        paymentDate: LocalDate,
        tranDateStr: String,
        orderCurrency: String,
        rate: BigDecimal,
        poCurMode: String,
        prepayAmount: BigDecimal,
        username: String,
    ) {
        val outPattern = "${supplierCode}_${tranDateStr}_out_%"
        val latestNos = poPaymentRepository.findLatestPrepayNoForPattern(outPattern, PageRequest.of(0, 1))
        val tranNum = if (latestNos.isEmpty()) {
            "${supplierCode}_${tranDateStr}_out_01"
        } else {
            val lastNo = latestNos[0]
            try {
                val lastSeq = lastNo.substringAfterLast("_").toInt()
                "${supplierCode}_${tranDateStr}_out_${(lastSeq + 1).toString().padStart(2, '0')}"
            } catch (_: Exception) {
                "${supplierCode}_${tranDateStr}_out_01"
            }
        }

        val supplierStrategy = supplierStrategyRepository
            .findFirstBySupplierCodeAndEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(
                supplierCode, paymentDate
            )
        val tranCurrReq = supplierStrategy?.currency ?: "RMB"

        val now = Instant.now()
        val prepayPayment = Payment(
            paymentType = "prepay",
            paymentNo = tranNum,
            supplierCode = supplierCode,
            paymentDate = paymentDate,
            currency = orderCurrency,
            cashAmount = prepayAmount,
            prepayAmount = BigDecimal.ZERO,
            exchangeRate = rate,
            rateMode = poCurMode,
            prepayTranType = "usage",
            tranCurrReq = tranCurrReq,
            note = "POPAY_${pmtNo}_原始记录",
            createdAt = now,
            updatedAt = now,
            createdBy = username,
            updatedBy = username,
        )
        val savedPrepay = poPaymentRepository.save(prepayPayment)

        val snapshot = mapOf(
            "supplierCode" to supplierCode,
            "tranCurrReq" to tranCurrReq,
            "currency" to orderCurrency,
            "cashAmount" to prepayAmount.toPlainString(),
            "exchangeRate" to rate.toPlainString(),
            "tranType" to "usage",
        )
        val event = PaymentEvent(
            paymentId = savedPrepay.id,
            paymentNo = tranNum,
            eventType = "CREATE",
            eventSeq = 1,
            changes = objectMapper.writeValueAsString(snapshot),
            note = "POPAY_${pmtNo}_原始记录",
            operator = username,
        )
        paymentEventRepository.save(event)

        log.info("[POPayment] Created prepay usage record {} for {}", tranNum, pmtNo)
    }

    @Suppress("unused_parameter")
    private fun restorePrepayBalance(
        pmtNo: String,
        payment: Payment,
        username: String,
    ) {
        val notePattern = "POPAY_${pmtNo}%"
        val originalPrepays = poPaymentRepository.findPrepayUsageByPOPaymentNote(notePattern)
        if (originalPrepays.isEmpty()) {
            log.warn("[POPayment] No prepay usage records found for {}", pmtNo)
            return
        }

        val origPrepay = originalPrepays.first()
        val supplierCode = origPrepay.supplierCode ?: return

        val dateStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)
        val inPattern = "${supplierCode}_${dateStr}_in_%"
        val latestNos = poPaymentRepository.findLatestPrepayNoForPattern(inPattern, PageRequest.of(0, 1))
        val tranNum = if (latestNos.isEmpty()) {
            "${supplierCode}_${dateStr}_in_01"
        } else {
            val lastNo = latestNos[0]
            try {
                val lastSeq = lastNo.substringAfterLast("_").toInt()
                "${supplierCode}_${dateStr}_in_${(lastSeq + 1).toString().padStart(2, '0')}"
            } catch (_: Exception) {
                "${supplierCode}_${dateStr}_in_01"
            }
        }

        val now = Instant.now()
        val restorePayment = Payment(
            paymentType = "prepay",
            paymentNo = tranNum,
            supplierCode = supplierCode,
            paymentDate = origPrepay.paymentDate,
            currency = origPrepay.currency,
            cashAmount = origPrepay.cashAmount,
            prepayAmount = BigDecimal.ZERO,
            exchangeRate = origPrepay.exchangeRate,
            rateMode = origPrepay.rateMode,
            prepayTranType = "deposit",
            tranCurrReq = origPrepay.tranCurrReq,
            note = "删除订单付款_${origPrepay.note ?: ""}",
            createdAt = now,
            updatedAt = now,
            createdBy = username,
            updatedBy = username,
        )
        val savedRestore = poPaymentRepository.save(restorePayment)

        val snapshot = mapOf(
            "supplierCode" to supplierCode,
            "tranType" to "deposit",
            "cashAmount" to origPrepay.cashAmount.toPlainString(),
            "originalPmtNo" to pmtNo,
        )
        val event = PaymentEvent(
            paymentId = savedRestore.id,
            paymentNo = tranNum,
            eventType = "CREATE",
            eventSeq = 1,
            changes = objectMapper.writeValueAsString(snapshot),
            note = "删除订单付款_${pmtNo}",
            operator = username,
        )
        paymentEventRepository.save(event)

        log.info("[POPayment] Created prepay restore record {} for deleted {}", tranNum, pmtNo)
    }
}
