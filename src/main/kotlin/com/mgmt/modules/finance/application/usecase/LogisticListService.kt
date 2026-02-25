package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.LogisticListItemDto
import com.mgmt.modules.finance.application.dto.LogisticListResponse
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.model.Receive
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.repository.ReceiveRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.temporal.ChronoUnit

/**
 * LogisticListService — logistics cost list query.
 *
 *
 * Key business rules (100% ):
 *   1. Payment status 4-state: unpaid / paid / partial / deleted (tolerance 0.01)
 *   2. Parent-child relationship: regex ^(.+)_delay_V\d+$
 *   3. Children don't show independently; attached to parent's children[]
 *   4. USD conversion: 5 decimal places
 *   5. rate_mode prefers shipment.rateMode (V1: in_send.mode)
 *   6. Sorting: logistic_num / date_sent, asc / desc
 */
@Service
class LogisticListService(
    private val shipmentRepository: ShipmentRepository,
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val receiveRepository: ReceiveRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val DELAY_PATTERN = Regex("""^(.+)_delay_V\d+$""")

    fun getLogisticList(sortBy: String = "date_sent", sortOrder: String = "desc"): LogisticListResponse {
        // Validate sort params (V1: logistic.py:52-60)
        val validSortBy = if (sortBy in listOf("logistic_num", "date_sent")) sortBy else "date_sent"
        val validSortOrder = if (sortOrder in listOf("asc", "desc")) sortOrder else "desc"

        // Step 1: Get all shipments (V1: Step 2 — in_send latest seq)
        val allShipments = shipmentRepository.findAllByDeletedAtIsNull()
        if (allShipments.isEmpty()) {
            return LogisticListResponse(data = emptyList(), count = 0)
        }

        val shipmentMap: Map<String, Shipment> = allShipments.associateBy { it.logisticNum }
        val logisticNums = allShipments.map { it.logisticNum }

        // Step 2: Get payment info (V1: Step 3 — in_pmt_logistic_final)
        val allPayments = logisticPaymentRepository.findAllActiveLogistics()
        val paymentMap: Map<String, Payment> = allPayments.associateBy { it.logisticNum ?: "" }

        // Also get deleted payment logistic nums for "deleted" status
        val deletedPaymentNums = logisticPaymentRepository.findDeletedLogisticNums()

        // Step 3: Get receive dates (V1: Step 4 — in_receive_final GROUP BY logistic_num)
        val receiveDateMap: Map<String, java.time.LocalDate> = buildReceiveDateMap(logisticNums)

        // Step 4: Identify parent-child relationships (V1: Step 5)
        val parentChildMap = mutableMapOf<String, MutableList<String>>()
        val childToParent = mutableMapOf<String, String>()

        for (logisticNum in logisticNums) {
            val match = DELAY_PATTERN.matchEntire(logisticNum)
            if (match != null) {
                val parentNum = match.groupValues[1]
                if (parentNum in shipmentMap) {
                    childToParent[logisticNum] = parentNum
                    parentChildMap.getOrPut(parentNum) { mutableListOf() }.add(logisticNum)
                }
            }
        }

        // Step 5: Build order items (V1: Step 6 — build_order_item)
        val orders = mutableListOf<LogisticListItemDto>()
        for (logisticNum in logisticNums) {
            // Skip children — they attach to parent (V1: logistic.py:282-284)
            if (logisticNum in childToParent) continue

            val item = buildOrderItem(
                logisticNum, shipmentMap, paymentMap, deletedPaymentNums,
                receiveDateMap, parentChildMap, isChild = false
            )

            // Attach children (V1: logistic.py:289-294)
            val children = if (logisticNum in parentChildMap) {
                parentChildMap[logisticNum]!!.sorted().map { childNum ->
                    buildOrderItem(
                        childNum, shipmentMap, paymentMap, deletedPaymentNums,
                        receiveDateMap, parentChildMap, isChild = true
                    )
                }
            } else emptyList()

            orders.add(item.copy(children = children))
        }

        // Step 6: Sort (V1: Step 7)
        val sorted = when (validSortBy) {
            "logistic_num" -> if (validSortOrder == "asc") orders.sortedBy { it.logisticNum }
                else orders.sortedByDescending { it.logisticNum }
            else -> if (validSortOrder == "asc") orders.sortedBy { it.dateSent }
                else orders.sortedByDescending { it.dateSent }
        }

        return LogisticListResponse(data = sorted, count = sorted.size)
    }

    /**
     * Build a single logistic list item: build_order_item() (logistic.py:175-278)
     */
    private fun buildOrderItem(
        logisticNum: String,
        shipmentMap: Map<String, Shipment>,
        paymentMap: Map<String, Payment>,
        deletedPaymentNums: Set<String>,
        receiveDateMap: Map<String, java.time.LocalDate>,
        parentChildMap: Map<String, MutableList<String>>,
        isChild: Boolean,
    ): LogisticListItemDto {
        val shipment = shipmentMap[logisticNum]

        // Shipment info (V1: in_send latest seq)
        val dateSent = shipment?.sentDate?.toString() ?: "-"
        val dateEta = shipment?.etaDate?.toString() ?: "-"
        val pallets = shipment?.pallets ?: 0
        val priceKg = shipment?.priceKg ?: BigDecimal.ZERO
        val totalWeight = shipment?.totalWeight ?: BigDecimal.ZERO
        val totalPriceRmb = shipment?.logisticsCost ?: BigDecimal.ZERO
        val usdRmb = shipment?.exchangeRate ?: BigDecimal("7.0")
        val rateMode = shipment?.rateMode ?: "M"

        // USD conversion — 5 decimal places (V1: logistic.py:181)
        val totalPriceUsd = if (usdRmb > BigDecimal.ZERO) {
            totalPriceRmb.divide(usdRmb, 5, RoundingMode.HALF_UP)
        } else BigDecimal.ZERO

        // Payment status (V1: logistic.py:183-202)
        val payment = paymentMap[logisticNum]
        val logisticPaid = payment?.cashAmount ?: BigDecimal.ZERO
        val paymentDate = payment?.paymentDate?.toString()
        val pmtNo = payment?.paymentNo
        val isDeletedPayment = logisticNum in deletedPaymentNums && payment == null

        val diff = (totalPriceRmb - logisticPaid).abs()
        val paymentStatus: String
        val isPaid: Boolean

        if (isDeletedPayment) {
            paymentStatus = "deleted"
            isPaid = false
        } else if (logisticPaid == BigDecimal.ZERO) {
            paymentStatus = "unpaid"
            isPaid = false
        } else if (diff < BigDecimal("0.01")) {
            paymentStatus = "paid"
            isPaid = true
        } else {
            paymentStatus = "partial"
            isPaid = false
        }

        // Receive date (V1: logistic.py:204-206)
        val receiveDate = receiveDateMap[logisticNum]
        val receiveDateStr = receiveDate?.toString() ?: "-"

        // Day calculations (V1: logistic.py:213-231)
        val etaDays = if (shipment?.sentDate != null && shipment.etaDate != null) {
            ChronoUnit.DAYS.between(shipment.sentDate, shipment.etaDate).toInt()
        } else null

        val actualDays = if (shipment?.sentDate != null && receiveDate != null) {
            ChronoUnit.DAYS.between(shipment.sentDate, receiveDate).toInt()
        } else null

        // Extra fee handling (V1: logistic.py:233-247)
        val extraPaid = payment?.extraAmount ?: BigDecimal.ZERO
        val extraCurrency = payment?.extraCurrency ?: ""

        val extraPaidUsd = when {
            extraCurrency == "RMB" && usdRmb > BigDecimal.ZERO ->
                extraPaid.divide(usdRmb, 5, RoundingMode.HALF_UP)
            extraCurrency == "USD" -> extraPaid.setScale(5, RoundingMode.HALF_UP)
            else -> BigDecimal.ZERO.setScale(5)
        }

        val totalWithExtraUsd = (totalPriceUsd + extraPaidUsd).setScale(5, RoundingMode.HALF_UP)
        val totalWithExtraRmb = (totalWithExtraUsd * usdRmb).setScale(5, RoundingMode.HALF_UP)

        // Payment mode
        val paymentMode = payment?.rateMode ?: ""

        return LogisticListItemDto(
            logisticNum = logisticNum,
            isPaid = isPaid,
            paymentStatus = paymentStatus,
            dateSent = dateSent,
            dateEta = dateEta,
            receiveDate = receiveDateStr,
            etaDays = etaDays,
            actualDays = actualDays,
            pallets = pallets,
            priceKg = priceKg.setScale(5, RoundingMode.HALF_UP),
            totalWeight = totalWeight.setScale(5, RoundingMode.HALF_UP),
            usdRmb = usdRmb.setScale(4, RoundingMode.HALF_UP),
            rateMode = rateMode,
            paymentMode = paymentMode,
            totalPriceRmb = totalPriceRmb.setScale(5, RoundingMode.HALF_UP),
            totalPriceUsd = totalPriceUsd,
            logisticPaid = logisticPaid.setScale(5, RoundingMode.HALF_UP),
            paymentDate = paymentDate,
            pmtNo = pmtNo,
            extraPaid = extraPaid.setScale(5, RoundingMode.HALF_UP),
            extraCurrency = extraCurrency,
            extraPaidUsd = extraPaidUsd,
            totalWithExtraUsd = totalWithExtraUsd,
            totalWithExtraRmb = totalWithExtraRmb,
            isChild = isChild,
            hasChildren = logisticNum in parentChildMap,
            children = emptyList(), // filled by caller
            isDeleted = isDeletedPayment,
        )
    }

    /**
     * Build receive date map: logisticNum -> MIN(receiveDate)
     */
    private fun buildReceiveDateMap(logisticNums: List<String>): Map<String, java.time.LocalDate> {
        if (logisticNums.isEmpty()) return emptyMap()
        // FIX: batch-load all receives at once instead of per-logisticNum (N+1)
        val allReceives = receiveRepository.findAllByDeletedAtIsNullOrderByReceiveDateDesc()
            .filter { it.logisticNum in logisticNums.toSet() }
        return allReceives.groupBy { it.logisticNum }
            .mapValues { (_, receives) -> receives.minOf { it.receiveDate } }
    }
}
