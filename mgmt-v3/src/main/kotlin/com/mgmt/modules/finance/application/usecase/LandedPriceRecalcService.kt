package com.mgmt.modules.finance.application.usecase

import com.mgmt.domain.inventory.FifoLayer
import com.mgmt.domain.inventory.FifoLayerRepository
import com.mgmt.domain.inventory.LandedPrice
import com.mgmt.domain.inventory.LandedPriceRepository
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
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
 */
@Service
class LandedPriceRecalcService(
    private val shipmentRepository: ShipmentRepository,
    private val shipmentItemRepository: ShipmentItemRepository,
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val purchaseOrderStrategyRepository: PurchaseOrderStrategyRepository,
    private val purchaseOrderItemRepository: PurchaseOrderItemRepository,
    private val productRepository: ProductRepository,
    private val landedPriceRepository: LandedPriceRepository,
    private val fifoLayerRepository: FifoLayerRepository,
    private val receiveRepository: ReceiveRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val DELAY_PATTERN = Regex("""^(.+)_delay_V\d+$""")

    /**
     * Recalculate landed prices for all POs affected by a logistics payment change.
     * V1 parity: recalculate_landed_prices(logistic_num=...) (landed_price.py:1041-1116)
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

        var updatedCount = 0

        for (poNum in affectedPoNums) {
            val prices = calculateLandedPrices(poNum)

            // Update landed_prices table
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
                    }

                    updatedCount++
                }
            }
        }

        log.info("recalculate({}): updated {} landed price records", logisticNum, updatedCount)
        return updatedCount
    }

    /**
     * Core landed price calculation for a single PO.
     * V1 parity: calculate_landed_prices(po_num) (landed_price.py:22-381)
     */
    private fun calculateLandedPrices(poNum: String): Map<Triple<String, String, String>, LandedPriceResult> {
        // Step 1: Get PO strategy (V1: L44-57)
        val strategy = purchaseOrderStrategyRepository.findByPoNum(poNum) ?: return emptyMap()
        val orderCurrency = strategy.currency
        val orderUsdRmb = strategy.exchangeRate

        // Step 2: Get PO total (V1: L60-66)
        val poItems = purchaseOrderItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
        if (poItems.isEmpty()) return emptyMap()
        val rawTotal = poItems.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }

        // Step 3: Payment status (simplified — check if any PO payments exist)
        val totalUsd = if (orderCurrency == "USD") rawTotal
        else if (orderUsdRmb > BigDecimal.ZERO) rawTotal.divide(orderUsdRmb, 5, RoundingMode.HALF_UP)
        else BigDecimal.ZERO

        // For logistics recalc, we use payment_ratio = 1.0 (simplified)
        // Full payment ratio calculation is in the purchase payment module
        val paymentRatio = BigDecimal.ONE

        // Step 4: Extra fees from order payments (simplified — 0 for now, handled in full flow)
        val orderExtraUsd = BigDecimal.ZERO

        // Step 5: Get shipment records for this PO (V1: L171-177)
        val shipmentItems = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull("").let {
            // Get ALL shipment items for this PO across all logistics
            val allItems = mutableListOf<com.mgmt.modules.purchase.domain.model.ShipmentItem>()
            val allShipments = shipmentRepository.findAllByDeletedAtIsNull()
            for (shipment in allShipments) {
                val items = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(shipment.logisticNum)
                allItems.addAll(items.filter { it.poNum == poNum })
            }
            allItems
        }

        if (shipmentItems.isEmpty()) return emptyMap()

        // Step 6: Group by parent logistic (V1: L183-213)
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

        // Step 7: Get SKU weights (V1: L215-221)
        val skuWeightMap = mutableMapOf<String, BigDecimal>()
        for (item in shipmentItems) {
            if (item.sku.uppercase() !in skuWeightMap) {
                val product = productRepository.findBySkuAndDeletedAtIsNull(item.sku)
                val weightKg = if (product != null) BigDecimal(product.weight).divide(BigDecimal(1000), 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO
                skuWeightMap[item.sku.uppercase()] = weightKg
            }
        }

        // Step 8: Get logistics info per parent (V1: L224-290)
        val logisticsInfo = mutableMapOf<String, LogisticsInfo>()
        for (parent in parentLogisticsSet) {
            val shipment = shipmentRepository.findByLogisticNumAndDeletedAtIsNull(parent)
            val totalPriceRmb = shipment?.logisticsCost ?: BigDecimal.ZERO
            val sendUsdRmb = shipment?.exchangeRate ?: BigDecimal("7.0")

            // Check payment
            val payment = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", parent)
            val isPaid = payment != null && payment.cashAmount > BigDecimal.ZERO
            val pmtUsdRmb = if (isPaid) payment!!.exchangeRate else sendUsdRmb

            // Extra fee from logistics payment
            var logExtraUsd = BigDecimal.ZERO
            if (payment != null) {
                val extraPaid = payment.extraAmount
                val extraCur = payment.extraCurrency ?: "RMB"
                logExtraUsd = if (extraCur == "USD") extraPaid
                else if (pmtUsdRmb > BigDecimal.ZERO) extraPaid.divide(pmtUsdRmb, 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO
            }

            // PO count under this logistics
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

        // Step 9: Calculate total weight per parent logistics (V1: L293-313)
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

        // Step 10: Calculate landed price per SKU (V1: L316-381)
        val result = mutableMapOf<Triple<String, String, String>, LandedPriceResult>()

        for (parent in parentLogisticsSet) {
            val logInfo = logisticsInfo[parent] ?: continue
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

            // Weight ratio -> logistics cost allocation
            val orderWeightRatio = if (logTotalWeight > BigDecimal.ZERO)
                orderWeightInLog.divide(logTotalWeight, 10, RoundingMode.HALF_UP)
            else BigDecimal.ZERO

            val orderLogCostRmb = logInfo.totalPriceRmb.multiply(orderWeightRatio)
            val orderLogCostUsd = if (logInfo.usdRmb > BigDecimal.ZERO)
                orderLogCostRmb.divide(logInfo.usdRmb, 5, RoundingMode.HALF_UP)
            else BigDecimal.ZERO

            val feePoolUsd = apportionedOrderExtraUsd.add(apportionedLogExtraUsd).add(orderLogCostUsd)

            // Per-SKU calculation
            for ((skuPrice, qty) in skuData) {
                val (sku, basePrice) = skuPrice

                // Convert to USD
                val priceUsd = if (orderCurrency == "USD") basePrice
                else if (orderUsdRmb > BigDecimal.ZERO) basePrice.divide(orderUsdRmb, 5, RoundingMode.HALF_UP)
                else BigDecimal.ZERO

                val actualPriceUsd = priceUsd.multiply(paymentRatio)

                // Fee apportionment by weight
                val skuWeightKg = skuWeightMap[sku.uppercase()] ?: BigDecimal.ZERO
                val skuTotalWeight = skuWeightKg.multiply(BigDecimal(qty))

                val feeApportionedUsd = if (orderWeightInLog > BigDecimal.ZERO && qty > 0) {
                    val weightRatio = skuTotalWeight.divide(orderWeightInLog, 10, RoundingMode.HALF_UP)
                    feePoolUsd.multiply(weightRatio).divide(BigDecimal(qty), 5, RoundingMode.HALF_UP)
                } else BigDecimal.ZERO

                val landedPriceUsd = actualPriceUsd.add(feeApportionedUsd)

                val key = Triple(parent, poNum, sku)
                result[key] = LandedPriceResult(
                    landedPriceUsd = landedPriceUsd.setScale(4, RoundingMode.HALF_UP),
                    qty = qty,
                    basePriceUsd = priceUsd.setScale(4, RoundingMode.HALF_UP),
                )
            }
        }

        return result
    }

    /**
     * Extract parent logistic num from a potentially-child logistic num.
     * V1 parity: get_parent_logistic() (landed_price.py:184-189)
     */
    private fun getParentLogistic(logisticNum: String): String {
        val match = DELAY_PATTERN.matchEntire(logisticNum)
        return match?.groupValues?.get(1) ?: logisticNum
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
    )
}
