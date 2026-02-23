package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * DepositPaymentHistoryService — history and order details for deposit payments.
 *
 * V1 parity:
 *   - deposit_history_api (api.py:1220-1434)
 *   - deposit_orders_api (api.py:1072-1217)
 */
@Service
class DepositPaymentHistoryService(
    private val depositPaymentRepository: DepositPaymentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Get payment history — strategy versions + payment versions.
     * V1 parity: deposit_history_api (api.py:1220-1434)
     *
     * Left column: strategy versions (currency, deposit%, rate, mode changes)
     * Right column: payment versions (amount, rate, override changes)
     */
    @Transactional(readOnly = true)
    fun getPaymentHistory(paymentNo: String, poNum: String): DepositHistoryResponse {
        // --- 1. Strategy versions (V1: api.py:1240-1324) ---
        // Get ALL strategy versions, ordered by strategySeq ASC (for diff calculation)
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

            // Calculate diffs if not initial (V1: api.py:1276-1319)
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

        // Get latest strategy for currency reference
        val latestStrategy = allStrategies.lastOrNull()

        // --- 2. Payment versions (V1: api.py:1326-1428) ---
        // Get all payments for this pmtNo + poNum
        val allPayments = depositPaymentRepository.findByPaymentNo(paymentNo)
            .filter { it.poNum == poNum }

        val paymentVersions = mutableListOf<DepositPaymentVersion>()

        // Get strategy currency for display labels
        val strategyCurrency = latestStrategy?.currency ?: "RMB"

        if (allPayments.isNotEmpty()) {
            // Get events for each payment
            for (payment in allPayments) {
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

                    // Parse changes from event
                    val changes = mutableListOf<FieldChange>()
                    if (event.eventType == "DELETE") {
                        // Mark as deleted
                    }

                    paymentVersions.add(DepositPaymentVersion(
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
        }

        // Return newest first (V1: api.py:1324, 1428)
        return DepositHistoryResponse(
            strategyVersions = strategyVersions.reversed(),
            paymentVersions = paymentVersions.reversed(),
        )
    }

    /**
     * Get payment orders — PO details for a payment batch.
     * V1 parity: deposit_orders_api (api.py:1072-1217)
     */
    @Transactional(readOnly = true)
    fun getPaymentOrders(paymentNo: String): DepositOrdersResponse {
        val payments = depositPaymentRepository.findByPaymentNo(paymentNo)
        if (payments.isEmpty()) {
            return DepositOrdersResponse(orders = emptyList())
        }

        val orders = mutableListOf<DepositOrderDetail>()

        for (payment in payments) {
            val poNum = payment.poNum ?: continue

            // Parse supplier_code and po_date from po_num (V1: api.py:1107-1114)
            val supplierCode = if (poNum.length >= 2) poNum.take(2) else ""
            val poDate = parsePoDateFromNum(poNum)

            val depPaid = payment.cashAmount.toDouble()
            val rate = payment.exchangeRate.toDouble()
            val prepayUsed = payment.prepayAmount.toDouble()

            // Get strategy info (V1: api.py:1121-1126)
            val strategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum)
            val currency = strategy?.currency ?: payment.currency
            val depositPercent = strategy?.depositRatio?.toDouble() ?: 0.0

            val totalDeposit = depPaid + prepayUsed

            // Currency conversion (V1: api.py:1133-1138)
            val depositUsd: Double
            val depositRmb: Double
            if (currency == "USD") {
                depositUsd = totalDeposit
                depositRmb = totalDeposit * rate
            } else {
                depositRmb = totalDeposit
                depositUsd = if (rate > 0) totalDeposit / rate else 0.0
            }

            // Get order items (V1: api.py:1141-1182)
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

                DepositOrderItem(
                    sku = item.sku,
                    qty = qty,
                    unitPrice = unitPrice,
                    currency = currency,
                    valueRmb = valueRmb,
                    valueUsd = valueUsd,
                )
            }

            // Actual paid RMB (V1: api.py:1184-1189)
            val paymentCurrency = payment.currency
            val actualPaidRmb = if (paymentCurrency == "USD") depPaid * rate else depPaid

            orders.add(DepositOrderDetail(
                poNum = poNum,
                supplierCode = supplierCode,
                poDate = poDate,
                depositRmb = depositRmb,
                depositUsd = depositUsd,
                depositPercent = depositPercent,
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

        return DepositOrdersResponse(orders = orders)
    }

    /**
     * Parse PO date from po_num: AAYYYYMMDD-S## → YYYY-MM-DD
     */
    private fun parsePoDateFromNum(poNum: String): String {
        return if (poNum.length >= 10) {
            try {
                val ds = poNum.substring(2, 10)
                "${ds.substring(0, 4)}-${ds.substring(4, 6)}-${ds.substring(6, 8)}"
            } catch (_: Exception) { "" }
        } else ""
    }
}
