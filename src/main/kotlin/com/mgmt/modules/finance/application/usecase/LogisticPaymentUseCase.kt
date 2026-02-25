package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.model.PaymentEvent
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.ShipmentRepository
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * LogisticPaymentUseCase — logistics payment submit / delete / restore.
 *
 *
 * Key business rules:
 *   6. pmt_no format: {YYYY-MM-DD}_S## (V1: submit.py:72-88)
 *   7. Batch payment shares pmt_no (V1: submit.py:96)
 *   8. logistic_paid = shipment.logisticsCost (V1: submit.py:161)
 *   9. Exchange rate selection: original / auto / manual (V1: submit.py:140-146)
 *   10. Delete/restore by pmt_no (V1: submit.py:249/338)
 */
@Service
class LogisticPaymentUseCase(
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val shipmentRepository: ShipmentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val landedPriceRecalcService: LandedPriceRecalcService,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Submit logistics payment: submit_payment_api (submit.py:22-206)
     */
    @Transactional
    fun submitPayment(request: SubmitPaymentRequest, username: String): SubmitPaymentResponse {
        require(request.logisticNums.isNotEmpty()) { "logistic_nums must not be empty" }
        require(request.paymentDate.isNotBlank()) { "payment_date must not be empty" }

        val paymentDate = LocalDate.parse(request.paymentDate)

        // Generate pmt_no — format: {YYYY-MM-DD}_S## (V1: submit.py:72-88)
        val prefix = "${request.paymentDate}_S%"
        val latestNos = logisticPaymentRepository.findLatestPaymentNo(prefix, PageRequest.of(0, 1))
        val pmtNo = if (latestNos.isEmpty()) {
            "${request.paymentDate}_S01"
        } else {
            val lastNo = latestNos[0]
            try {
                val lastSeq = lastNo.split("_S").last().toInt()
                "${request.paymentDate}_S${(lastSeq + 1).toString().padStart(2, '0')}"
            } catch (_: Exception) {
                "${request.paymentDate}_S01"
            }
        }

        log.info("[LogisticPayment] Generated pmt_no: {}", pmtNo)

        var successCount = 0

        for (logisticNum in request.logisticNums) {
            // Get shipment info (V1: submit.py:98-106)
            val shipment = shipmentRepository.findByLogisticNumAndDeletedAtIsNull(logisticNum)
            if (shipment == null) {
                log.warn("Shipment {} not found, skipping", logisticNum)
                continue
            }

            // Determine exchange rate (V1: submit.py:139-146)
            val finalRate: BigDecimal
            val finalMode: String
            if (request.usePaymentDateRate && request.settlementRate != null && request.settlementRate > BigDecimal.ZERO) {
                finalRate = request.settlementRate
                finalMode = if (request.rateSource == "auto") "auto" else "manual"
            } else {
                // Use original shipment rate
                finalRate = shipment.exchangeRate
                finalMode = shipment.rateMode
            }

            // Extra fee (V1: submit.py:130-137)
            val extraAmount = request.extraFee?.amount ?: BigDecimal.ZERO
            val extraCurrency = request.extraFee?.currency ?: ""
            val extraNote = request.extraFee?.note ?: ""

            // Create Payment record (V1: submit.py:148-173)
            val payment = Payment(
                paymentType = "logistics",
                paymentNo = pmtNo,
                shipmentId = shipment.id,
                logisticNum = logisticNum,
                paymentDate = paymentDate,
                currency = "RMB",  // logistics costs are in RMB
                cashAmount = shipment.logisticsCost,  // V1: logistic_paid = total_price
                prepayAmount = BigDecimal.ZERO,
                exchangeRate = finalRate,
                rateMode = finalMode,
                extraAmount = extraAmount,
                extraCurrency = if (extraCurrency.isNotBlank()) extraCurrency else null,
                extraNote = if (extraNote.isNotBlank()) extraNote else null,
                note = "Logistics payment",
                createdAt = Instant.now(),
                updatedAt = Instant.now(),
                createdBy = username,
                updatedBy = username,
            )
            val saved = logisticPaymentRepository.save(payment)

            // Create PaymentEvent (audit trail)
            val eventSeq = paymentEventRepository.findMaxEventSeq(saved.id) + 1
            val snapshot = mapOf(
                "logisticNum" to logisticNum,
                "cashAmount" to saved.cashAmount.toPlainString(),
                "exchangeRate" to saved.exchangeRate.toPlainString(),
                "rateMode" to saved.rateMode,
                "extraAmount" to (saved.extraAmount.toPlainString()),
                "extraCurrency" to (saved.extraCurrency ?: ""),
                "paymentDate" to saved.paymentDate.toString(),
            )
            val event = PaymentEvent(
                paymentId = saved.id,
                paymentNo = pmtNo,
                eventType = "CREATE",
                eventSeq = eventSeq,
                changes = objectMapper.writeValueAsString(snapshot),
                note = "Logistics payment",
                operator = username,
            )
            paymentEventRepository.save(event)

            successCount++
        }

        // Recalculate landed prices for affected logistics (V1: submit.py:188-193)
        for (logisticNum in request.logisticNums) {
            try {
                landedPriceRecalcService.recalculate(logisticNum)
            } catch (e: Exception) {
                log.warn("Failed to recalculate landed prices for {}: {}", logisticNum, e.message)
            }
        }

        return SubmitPaymentResponse(
            successCount = successCount,
            totalCount = request.logisticNums.size,
            pmtNo = pmtNo,
        )
    }

    /**
     * Delete logistics payment: delete_payment_api (submit.py:211-283)
     *
     * V3 uses soft delete (deletedAt), V1 did hard delete.
     */
    @Transactional
    fun deletePayment(paymentNo: String, username: String): DeleteRestoreResponse {
        require(paymentNo.isNotBlank()) { "payment_no must not be empty" }

        val payments = logisticPaymentRepository.findByPaymentNo(paymentNo)
        require(payments.isNotEmpty()) { "No active payments found for $paymentNo" }

        val now = Instant.now()
        val affectedLogisticNums = mutableListOf<String>()

        for (payment in payments) {
            payment.deletedAt = now
            payment.updatedAt = now
            payment.updatedBy = username
            logisticPaymentRepository.save(payment)

            // Create DELETE event
            val eventSeq = paymentEventRepository.findMaxEventSeq(payment.id) + 1
            val event = PaymentEvent(
                paymentId = payment.id,
                paymentNo = paymentNo,
                eventType = "DELETE",
                eventSeq = eventSeq,
                changes = objectMapper.writeValueAsString(mapOf("deletedAt" to now.toString())),
                note = "Payment deleted",
                operator = username,
            )
            paymentEventRepository.save(event)

            payment.logisticNum?.let { affectedLogisticNums.add(it) }
        }

        // Recalculate landed prices (V1: submit.py:263-273)
        for (logisticNum in affectedLogisticNums) {
            try {
                landedPriceRecalcService.recalculate(logisticNum)
            } catch (e: Exception) {
                log.warn("Failed to recalculate landed prices for {}: {}", logisticNum, e.message)
            }
        }

        return DeleteRestoreResponse(pmtNo = paymentNo, affectedCount = payments.size)
    }

    /**
     * Restore deleted logistics payment: restore_payment_api (submit.py:286-397)
     */
    @Transactional
    fun restorePayment(paymentNo: String, username: String): DeleteRestoreResponse {
        require(paymentNo.isNotBlank()) { "payment_no must not be empty" }

        val payments = logisticPaymentRepository.findByPaymentNoIncludeDeleted(paymentNo)
            .filter { it.deletedAt != null }
        require(payments.isNotEmpty()) { "No deleted payments found for $paymentNo" }

        val now = Instant.now()
        val affectedLogisticNums = mutableListOf<String>()

        for (payment in payments) {
            payment.deletedAt = null
            payment.updatedAt = now
            payment.updatedBy = username
            logisticPaymentRepository.save(payment)

            // Create RESTORE event
            val eventSeq = paymentEventRepository.findMaxEventSeq(payment.id) + 1
            val event = PaymentEvent(
                paymentId = payment.id,
                paymentNo = paymentNo,
                eventType = "RESTORE",
                eventSeq = eventSeq,
                changes = objectMapper.writeValueAsString(mapOf("restoredAt" to now.toString())),
                note = "Payment restored",
                operator = username,
            )
            paymentEventRepository.save(event)

            payment.logisticNum?.let { affectedLogisticNums.add(it) }
        }

        // Recalculate landed prices
        for (logisticNum in affectedLogisticNums) {
            try {
                landedPriceRecalcService.recalculate(logisticNum)
            } catch (e: Exception) {
                log.warn("Failed to recalculate landed prices for {}: {}", logisticNum, e.message)
            }
        }

        return DeleteRestoreResponse(pmtNo = paymentNo, affectedCount = payments.size)
    }
}
