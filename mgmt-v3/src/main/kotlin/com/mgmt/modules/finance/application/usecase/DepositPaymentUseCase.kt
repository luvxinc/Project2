package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.model.PaymentEvent
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
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
 * DepositPaymentUseCase — deposit payment submit and delete.
 *
 * V1 parity: deposit_payment_submit (api.py:415-719) + deposit_payment_delete_api (api.py:1436-1619)
 *
 * Key business rules:
 *   4. pmt_no format: DPMT_YYYYMMDD_N## (V1: api.py:513-519)
 *   5. Batch payment shares pmt_no (V1: api.py:593)
 *   6. Extra fee evenly split: avgExtraFee = extraFee / orderCount (V1: api.py:525-530)
 *   7. Skip: cash<=0.001 AND prepay<=0.001 AND extra<=0 (V1: api.py:590-591)
 *   8. Prepay deduction creates 'usage' (out) record (V1: api.py:625-679)
 *   9. Delete creates reverse 'deposit' (in) record (V1: api.py:1543-1605)
 *  10. Delete: soft delete + PaymentEvent(DELETE) (V1: new 'delete' ops row)
 */
@Service
class DepositPaymentUseCase(
    private val depositPaymentRepository: DepositPaymentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
    private val supplierStrategyRepository: SupplierStrategyRepository,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Submit deposit payment — V1 parity: deposit_payment_submit (api.py:415-719)
     */
    @Transactional
    fun submitPayment(request: SubmitDepositPaymentRequest, username: String): SubmitDepositPaymentResponse {
        require(request.poNums.isNotEmpty()) { "po_nums must not be empty" }
        require(request.paymentDate.isNotBlank()) { "payment_date must not be empty" }

        val paymentDate = LocalDate.parse(request.paymentDate)
        val tranDateStr = request.paymentDate.replace("-", "")  // YYYYMMDD

        // Build item map (V1: api.py:451)
        val itemMap = request.items.associateBy { it.poNum }

        // Gather order info: strategy + total amount per PO (V1: api.py:476-499)
        data class OrderInfo(
            val poNum: String,
            val supplierCode: String,
            val currency: String,
            val exchangeRate: BigDecimal,
            val depositRatio: BigDecimal,
            val totalAmount: BigDecimal,
        )

        val orders = mutableListOf<OrderInfo>()
        for (poNum in request.poNums) {
            val strategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum)
                ?: continue
            val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val totalAmount = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
            val supplierCode = poNum.take(2).uppercase()

            orders.add(OrderInfo(
                poNum = poNum,
                supplierCode = supplierCode,
                currency = strategy.currency,
                exchangeRate = strategy.exchangeRate,
                depositRatio = strategy.depositRatio,
                totalAmount = totalAmount,
            ))
        }

        if (orders.isEmpty()) {
            throw IllegalArgumentException("No valid orders found")
        }

        // Generate pmt_no: DPMT_{YYYYMMDD}_N## (V1: api.py:512-519)
        val pmtPrefix = "DPMT_${tranDateStr}_N%"
        val latestNos = depositPaymentRepository.findLatestPaymentNoForDate(pmtPrefix, PageRequest.of(0, 1))
        val pmtNo = if (latestNos.isEmpty()) {
            "DPMT_${tranDateStr}_N01"
        } else {
            val lastNo = latestNos[0]
            try {
                val lastSeq = lastNo.substringAfterLast("_N").toInt()
                "DPMT_${tranDateStr}_N${(lastSeq + 1).toString().padStart(2, '0')}"
            } catch (_: Exception) {
                "DPMT_${tranDateStr}_N01"
            }
        }

        log.info("[DepositPayment] Generated pmt_no: {}", pmtNo)

        // Extra fee split (V1: api.py:525-530)
        val extraFee = request.extraFee?.toDouble() ?: 0.0
        val orderCount = orders.size
        val avgExtraFee = if (extraFee > 0 && orderCount > 0) extraFee / orderCount else 0.0

        var insertCount = 0
        var prepayInsertCount = 0
        val generatedPmtNos = mutableListOf<String>()

        for (order in orders) {
            val poNum = order.poNum
            val uItem = itemMap[poNum]

            // Determine exchange rate (V1: api.py:540-546)
            val rate = if (request.usePaymentDateRate && request.settlementRate != null
                && request.settlementRate > BigDecimal.ZERO) {
                request.settlementRate
            } else {
                order.exchangeRate
            }

            // Determine rate mode (V1: api.py:546)
            val depCurMode = if (request.usePaymentDateRate) "auto" else "manual"

            // Determine payment currency and amount (V1: api.py:548-569)
            val depCur: String
            val depPaid: BigDecimal
            val paymentMode = uItem?.paymentMode ?: "original"

            if (paymentMode == "custom") {
                depCur = uItem?.customCurrency ?: order.currency
                depPaid = uItem?.customAmount ?: BigDecimal.ZERO
            } else {
                depCur = order.currency
                // Original mode: calculate remaining deposit (V1: api.py:558-569)
                val depositAmount = order.totalAmount
                    .multiply(order.depositRatio)
                    .divide(BigDecimal("100"), 10, RoundingMode.HALF_UP)
                val existingPayments = depositPaymentRepository.findByPoNumActive(poNum)
                val alreadyPaid = existingPayments.sumOf { it.cashAmount }
                depPaid = (depositAmount - alreadyPaid).max(BigDecimal.ZERO)
            }

            // Prepay amount (V1: api.py:571-573)
            val depPrepayAmount = uItem?.prepayAmount ?: BigDecimal.ZERO

            // Override flag (V1: api.py:575-577)
            val depOverride = uItem?.coverStandard ?: false

            // Extra fee for this order (V1: api.py:579-587)
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

            // Skip condition (V1: api.py:590-591)
            if (depPaid <= BigDecimal("0.001")
                && depPrepayAmount <= BigDecimal("0.001")
                && cfExtraAmount <= BigDecimal.ZERO) {
                continue
            }

            // Create Payment record (V1: api.py:593-620)
            val now = Instant.now()
            val payment = Payment(
                paymentType = "deposit",
                paymentNo = pmtNo,
                poNum = poNum,
                paymentDate = paymentDate,
                currency = depCur,
                cashAmount = depPaid,
                prepayAmount = depPrepayAmount,
                exchangeRate = rate,
                rateMode = depCurMode,
                extraAmount = cfExtraAmount,
                extraCurrency = if (cfExtraCur.isNotBlank()) cfExtraCur else null,
                extraNote = if (cfExtraNote.isNotBlank()) cfExtraNote else null,
                depositOverride = depOverride,
                note = "原始定金支付",
                createdAt = now,
                updatedAt = now,
                createdBy = username,
                updatedBy = username,
            )
            val saved = depositPaymentRepository.save(payment)

            // Create PaymentEvent (V1: ops='new', seq='D01')
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
                note = "原始定金支付",
                operator = username,
            )
            paymentEventRepository.save(event)

            insertCount++
            if (pmtNo !in generatedPmtNos) {
                generatedPmtNos.add(pmtNo)
            }

            // Create prepay usage record if prepayAmount > 0.001 (V1: api.py:625-679)
            if (depPrepayAmount > BigDecimal("0.001")) {
                createPrepayUsageRecord(
                    pmtNo = pmtNo,
                    supplierCode = order.supplierCode,
                    paymentDate = paymentDate,
                    tranDateStr = tranDateStr,
                    orderCurrency = order.currency,
                    rate = rate,
                    depCurMode = depCurMode,
                    prepayAmount = depPrepayAmount,
                    username = username,
                )
                prepayInsertCount++
            }
        }

        if (insertCount == 0) {
            return SubmitDepositPaymentResponse(
                pmtNos = emptyList(),
                count = 0,
                prepayCount = 0,
                message = "finance.deposit.messages.noRecordsCreated",
            )
        }

        log.info("[DepositPayment] Created {} deposit records, {} prepay records", insertCount, prepayInsertCount)

        return SubmitDepositPaymentResponse(
            pmtNos = generatedPmtNos,
            count = insertCount,
            prepayCount = prepayInsertCount,
            message = "finance.deposit.messages.paymentSuccess",
        )
    }

    /**
     * Delete deposit payment — V1 parity: deposit_payment_delete_api (api.py:1436-1619)
     */
    @Transactional
    fun deletePayment(paymentNo: String, username: String): DeleteDepositPaymentResponse {
        require(paymentNo.isNotBlank()) { "payment_no must not be empty" }

        val payments = depositPaymentRepository.findActiveByPaymentNo(paymentNo)
        require(payments.isNotEmpty()) { "No active payments found for $paymentNo" }

        val now = Instant.now()
        var affectedCount = 0

        for (payment in payments) {
            // Soft delete (V1: insert new row with ops='delete')
            payment.deletedAt = now
            payment.updatedAt = now
            payment.updatedBy = username
            depositPaymentRepository.save(payment)

            // Create DELETE event (V1: api.py:1512-1541)
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
                note = "删除订单",
                operator = username,
            )
            paymentEventRepository.save(event)

            // Prepay restoration: if original payment had prepayAmount > 0 (V1: api.py:1543-1605)
            if (payment.prepayAmount > BigDecimal("0")) {
                restorePrepayBalance(
                    pmtNo = paymentNo,
                    payment = payment,
                    username = username,
                )
            }

            affectedCount++
        }

        return DeleteDepositPaymentResponse(
            pmtNo = paymentNo,
            affectedCount = affectedCount,
            message = "finance.deposit.messages.paymentDeleted",
        )
    }

    // ═══════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════

    /**
     * Create prepay usage (out) record for deposit prepay deduction.
     * V1 parity: api.py:625-679
     *
     * tran_num format: {supplierCode}_{YYYYMMDD}_out_{##}
     */
    private fun createPrepayUsageRecord(
        pmtNo: String,
        supplierCode: String,
        paymentDate: LocalDate,
        tranDateStr: String,
        orderCurrency: String,
        rate: BigDecimal,
        depCurMode: String,
        prepayAmount: BigDecimal,
        username: String,
    ) {
        // Generate tran_num (V1: api.py:628-635)
        val outPattern = "${supplierCode}_${tranDateStr}_out_%"
        val latestNos = depositPaymentRepository.findLatestPrepayNoForPattern(outPattern, PageRequest.of(0, 1))
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

        // Get supplier required currency (V1: api.py:638-651)
        val supplierStrategy = supplierStrategyRepository
            .findFirstBySupplierCodeAndEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(
                supplierCode, paymentDate
            )
        val tranCurrReq = supplierStrategy?.currency ?: "RMB"

        // Create prepay Payment record (V1: api.py:654-678)
        val now = Instant.now()
        val prepayPayment = Payment(
            paymentType = "prepay",
            paymentNo = tranNum,
            supplierCode = supplierCode,
            paymentDate = paymentDate,
            currency = orderCurrency,   // V1: tran_curr_use = order currency
            cashAmount = prepayAmount,  // V1: tran_amount
            prepayAmount = BigDecimal.ZERO,
            exchangeRate = rate,
            rateMode = depCurMode,
            prepayTranType = "usage",   // V1: tran_type = 'out'
            tranCurrReq = tranCurrReq,
            note = "Deposit_${pmtNo}_原始支付单",  // V1: api.py:675
            createdAt = now,
            updatedAt = now,
            createdBy = username,
            updatedBy = username,
        )
        val savedPrepay = depositPaymentRepository.save(prepayPayment)

        // Create PaymentEvent (V1: tran_ops='new', tran_seq='T01')
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
            note = "Deposit_${pmtNo}_原始支付单",
            operator = username,
        )
        paymentEventRepository.save(event)

        log.info("[DepositPayment] Created prepay usage record {} for {}", tranNum, pmtNo)
    }

    /**
     * Restore prepay balance by creating a reverse 'deposit' (in) record.
     * V1 parity: api.py:1543-1605
     *
     * tran_num format: {supplierCode}_{YYYYMMDD}_in_{##}
     */
    private fun restorePrepayBalance(
        pmtNo: String,
        payment: Payment,
        username: String,
    ) {
        // Find the original prepay 'usage' record (V1: api.py:1547-1553)
        val notePattern = "Deposit_${pmtNo}%"
        val originalPrepays = depositPaymentRepository.findPrepayUsageByDepositNote(notePattern)
        if (originalPrepays.isEmpty()) {
            log.warn("[DepositPayment] No prepay usage records found for {}", pmtNo)
            return
        }

        val origPrepay = originalPrepays.first()
        val supplierCode = origPrepay.supplierCode ?: return

        // Generate tran_num for reversal (V1: api.py:1559-1577)
        val dateStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)
        val inPattern = "${supplierCode}_${dateStr}_in_%"
        val latestNos = depositPaymentRepository.findLatestPrepayNoForPattern(inPattern, PageRequest.of(0, 1))
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

        // Create reverse prepay Payment (V1: api.py:1579-1605)
        val now = Instant.now()
        val restorePayment = Payment(
            paymentType = "prepay",
            paymentNo = tranNum,
            supplierCode = supplierCode,
            paymentDate = origPrepay.paymentDate,  // V1: use original tran_date
            currency = origPrepay.currency,
            cashAmount = origPrepay.cashAmount,     // Same amount, reversed direction
            prepayAmount = BigDecimal.ZERO,
            exchangeRate = origPrepay.exchangeRate,
            rateMode = origPrepay.rateMode,
            prepayTranType = "deposit",             // V1: tran_type = 'in' (reverse)
            tranCurrReq = origPrepay.tranCurrReq,
            note = "删除定金付款_${origPrepay.note ?: ""}",  // V1: api.py:1602
            createdAt = now,
            updatedAt = now,
            createdBy = username,
            updatedBy = username,
        )
        val savedRestore = depositPaymentRepository.save(restorePayment)

        // Create PaymentEvent
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
            note = "删除定金付款_${pmtNo}",
            operator = username,
        )
        paymentEventRepository.save(event)

        log.info("[DepositPayment] Created prepay restore record {} for deleted {}", tranNum, pmtNo)
    }
}
