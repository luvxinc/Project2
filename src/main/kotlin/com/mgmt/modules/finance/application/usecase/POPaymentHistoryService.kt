package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.POPaymentRepository
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * POPaymentHistoryService — history and order details for PO payments.
 *
 * Returns 3 columns: strategyVersions + depositPaymentVersions + poPaymentVersions
 */
@Service
class POPaymentHistoryService(
    private val depositPaymentRepository: DepositPaymentRepository,
    private val poPaymentRepository: POPaymentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Get payment history — 3 columns: strategy + deposit + PO payment versions.
     */
    @Transactional(readOnly = true)
    fun getPaymentHistory(paymentNo: String, poNum: String): POPaymentHistoryResponse {
        // --- 1. Strategy versions ---
        val allStrategies = strategyRepository.findAllByPoNumOrderByStrategySeqAsc(poNum)
        val strategyVersions = mutableListOf<DepositStrategyVersion>()

        var prevStratData: Map<String, Any?>? = null
        for (strategy in allStrategies) {
            val data = mapOf<String, Any?>(
                "curCurrency" to strategy.currency,
                "curFloat" to strategy.floatEnabled,
                "curExFloat" to strategy.floatThreshold.toDouble(),
                "curDeposit" to strategy.requireDeposit,
                "curDepositPar" to strategy.depositRatio.toDouble(),
                "curUsdRmb" to strategy.exchangeRate.toDouble(),
                "curMode" to strategy.rateMode,
            )

            val isInitial = prevStratData == null
            val changes = mutableListOf<FieldChange>()

            if (prevStratData != null) {
                if (data["curCurrency"] != prevStratData["curCurrency"]) {
                    changes.add(FieldChange("Settlement Currency", "${prevStratData["curCurrency"]}", "${data["curCurrency"]}"))
                }
                if (data["curFloat"] != prevStratData["curFloat"]) {
                    changes.add(FieldChange("Price Float", if (prevStratData["curFloat"] as Boolean) "Yes" else "No",
                        if (data["curFloat"] as Boolean) "Yes" else "No"))
                }
                if ((data["curDeposit"] as Boolean) != (prevStratData["curDeposit"] as Boolean)) {
                    changes.add(FieldChange("Require Deposit", if (prevStratData["curDeposit"] as Boolean) "Yes" else "No",
                        if (data["curDeposit"] as Boolean) "Yes" else "No"))
                }
                val oldPar = prevStratData["curDepositPar"] as Double
                val newPar = data["curDepositPar"] as Double
                if (Math.abs(newPar - oldPar) > 0.01) {
                    changes.add(FieldChange("Deposit Ratio", "${oldPar}%", "${newPar}%"))
                }
                val oldRate = prevStratData["curUsdRmb"] as Double
                val newRate = data["curUsdRmb"] as Double
                if (Math.abs(newRate - oldRate) > 0.0001) {
                    changes.add(FieldChange("Exchange Rate", "$oldRate", "$newRate"))
                }
                if (data["curMode"] != prevStratData["curMode"]) {
                    changes.add(FieldChange("Rate Mode", "${prevStratData["curMode"]}", "${data["curMode"]}"))
                }
            }

            strategyVersions.add(DepositStrategyVersion(
                seq = "S${String.format("%02d", strategy.strategySeq)}",
                dateRecord = strategy.createdAt.toString(),
                byUser = strategy.createdBy ?: "system",
                note = strategy.note ?: "",
                isInitial = isInitial,
                data = data,
                changes = changes,
            ))
            prevStratData = data
        }

        val latestStrategy = allStrategies.lastOrNull()
        val strategyCurrency = latestStrategy?.currency ?: "RMB"

        // --- 2. Deposit payment versions ---
        val allDepositPayments = depositPaymentRepository.findByPoNumActive(poNum)
        val depositPaymentVersions = mutableListOf<DepositPaymentVersion>()

        for (payment in allDepositPayments) {
            val events = paymentEventRepository.findAllByPaymentIdOrderByEventSeqAsc(payment.id)

            for ((idx, event) in events.withIndex()) {
                val isInitial = idx == 0

                val data = mapOf<String, Any?>(
                    "depPrepayAmount" to payment.prepayAmount.toDouble(),
                    "depPaid" to payment.cashAmount.toDouble(),
                    "depCur" to payment.currency,
                    "depPaidCur" to payment.exchangeRate.toDouble(),
                    "depOverride" to (if (payment.depositOverride == true) 1 else 0),
                    "extraNote" to (payment.extraNote ?: ""),
                    "extraAmount" to payment.extraAmount.toDouble(),
                    "extraCur" to (payment.extraCurrency ?: ""),
                    "strategyCurrency" to strategyCurrency,
                )

                val changes = mutableListOf<FieldChange>()

                depositPaymentVersions.add(DepositPaymentVersion(
                    seq = "D${String.format("%02d", event.eventSeq)}",
                    dateRecord = event.createdAt.toString(),
                    byUser = event.operator,
                    note = event.note ?: "",
                    isInitial = isInitial,
                    data = data,
                    changes = changes,
                ))
            }
        }

        // --- 3. PO payment versions ---
        val allPOPayments = poPaymentRepository.findByPaymentNo(paymentNo)
            .filter { it.poNum == poNum }
        val poPaymentVersions = mutableListOf<POPaymentVersion>()

        for (payment in allPOPayments) {
            val events = paymentEventRepository.findAllByPaymentIdOrderByEventSeqAsc(payment.id)

            for ((idx, event) in events.withIndex()) {
                val isInitial = idx == 0

                val data = mapOf<String, Any?>(
                    "poPrepayAmount" to payment.prepayAmount.toDouble(),
                    "poPaid" to payment.cashAmount.toDouble(),
                    "poCur" to payment.currency,
                    "poPaidCur" to payment.exchangeRate.toDouble(),
                    "poOverride" to (if (payment.depositOverride == true) 1 else 0),
                    "extraNote" to (payment.extraNote ?: ""),
                    "extraAmount" to payment.extraAmount.toDouble(),
                    "extraCur" to (payment.extraCurrency ?: ""),
                    "strategyCurrency" to strategyCurrency,
                )

                val changes = mutableListOf<FieldChange>()

                poPaymentVersions.add(POPaymentVersion(
                    seq = "P${String.format("%02d", event.eventSeq)}",
                    dateRecord = event.createdAt.toString(),
                    byUser = event.operator,
                    note = event.note ?: "",
                    isInitial = isInitial,
                    data = data,
                    changes = changes,
                ))
            }
        }

        return POPaymentHistoryResponse(
            strategyVersions = strategyVersions.reversed(),
            depositPaymentVersions = depositPaymentVersions.reversed(),
            poPaymentVersions = poPaymentVersions.reversed(),
        )
    }

    /**
     * Get payment orders — PO details for a PO payment batch.
     */
    @Transactional(readOnly = true)
    fun getPaymentOrders(paymentNo: String): POPaymentOrdersResponse {
        val payments = poPaymentRepository.findByPaymentNo(paymentNo)
        if (payments.isEmpty()) {
            return POPaymentOrdersResponse(orders = emptyList())
        }

        val orders = mutableListOf<POPaymentOrderDetail>()

        for (payment in payments) {
            val poNum = payment.poNum ?: continue

            val supplierCode = if (poNum.length >= 2) poNum.take(2) else ""
            val poDate = parsePoDateFromNum(poNum)

            val poPaid = payment.cashAmount.toDouble()
            val rate = payment.exchangeRate.toDouble()
            val prepayUsed = payment.prepayAmount.toDouble()

            val strategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum)
            val currency = strategy?.currency ?: payment.currency

            val totalPayment = poPaid + prepayUsed

            val paymentUsd: Double
            val paymentRmb: Double
            if (currency == "USD") {
                paymentUsd = totalPayment
                paymentRmb = totalPayment * rate
            } else {
                paymentRmb = totalPayment
                paymentUsd = if (rate > 0) totalPayment / rate else 0.0
            }

            val poItems = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            var orderTotalRmb = 0.0
            var orderTotalUsd = 0.0

            val items = poItems.map { item ->
                val qty = item.quantity
                val unitPrice = item.unitPrice.toDouble()
                val itemRate = if (rate > 0) rate else 7.0

                val valueRmb: Double
                val valueUsd: Double
                if (currency == "USD") {
                    valueUsd = qty * unitPrice
                    valueRmb = valueUsd * itemRate
                } else {
                    valueRmb = qty * unitPrice
                    valueUsd = valueRmb / itemRate
                }

                orderTotalRmb += valueRmb
                orderTotalUsd += valueUsd

                POPaymentOrderItem(
                    sku = item.sku,
                    qty = qty,
                    unitPrice = unitPrice,
                    currency = currency,
                    valueRmb = valueRmb,
                    valueUsd = valueUsd,
                )
            }

            val paymentCurrency = payment.currency
            val actualPaidRmb = if (paymentCurrency == "USD") poPaid * rate else poPaid

            orders.add(POPaymentOrderDetail(
                poNum = poNum,
                supplierCode = supplierCode,
                poDate = poDate,
                paymentRmb = paymentRmb,
                paymentUsd = paymentUsd,
                currency = currency,
                paymentDate = payment.paymentDate.toString(),
                exchangeRate = rate,
                prepayUsedRmb = prepayUsed,
                actualPaidRmb = actualPaidRmb,
                items = items,
                totalRmb = orderTotalRmb,
                totalUsd = orderTotalUsd,
            ))
        }

        return POPaymentOrdersResponse(orders = orders)
    }

    private fun parsePoDateFromNum(poNum: String): String {
        return if (poNum.length >= 10) {
            try {
                val ds = poNum.substring(2, 10)
                "${ds.substring(0, 4)}-${ds.substring(4, 6)}-${ds.substring(6, 8)}"
            } catch (_: Exception) { "" }
        } else ""
    }
}
