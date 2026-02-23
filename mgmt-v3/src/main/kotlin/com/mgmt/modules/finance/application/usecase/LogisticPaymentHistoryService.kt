package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentEventRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentItemRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * LogisticPaymentHistoryService — payment history and orders query.
 *
 * V1 parity: history.py (payment_history_api, payment_orders_api)
 *
 * History builds two columns:
 *   - Send versions: shipment event history (CREATE → UPDATE_LOGISTICS → UPDATE_ITEMS → DELETE/RESTORE)
 *   - Payment versions: payment event history (CREATE → DELETE → RESTORE)
 *
 * Events store JSONB snapshots/diffs. This service parses them to reconstruct
 * running state and compute field-level changes for audit display.
 */
@Service
class LogisticPaymentHistoryService(
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val paymentEventRepository: PaymentEventRepository,
    private val shipmentRepository: ShipmentRepository,
    private val shipmentEventRepository: ShipmentEventRepository,
    private val shipmentItemRepository: ShipmentItemRepository,
    private val purchaseOrderStrategyRepository: PurchaseOrderStrategyRepository,
    private val purchaseOrderItemRepository: PurchaseOrderItemRepository,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Get payment history for a payment batch.
     * V1 parity: payment_history_api (history.py:92-183)
     */
    fun getPaymentHistory(paymentNo: String, filterLogisticNum: String? = null): PaymentHistoryResponse {
        val payments = logisticPaymentRepository.findByPaymentNoIncludeDeleted(paymentNo)
        val logisticNums = if (filterLogisticNum != null) {
            payments.mapNotNull { it.logisticNum }.distinct().filter { it == filterLogisticNum }
        } else {
            payments.mapNotNull { it.logisticNum }.distinct()
        }

        if (logisticNums.isEmpty()) {
            return PaymentHistoryResponse(pmtNo = paymentNo, logisticNums = emptyList(), sendVersions = emptyList(), paymentVersions = emptyList())
        }

        val sendVersions = buildSendVersions(logisticNums)
        val paymentVersions = buildPaymentVersions(payments, filterLogisticNum)

        return PaymentHistoryResponse(pmtNo = paymentNo, logisticNums = logisticNums, sendVersions = sendVersions, paymentVersions = paymentVersions)
    }

    /**
     * Get payment orders — V1 parity: payment_orders_api (history.py:186-249)
     */
    fun getPaymentOrders(paymentNo: String, filterLogisticNum: String? = null): PaymentOrdersResponse {
        val payments = logisticPaymentRepository.findByPaymentNoIncludeDeleted(paymentNo)
        val logisticNums = if (filterLogisticNum != null) {
            payments.mapNotNull { it.logisticNum }.distinct().filter { it == filterLogisticNum }
        } else {
            payments.mapNotNull { it.logisticNum }.distinct()
        }

        if (logisticNums.isEmpty()) {
            return PaymentOrdersResponse(pmtNo = paymentNo, logisticNums = emptyList(), orders = emptyList())
        }

        return PaymentOrdersResponse(pmtNo = paymentNo, logisticNums = logisticNums, orders = buildOrders(logisticNums))
    }

    // ═══════════════════════════════════════════════
    // Shipment-level queries (no paymentNo required)
    // Used for unpaid logistics that have shipment history but no payment
    // ═══════════════════════════════════════════════

    /**
     * Get shipment history by logisticNum (send versions only, no payment versions).
     */
    fun getShipmentHistory(logisticNum: String): PaymentHistoryResponse {
        val sendVersions = buildSendVersions(listOf(logisticNum))
        return PaymentHistoryResponse(pmtNo = "", logisticNums = listOf(logisticNum), sendVersions = sendVersions, paymentVersions = emptyList())
    }

    /**
     * Get shipment orders by logisticNum.
     */
    fun getShipmentOrders(logisticNum: String): PaymentOrdersResponse {
        return PaymentOrdersResponse(pmtNo = "", logisticNums = listOf(logisticNum), orders = buildOrders(listOf(logisticNum)))
    }

    // ═══════════════════════════════════════════════
    // Private builders — shared by payment-level and shipment-level queries
    // ═══════════════════════════════════════════════

    private fun buildSendVersions(logisticNums: List<String>): List<SendVersionDto> {
        val sendVersions = mutableListOf<SendVersionDto>()
        for (logisticNum in logisticNums) {
            val shipment = shipmentRepository.findByLogisticNum(logisticNum) ?: continue
            val events = shipmentEventRepository.findAllByShipmentIdOrderByEventSeqAsc(shipment.id)

            if (events.isEmpty()) {
                sendVersions.add(SendVersionDto(
                    logisticNum = logisticNum, isInitial = true, seq = "S01",
                    dateRecord = shipment.createdAt.toString(), byUser = shipment.createdBy ?: "", note = "",
                    data = SendVersionDataDto(dateSent = shipment.sentDate.toString(), priceKg = shipment.priceKg,
                        totalWeight = shipment.totalWeight, totalPrice = shipment.logisticsCost, pallets = shipment.pallets),
                    changes = emptyList(),
                ))
            } else {
                var runningState = SendVersionDataDto(
                    dateSent = shipment.sentDate.toString(), priceKg = shipment.priceKg,
                    totalWeight = shipment.totalWeight, totalPrice = shipment.logisticsCost, pallets = shipment.pallets,
                )
                val versions = mutableListOf<SendVersionDto>()

                for ((idx, event) in events.withIndex()) {
                    val isInitial = idx == 0
                    val changesMap = parseJson(event.changes)

                    when (event.eventType) {
                        "CREATE" -> {
                            runningState = SendVersionDataDto(
                                dateSent = changesMap["sentDate"]?.toString() ?: shipment.sentDate.toString(),
                                priceKg = toBd(changesMap["priceKg"]) ?: shipment.priceKg,
                                totalWeight = toBd(changesMap["totalWeight"]) ?: shipment.totalWeight,
                                totalPrice = toBd(changesMap["logisticsCost"]) ?: shipment.logisticsCost,
                                pallets = toInt(changesMap["pallets"]) ?: shipment.pallets,
                            )
                            versions.add(SendVersionDto(
                                logisticNum = logisticNum, isInitial = true,
                                seq = "S${event.eventSeq.toString().padStart(2, '0')}",
                                dateRecord = event.createdAt.toString(), byUser = event.operator,
                                note = event.note ?: "", data = runningState, changes = emptyList(),
                            ))
                        }
                        "UPDATE_LOGISTICS" -> {
                            val fieldChanges = mutableListOf<FieldChangeDto>()
                            var newState = runningState
                            for ((key, value) in changesMap) {
                                val pair = value as? Map<*, *> ?: continue
                                val before = pair["before"]; val after = pair["after"]
                                when (key) {
                                    "priceKg" -> { fieldChanges.add(FieldChangeDto("Price ($/kg)", fmtBd(before, 4), fmtBd(after, 4))); newState = newState.copy(priceKg = toBd(after) ?: newState.priceKg) }
                                    "totalWeight" -> { fieldChanges.add(FieldChangeDto("Weight (kg)", fmtBd(before, 2), fmtBd(after, 2))); newState = newState.copy(totalWeight = toBd(after) ?: newState.totalWeight) }
                                    "logisticsCost" -> { fieldChanges.add(FieldChangeDto("Freight (RMB)", "¥${fmtBd(before, 2)}", "¥${fmtBd(after, 2)}")); newState = newState.copy(totalPrice = toBd(after) ?: newState.totalPrice) }
                                    "pallets" -> { fieldChanges.add(FieldChangeDto("Pallets", before?.toString() ?: "", after?.toString() ?: "")); newState = newState.copy(pallets = toInt(after) ?: newState.pallets) }
                                    "sentDate" -> { fieldChanges.add(FieldChangeDto("Sent Date", before?.toString() ?: "", after?.toString() ?: "")); newState = newState.copy(dateSent = after?.toString() ?: newState.dateSent) }
                                    "etaDate" -> fieldChanges.add(FieldChangeDto("ETA Date", before?.toString() ?: "", after?.toString() ?: ""))
                                    "exchangeRate" -> fieldChanges.add(FieldChangeDto("Exchange Rate", fmtBd(before, 4), fmtBd(after, 4)))
                                    "rateMode" -> fieldChanges.add(FieldChangeDto("Rate Mode", before?.toString() ?: "", after?.toString() ?: ""))
                                    "note" -> fieldChanges.add(FieldChangeDto("Note", before?.toString() ?: "", after?.toString() ?: ""))
                                }
                            }
                            runningState = newState
                            versions.add(SendVersionDto(
                                logisticNum = logisticNum, isInitial = false,
                                seq = "S${event.eventSeq.toString().padStart(2, '0')}",
                                dateRecord = event.createdAt.toString(), byUser = event.operator,
                                note = event.note ?: "", data = runningState, changes = fieldChanges,
                            ))
                        }
                        "UPDATE_ITEMS" -> {
                            val fieldChanges = try {
                                val raw = objectMapper.readValue(event.changes, Any::class.java)
                                when (raw) {
                                    is List<*> -> {
                                        @Suppress("UNCHECKED_CAST")
                                        val items = raw as List<Map<String, Any?>>
                                        items.mapNotNull { item ->
                                            val action = item["action"]?.toString() ?: ""
                                            val sku = item["sku"]?.toString() ?: ""
                                            val poNum = item["poNum"]?.toString() ?: ""
                                            when (action) {
                                                "ADD" -> FieldChangeDto("Item Added", "", "$poNum / $sku (qty: ${item["quantity"]})")
                                                "DELETE" -> FieldChangeDto("Item Removed", "$poNum / $sku (qty: ${item["quantity"]})", "")
                                                "UPDATE" -> {
                                                    val qtyChange = item["quantity"] as? Map<*, *>
                                                    val poChange = item["poChange"] as? Map<*, *>
                                                    val parts = mutableListOf<String>()
                                                    if (qtyChange != null) parts.add("qty: ${qtyChange["before"]} → ${qtyChange["after"]}")
                                                    if (poChange != null) parts.add("PO adj: ${poChange["before"]} → ${poChange["after"]}")
                                                    FieldChangeDto("$sku", "", parts.joinToString(", "))
                                                }
                                                else -> null
                                            }
                                        }
                                    }
                                    is Map<*, *> -> {
                                        val result = mutableListOf<FieldChangeDto>()
                                        @Suppress("UNCHECKED_CAST") val added = raw["added"] as? List<Map<String, Any?>> ?: emptyList()
                                        for (item in added) { result.add(FieldChangeDto("Item Added", "", "${item["poNum"]} / ${item["sku"]} (qty: ${item["quantity"] ?: item["after"]})")) }
                                        @Suppress("UNCHECKED_CAST") val removed = raw["removed"] as? List<Map<String, Any?>> ?: emptyList()
                                        for (item in removed) { result.add(FieldChangeDto("Item Removed", "${item["poNum"]} / ${item["sku"]} (qty: ${item["quantity"] ?: item["before"]})", "")) }
                                        @Suppress("UNCHECKED_CAST") val adjusted = raw["adjusted"] as? List<Map<String, Any?>> ?: emptyList()
                                        for (item in adjusted) { result.add(FieldChangeDto("${item["sku"]} (${item["field"] ?: "quantity"})", "${item["poNum"]}: ${item["before"]}", "${item["poNum"]}: ${item["after"]}")) }
                                        result
                                    }
                                    else -> emptyList()
                                }
                            } catch (e: Exception) { log.warn("Failed to parse UPDATE_ITEMS: {}", e.message); emptyList() }

                            versions.add(SendVersionDto(
                                logisticNum = logisticNum, isInitial = false,
                                seq = "S${event.eventSeq.toString().padStart(2, '0')}",
                                dateRecord = event.createdAt.toString(), byUser = event.operator,
                                note = event.note ?: "", data = runningState, changes = fieldChanges,
                            ))
                        }
                        "DELETE" -> versions.add(SendVersionDto(logisticNum = logisticNum, isInitial = false, seq = "S${event.eventSeq.toString().padStart(2, '0')}", dateRecord = event.createdAt.toString(), byUser = event.operator, note = event.note ?: "", data = runningState, changes = listOf(FieldChangeDto("Status", "Active", "Deleted"))))
                        "RESTORE" -> versions.add(SendVersionDto(logisticNum = logisticNum, isInitial = false, seq = "S${event.eventSeq.toString().padStart(2, '0')}", dateRecord = event.createdAt.toString(), byUser = event.operator, note = event.note ?: "", data = runningState, changes = listOf(FieldChangeDto("Status", "Deleted", "Active"))))
                        else -> versions.add(SendVersionDto(logisticNum = logisticNum, isInitial = isInitial, seq = "S${event.eventSeq.toString().padStart(2, '0')}", dateRecord = event.createdAt.toString(), byUser = event.operator, note = event.note ?: "", data = runningState, changes = emptyList()))
                    }
                }
                versions.reverse()
                sendVersions.addAll(versions)
            }
        }
        return sendVersions
    }

    private fun buildPaymentVersions(
        allPayments: List<com.mgmt.modules.purchase.domain.model.Payment>,
        filterLogisticNum: String?,
    ): List<PaymentVersionDto> {
        val filteredPayments = if (filterLogisticNum != null) allPayments.filter { it.logisticNum == filterLogisticNum } else allPayments
        val batchSize = allPayments.size.coerceAtLeast(1)
        val paymentVersions = mutableListOf<PaymentVersionDto>()

        for (payment in filteredPayments) {
            val events = paymentEventRepository.findAllByPaymentIdOrderByEventSeqAsc(payment.id)
            val versions = mutableListOf<PaymentVersionDto>()

            for (event in events) {
                val changesMap = parseJson(event.changes)
                val fieldChanges = mutableListOf<FieldChangeDto>()
                val logisticPaid: BigDecimal; val usdRmb: BigDecimal; val mode: String
                val paymentDate: String; val extraPaid: BigDecimal; val extraCurrency: String; val extraNote: String

                when (event.eventType) {
                    "CREATE" -> {
                        logisticPaid = toBd(changesMap["cashAmount"]) ?: payment.cashAmount
                        usdRmb = toBd(changesMap["exchangeRate"]) ?: payment.exchangeRate
                        mode = changesMap["rateMode"]?.toString() ?: payment.rateMode
                        paymentDate = changesMap["paymentDate"]?.toString() ?: payment.paymentDate.toString()
                        extraPaid = toBd(changesMap["extraAmount"]) ?: payment.extraAmount
                        extraCurrency = changesMap["extraCurrency"]?.toString() ?: payment.extraCurrency ?: ""
                        extraNote = changesMap["extraNote"]?.toString() ?: payment.extraNote ?: ""
                    }
                    "DELETE" -> {
                        logisticPaid = payment.cashAmount; usdRmb = payment.exchangeRate; mode = payment.rateMode
                        paymentDate = payment.paymentDate.toString(); extraPaid = payment.extraAmount
                        extraCurrency = payment.extraCurrency ?: ""; extraNote = payment.extraNote ?: ""
                        fieldChanges.add(FieldChangeDto("Status", "Active", "Deleted"))
                    }
                    "RESTORE" -> {
                        logisticPaid = payment.cashAmount; usdRmb = payment.exchangeRate; mode = payment.rateMode
                        paymentDate = payment.paymentDate.toString(); extraPaid = payment.extraAmount
                        extraCurrency = payment.extraCurrency ?: ""; extraNote = payment.extraNote ?: ""
                        fieldChanges.add(FieldChangeDto("Status", "Deleted", "Active"))
                    }
                    else -> {
                        logisticPaid = payment.cashAmount; usdRmb = payment.exchangeRate; mode = payment.rateMode
                        paymentDate = payment.paymentDate.toString(); extraPaid = payment.extraAmount
                        extraCurrency = payment.extraCurrency ?: ""; extraNote = payment.extraNote ?: ""
                    }
                }

                val apportionedExtra = if (extraPaid > BigDecimal.ZERO)
                    extraPaid.divide(BigDecimal(batchSize), 5, RoundingMode.HALF_UP) else BigDecimal.ZERO

                versions.add(PaymentVersionDto(
                    logisticNum = payment.logisticNum ?: "", isInitial = event.eventType == "CREATE",
                    seq = "V${event.eventSeq.toString().padStart(2, '0')}",
                    dateRecord = event.createdAt.toString(), dateSent = "", paymentDate = paymentDate,
                    logisticPaid = logisticPaid, extraPaid = apportionedExtra, extraCurrency = extraCurrency,
                    extraNote = extraNote, note = event.note ?: "", byUser = event.operator, usdRmb = usdRmb,
                    mode = mode, changes = fieldChanges,
                ))
            }
            versions.reverse()
            paymentVersions.addAll(versions)
        }
        return paymentVersions
    }

    private fun buildOrders(logisticNums: List<String>): List<PaymentOrderDto> {
        val poNums = mutableSetOf<String>()
        for (logisticNum in logisticNums) {
            shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(logisticNum).forEach { poNums.add(it.poNum) }
        }
        val orders = mutableListOf<PaymentOrderDto>()
        for (poNum in poNums) {
            val supplierCode = if (poNum.length >= 2) poNum.substring(0, 2) else ""
            val orderDate = if (poNum.length >= 10) { try { val ds = poNum.substring(2, 10); "${ds.substring(0, 4)}-${ds.substring(4, 6)}-${ds.substring(6, 8)}" } catch (_: Exception) { "" } } else ""
            val poItems = purchaseOrderItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            if (poItems.isEmpty()) continue
            val strategy = purchaseOrderStrategyRepository.findByPoNum(poNum)
            val strategyCurrency = strategy?.currency ?: "RMB"
            val strategyRate = strategy?.exchangeRate ?: BigDecimal.ONE
            val itemCurrency = poItems.firstOrNull()?.currency ?: "RMB"
            var totalRmb = BigDecimal.ZERO; var totalUsd = BigDecimal.ZERO
            val items = poItems.map { poi ->
                val qty = poi.quantity; val unitPrice = poi.unitPrice
                val rate = if (strategyRate > BigDecimal.ZERO) strategyRate else BigDecimal.ONE
                val valueRmb: BigDecimal; val valueUsd: BigDecimal
                if (itemCurrency == "USD") { valueUsd = unitPrice.multiply(BigDecimal(qty)); valueRmb = valueUsd.multiply(rate) }
                else { valueRmb = unitPrice.multiply(BigDecimal(qty)); valueUsd = if (rate > BigDecimal.ZERO) valueRmb.divide(rate, 5, RoundingMode.HALF_UP) else BigDecimal.ZERO }
                totalRmb = totalRmb.add(valueRmb); totalUsd = totalUsd.add(valueUsd)
                PaymentOrderItemDto(sku = poi.sku, qty = qty, unitPrice = unitPrice, currency = itemCurrency, valueRmb = valueRmb.setScale(5, RoundingMode.HALF_UP), valueUsd = valueUsd.setScale(5, RoundingMode.HALF_UP))
            }
            orders.add(PaymentOrderDto(poNum = poNum, supplierCode = supplierCode, orderDate = orderDate, currency = strategyCurrency, exchangeRate = strategyRate, items = items, totalRmb = totalRmb.setScale(5, RoundingMode.HALF_UP), totalUsd = totalUsd.setScale(5, RoundingMode.HALF_UP)))
        }
        return orders
    }

    // ═══════════════════════════════════════════════
    // Internal helpers
    // ═══════════════════════════════════════════════

    /**
     * Safely parse JSON string to Map.
     */
    @Suppress("UNCHECKED_CAST")
    private fun parseJson(json: String): Map<String, Any?> {
        return try {
            objectMapper.readValue(json, Map::class.java) as Map<String, Any?>
        } catch (e: Exception) {
            log.warn("Failed to parse event JSON: {}", e.message)
            emptyMap()
        }
    }

    /**
     * Convert Any? to BigDecimal (handles Number, String).
     */
    private fun toBd(value: Any?): BigDecimal? {
        return when (value) {
            is Number -> BigDecimal(value.toString())
            is String -> try { BigDecimal(value) } catch (_: Exception) { null }
            else -> null
        }
    }

    /**
     * Convert Any? to Int.
     */
    private fun toInt(value: Any?): Int? {
        return when (value) {
            is Number -> value.toInt()
            is String -> try { value.toInt() } catch (_: Exception) { null }
            else -> null
        }
    }

    /**
     * Format a value as BigDecimal string with given scale.
     */
    private fun fmtBd(value: Any?, scale: Int): String {
        val bd = toBd(value) ?: return value?.toString() ?: ""
        return bd.setScale(scale, RoundingMode.HALF_UP).toPlainString()
    }

}
