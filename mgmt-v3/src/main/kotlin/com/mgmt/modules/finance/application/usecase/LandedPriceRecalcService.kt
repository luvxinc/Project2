package com.mgmt.modules.finance.application.usecase

import com.mgmt.domain.inventory.FifoLayer
import com.mgmt.domain.inventory.FifoLayerRepository
import com.mgmt.domain.inventory.LandedPrice
import com.mgmt.domain.inventory.LandedPriceRepository
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
import com.mgmt.modules.finance.domain.repository.POPaymentRepository
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * LandedPriceRecalcService — recalculate landed prices after payment changes.
 *
 * V1 parity: landed_price.py recalculate_landed_prices() (L1041-1116)
 * + calculate_landed_prices() (L22-381) core algorithm.
 *
 * Key business rule #11: Landed price = actual_price * payment_ratio + fee_per_unit
 * Fee allocation is weight-based across logistics grouping.
 *
 * Trigger points:
 *   - Logistics payment submit/delete/restore → recalculate(logisticNum)
 *   - PO payment submit/delete → recalculateByPoNum(poNum)
 *   - Deposit payment submit/delete → recalculateByPoNum(poNum)
 */
@Service
class LandedPriceRecalcService(
    private val shipmentRepository: ShipmentRepository,
    private val shipmentItemRepository: ShipmentItemRepository,
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val depositPaymentRepository: DepositPaymentRepository,
    private val poPaymentRepository: POPaymentRepository,
    private val purchaseOrderStrategyRepository: PurchaseOrderStrategyRepository,
    private val purchaseOrderItemRepository: PurchaseOrderItemRepository,
    private val productRepository: ProductRepository,
    private val landedPriceRepository: LandedPriceRepository,
    private val fifoLayerRepository: FifoLayerRepository,
    private val receiveRepository: ReceiveRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Recalculate landed prices for all POs affected by a logistics payment change.
     * V1 parity: recalculate_landed_prices(logistic_num=...) (landed_price.py:1062-1086)
     */
    @Transactional
    fun recalculate(logisticNum: String): Int {
        // Get parent logistic num
        val parentLogistic = getParentLogistic(logisticNum)

        // Find all PO nums shipped via this logistics (including children)
        val affectedPoNums = mutableSetOf<String>()
        val allShipments = shipmentRepository.findAllByDeletedAtIsNull()
        for (shipment in allShipments) {
            if (getParentLogistic(shipment.logisticNum) == parentLogistic) {
                val items = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(shipment.logisticNum)
                items.forEach { affectedPoNums.add(it.poNum) }
            }
        }

        return recalculateForPoNums(affectedPoNums.toList(), "logistic=$logisticNum")
    }

    /**
     * Recalculate landed prices for a specific PO.
     * V1 parity: recalculate_landed_prices(po_num=...) (landed_price.py:1059-1060)
     *
     * Called after PO payment or deposit payment submit/delete.
     */
    @Transactional
    fun recalculateByPoNum(poNum: String): Int {
        return recalculateForPoNums(listOf(poNum), "poNum=$poNum")
    }

    /**
     * Shared implementation: recalculate for a list of PO numbers.
     */
    private fun recalculateForPoNums(poNums: List<String>, context: String): Int {
        var updatedCount = 0

        for (poNum in poNums) {
            val prices = calculateLandedPrices(poNum)

            // Update landed_prices table + sync fifo_layers
            for ((key, priceData) in prices) {
                val (logNum, pn, sku) = key
                val existing = landedPriceRepository.findByLogisticNumAndPoNumAndSku(logNum, pn, sku)
                if (existing != null) {
                    existing.landedPriceUsd = priceData.landedPriceUsd
                    existing.quantity = priceData.qty
                    existing.basePriceUsd = priceData.basePriceUsd
                    existing.updatedAt = java.time.Instant.now()
                    landedPriceRepository.save(existing)

                    // Sync fifo_layers.landedCost
                    if (existing.fifoLayerId != null) {
                        val layer = fifoLayerRepository.findById(existing.fifoLayerId!!).orElse(null)
                        if (layer != null) {
                            layer.landedCost = priceData.landedPriceUsd
                            fifoLayerRepository.save(layer)
                        }
                    } else if (existing.fifoTranId != null) {
                        // FIX: Fallback for migrated data where fifoLayerId is NULL.
                        // Match via fifoTranId → layer.inTranId, and backfill fifoLayerId.
                        val layer = fifoLayerRepository.findByInTranId(existing.fifoTranId!!)
                        if (layer != null) {
                            layer.landedCost = priceData.landedPriceUsd
                            fifoLayerRepository.save(layer)
                            // Backfill the linkage for future recalculations
                            existing.fifoLayerId = layer.id
                            landedPriceRepository.save(existing)
                        }
                    }

                    updatedCount++
                }
            }
        }

        log.info("recalculate({}): updated {} landed price records", context, updatedCount)
        return updatedCount
    }

    /**
     * Core landed price calculation for a single PO.
     * V1 parity: calculate_landed_prices(po_num) (landed_price.py:22-381)
     *
     * Full algorithm:
     *   Step 1: Get PO strategy (currency, exchange rate)
     *   Step 2: Get PO total amount
     *   Step 3: Aggregate deposit + PO payments → actual_paid_usd, check override
     *   Step 4: Calculate payment_ratio
     *   Step 5: Aggregate extra fees from deposit + PO payments
     *   Step 6: Get shipment records → group by parent logistics
     *   Step 7: Get SKU weights
     *   Step 8: Get logistics info (cost, payment, extra fees)
     *   Step 9: Calculate total weight per logistics
     *   Step 10: Calculate landed_price = actual_price * payment_ratio + fee_per_unit
     */
    private fun calculateLandedPrices(poNum: String): Map<Triple<String, String, String>, LandedPriceResult> {
        // ========== Step 1: Get PO strategy (V1: L44-57) ==========
        // FIXED: use findFirstByPoNumOrderByStrategySeqDesc for latest version (V1: ORDER BY seq DESC LIMIT 1)
        val strategy = purchaseOrderStrategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum) ?: return emptyMap()
        val orderCurrency = strategy.currency
        val orderUsdRmb = strategy.exchangeRate

        // ========== Step 2: Get PO total (V1: L60-66) ==========
        val poItems = purchaseOrderItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
        if (poItems.isEmpty()) return emptyMap()
        val rawTotal = poItems.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }

        // ========== Step 3: Aggregate actual payments (V1: L68-109) ==========
        // Deposit payments (V1: L70-88)
        var depPaidUsd = BigDecimal.ZERO
        val depositPayments = depositPaymentRepository.findByPoNumActive(poNum)
        for (pmt in depositPayments) {
            val pmtCur = pmt.currency
            val pmtRate = pmt.exchangeRate
            val pmtAmount = pmt.cashAmount.add(pmt.prepayAmount)

            depPaidUsd = if (pmtCur == "USD") {
                depPaidUsd.add(pmtAmount)
            } else {
                if (pmtRate > BigDecimal.ZERO) depPaidUsd.add(pmtAmount.divide(pmtRate, 5, RoundingMode.HALF_UP))
                else depPaidUsd
            }
        }

        // PO payments (V1: L90-109)
        var pmtPaidUsd = BigDecimal.ZERO
        var pmtOverride = false
        val poPayments = poPaymentRepository.findByPoNumActive(poNum)
        for (pmt in poPayments) {
            val pmtCur = pmt.currency
            val pmtRate = pmt.exchangeRate
            val pmtAmount = pmt.cashAmount.add(pmt.prepayAmount)

            pmtPaidUsd = if (pmtCur == "USD") {
                pmtPaidUsd.add(pmtAmount)
            } else {
                if (pmtRate > BigDecimal.ZERO) pmtPaidUsd.add(pmtAmount.divide(pmtRate, 5, RoundingMode.HALF_UP))
                else pmtPaidUsd
            }

            if (pmt.depositOverride == true) {
                pmtOverride = true
            }
        }

        val actualPaidUsd = depPaidUsd.add(pmtPaidUsd)

        // Convert total to USD (V1: L113-117)
        val totalUsd = if (orderCurrency == "USD") rawTotal
        else if (orderUsdRmb > BigDecimal.ZERO) rawTotal.divide(orderUsdRmb, 5, RoundingMode.HALF_UP)
        else BigDecimal.ZERO

        // ========== Step 4: Payment ratio (V1: L119-131) ==========
        // V1 logic: if pmt_override == 1 → is_fully_paid = True
        // else: balance <= 0.01 → is_fully_paid = True
        // if is_fully_paid: payment_ratio = actual_paid / total
        // else: payment_ratio = 1.0 (use theoretical price until paid)
        val isFullyPaid: Boolean = if (pmtOverride) {
            true
        } else {
            val balanceRemainingUsd = totalUsd.subtract(actualPaidUsd)
            balanceRemainingUsd <= BigDecimal("0.01")
        }

        val paymentRatio: BigDecimal = if (isFullyPaid) {
            if (totalUsd > BigDecimal.ZERO) actualPaidUsd.divide(totalUsd, 6, RoundingMode.HALF_UP)
            else BigDecimal.ONE
        } else {
            BigDecimal.ONE
        }

        // ========== Step 5: Aggregate extra fees (V1: L133-168) ==========
        // Deposit extra fees (V1: L134-149)
        var depExtraUsd = BigDecimal.ZERO
        for (pmt in depositPayments) {
            val extraAmt = pmt.extraAmount
            if (extraAmt > BigDecimal.ZERO) {
                val extraCur = pmt.extraCurrency ?: "RMB"
                val pmtRate = pmt.exchangeRate
                depExtraUsd = if (extraCur == "USD") {
                    depExtraUsd.add(extraAmt)
                } else {
                    if (pmtRate > BigDecimal.ZERO) depExtraUsd.add(extraAmt.divide(pmtRate, 5, RoundingMode.HALF_UP))
                    else depExtraUsd
                }
            }
        }

        // PO payment extra fees (V1: L151-166)
        var pmtExtraUsd = BigDecimal.ZERO
        for (pmt in poPayments) {
            val extraAmt = pmt.extraAmount
            if (extraAmt > BigDecimal.ZERO) {
                val extraCur = pmt.extraCurrency ?: "RMB"
                val pmtRate = pmt.exchangeRate
                pmtExtraUsd = if (extraCur == "USD") {
                    pmtExtraUsd.add(extraAmt)
                } else {
                    if (pmtRate > BigDecimal.ZERO) pmtExtraUsd.add(extraAmt.divide(pmtRate, 5, RoundingMode.HALF_UP))
                    else pmtExtraUsd
                }
            }
        }

        val orderExtraUsd = depExtraUsd.add(pmtExtraUsd)

        // ========== Step 6: Get shipment records for this PO (V1: L170-212) ==========
        // FIXED: use efficient repo method instead of full-table scan
        val shipmentItems = shipmentItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
        if (shipmentItems.isEmpty()) return emptyMap()

        // Group by parent logistic (V1: L183-213)
        val parentSkuData = mutableMapOf<String, MutableMap<Pair<String, BigDecimal>, Int>>()
        val allLogistics = shipmentItems.map { it.logisticNum }.distinct()
        val parentLogisticsSet = mutableSetOf<String>()

        for (item in shipmentItems) {
            val parent = getParentLogistic(item.logisticNum)
            parentLogisticsSet.add(parent)
            val skuMap = parentSkuData.getOrPut(parent) { mutableMapOf() }
            val key = Pair(item.sku, item.unitPrice)
            skuMap[key] = (skuMap[key] ?: 0) + item.quantity
        }

        val logisticsCount = parentLogisticsSet.size

        // ========== Step 7: Get SKU weights (V1: L215-221) ==========
        val skuWeightMap = mutableMapOf<String, BigDecimal>()
        for (item in shipmentItems) {
            if (item.sku.uppercase() !in skuWeightMap) {
                val product = productRepository.findBySkuAndDeletedAtIsNull(item.sku)
                val weightKg = if (product != null) BigDecimal(product.weight).divide(BigDecimal(1000), 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO
                skuWeightMap[item.sku.uppercase()] = weightKg
            }
        }

        // ========== Step 8: Get logistics info per parent (V1: L224-290) ==========
        val logisticsInfo = mutableMapOf<String, LogisticsInfo>()
        for (parent in parentLogisticsSet) {
            val shipment = shipmentRepository.findByLogisticNumAndDeletedAtIsNull(parent)
            val totalPriceRmb = shipment?.logisticsCost ?: BigDecimal.ZERO
            val sendUsdRmb = shipment?.exchangeRate ?: BigDecimal("7.0")

            // Check payment
            val payment = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", parent)
            val isPaid = payment != null && payment.cashAmount > BigDecimal.ZERO
            val pmtUsdRmb = if (isPaid) payment!!.exchangeRate else sendUsdRmb

            // Extra fee from logistics payment (V1: L265-270)
            var logExtraUsd = BigDecimal.ZERO
            if (payment != null) {
                val extraPaid = payment.extraAmount
                val extraCur = payment.extraCurrency ?: "RMB"
                logExtraUsd = if (extraCur == "USD") extraPaid
                else if (pmtUsdRmb > BigDecimal.ZERO) extraPaid.divide(pmtUsdRmb, 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO
            }

            // PO count under this logistics (V1: L273-279)
            val relatedLogistics = allLogistics.filter { getParentLogistic(it) == parent }
            val poCount = relatedLogistics.flatMap { logNum ->
                shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(logNum).map { it.poNum }
            }.distinct().size.coerceAtLeast(1)

            val usedUsdRmb = if (isPaid) pmtUsdRmb else sendUsdRmb

            logisticsInfo[parent] = LogisticsInfo(
                totalPriceRmb = totalPriceRmb,
                usdRmb = usedUsdRmb,
                isPaid = isPaid,
                logExtraUsd = logExtraUsd,
                poCount = poCount,
            )
        }

        // ========== Step 9: Calculate total weight per parent logistics (V1: L293-313) ==========
        val logisticsTotalWeight = mutableMapOf<String, BigDecimal>()
        for (parent in parentLogisticsSet) {
            val relatedLogistics = allLogistics.filter { getParentLogistic(it) == parent }
            var totalWeight = BigDecimal.ZERO
            for (logNum in relatedLogistics) {
                val items = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(logNum)
                for (item in items) {
                    val w = skuWeightMap[item.sku.uppercase()] ?: BigDecimal.ZERO
                    totalWeight = totalWeight.add(w.multiply(BigDecimal(item.quantity)))
                }
            }
            logisticsTotalWeight[parent] = totalWeight
        }

        // ========== Step 10: Calculate landed price per SKU (V1: L316-381) ==========
        val result = mutableMapOf<Triple<String, String, String>, LandedPriceResult>()

        for (parent in parentLogisticsSet) {
            val logInfo = logisticsInfo[parent] ?: continue

            // Fee pool: order extras / logistics count + logistics extras / PO count + logistics cost
            val apportionedOrderExtraUsd = if (logisticsCount > 0)
                orderExtraUsd.divide(BigDecimal(logisticsCount), 5, RoundingMode.HALF_UP)
            else BigDecimal.ZERO
            val apportionedLogExtraUsd = if (logInfo.poCount > 0)
                logInfo.logExtraUsd.divide(BigDecimal(logInfo.poCount), 5, RoundingMode.HALF_UP)
            else BigDecimal.ZERO

            val logTotalWeight = logisticsTotalWeight[parent] ?: BigDecimal.ZERO

            // Calculate order weight in this logistics
            val skuData = parentSkuData[parent] ?: continue
            var orderWeightInLog = BigDecimal.ZERO
            for ((skuPrice, qty) in skuData) {
                val w = skuWeightMap[skuPrice.first.uppercase()] ?: BigDecimal.ZERO
                orderWeightInLog = orderWeightInLog.add(w.multiply(BigDecimal(qty)))
            }

            // Weight ratio → logistics cost allocation (V1: L334-341)
            val orderWeightRatio = if (logTotalWeight > BigDecimal.ZERO)
                orderWeightInLog.divide(logTotalWeight, 10, RoundingMode.HALF_UP)
            else BigDecimal.ZERO

            val orderLogCostRmb = logInfo.totalPriceRmb.multiply(orderWeightRatio)
            val orderLogCostUsd = if (logInfo.usdRmb > BigDecimal.ZERO)
                orderLogCostRmb.divide(logInfo.usdRmb, 5, RoundingMode.HALF_UP)
            else BigDecimal.ZERO

            val feePoolUsd = apportionedOrderExtraUsd.add(apportionedLogExtraUsd).add(orderLogCostUsd)

            // Per-SKU calculation (V1: L346-379)
            for ((skuPrice, qty) in skuData) {
                val (sku, basePrice) = skuPrice

                // Convert to USD (V1: L348-351)
                val priceUsd = if (orderCurrency == "USD") basePrice
                else if (orderUsdRmb > BigDecimal.ZERO) basePrice.divide(orderUsdRmb, 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO

                // Actual price = theoretical price * payment_ratio (V1: L354)
                val actualPriceUsd = priceUsd.multiply(paymentRatio)

                // Fee apportionment by weight (V1: L357-364)
                val skuWeightKg = skuWeightMap[sku.uppercase()] ?: BigDecimal.ZERO
                val skuTotalWeight = skuWeightKg.multiply(BigDecimal(qty))

                val feeApportionedUsd = if (orderWeightInLog > BigDecimal.ZERO && qty > 0) {
                    val weightRatio = skuTotalWeight.divide(orderWeightInLog, 10, RoundingMode.HALF_UP)
                    feePoolUsd.multiply(weightRatio).divide(BigDecimal(qty), 5, RoundingMode.HALF_UP)
                } else BigDecimal.ZERO

                // Landed price = actual_price + fee (V1: L367)
                val landedPriceUsd = actualPriceUsd.add(feeApportionedUsd)

                val key = Triple(parent, poNum, sku)
                result[key] = LandedPriceResult(
                    landedPriceUsd = landedPriceUsd.setScale(5, RoundingMode.HALF_UP),
                    qty = qty,
                    basePriceUsd = priceUsd.setScale(5, RoundingMode.HALF_UP),
                    paymentRatio = paymentRatio,
                    feeApportionedUsd = feeApportionedUsd.setScale(5, RoundingMode.HALF_UP),
                )
            }
        }

        return result
    }

    /**
     * Extract parent logistic num from a potentially-child logistic num.
     * V1 parity: get_parent_logistic() (landed_price.py:184-189)
     *
     * V1 logic: if '_delay_' in logistic_num or '_V' in logistic_num → parts[0]
     * Examples:
     *   L12345_delay_V01 → L12345
     *   L12345_V01 → L12345
     *   L12345 → L12345
     */
    private fun getParentLogistic(logisticNum: String): String {
        // FIXED: match both _delay_ and _V patterns (V1: L186)
        if ("_delay_" in logisticNum || "_V" in logisticNum) {
            return logisticNum.split("_")[0]
        }
        return logisticNum
    }

    private data class LogisticsInfo(
        val totalPriceRmb: BigDecimal,
        val usdRmb: BigDecimal,
        val isPaid: Boolean,
        val logExtraUsd: BigDecimal,
        val poCount: Int,
    )

    private data class LandedPriceResult(
        val landedPriceUsd: BigDecimal,
        val qty: Int,
        val basePriceUsd: BigDecimal,
        val paymentRatio: BigDecimal = BigDecimal.ONE,
        val feeApportionedUsd: BigDecimal = BigDecimal.ZERO,
    )
}
