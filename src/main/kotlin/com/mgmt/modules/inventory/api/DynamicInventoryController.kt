package com.mgmt.modules.inventory.api

import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.domain.inventory.FifoLayerRepository
import com.mgmt.domain.inventory.LandedPriceRepository
import com.mgmt.modules.inventory.domain.repository.StocktakeItemRepository
import com.mgmt.modules.inventory.domain.repository.StocktakeRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderRepository
import com.mgmt.modules.purchase.domain.repository.ReceiveRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentItemRepository
import com.mgmt.modules.purchase.domain.repository.ShipmentRepository
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

/**
 * DynamicInventoryController — Real-time inventory status API.
 *
 * Returns per-SKU: actual_qty, theory_qty, avg_cost, current_cost,
 *                  order_qty, transit_qty, inv_value, order_value, transit_value.
 */
@RestController
@RequestMapping("/inventory/dynamic")
class DynamicInventoryController(
    private val stocktakeRepo: StocktakeRepository,
    private val stocktakeItemRepo: StocktakeItemRepository,
    private val fifoLayerRepo: FifoLayerRepository,
    private val landedPriceRepo: LandedPriceRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val poRepo: PurchaseOrderRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val shipmentRepo: ShipmentRepository,
    private val receiveRepo: ReceiveRepository,
) {

    data class DynamicInvRow(
        val sku: String,
        val avgCost: Double,
        val currentCost: Double,
        val actualQty: Int,
        val theoryQty: Int,
        val invValue: Double,
        val orderQty: Int,
        val orderValue: Double,
        val transitQty: Int,
        val transitValue: Double,
    )

    data class DynamicInvResponse(
        val date: String,
        val matchedStocktakeDate: String?,
        val data: List<DynamicInvRow>,
    )

    @GetMapping
    @RequirePermission("module.inventory.dynamic.view")
    fun getDynamicInventory(
        @RequestParam(required = false) date: String?,
    ): ResponseEntity<Any> {
        val targetDate: LocalDate = try {
            if (date != null) LocalDate.parse(date) else LocalDate.now()
        } catch (e: Exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error<Any>("Invalid date format"))
        }

        // 1. All SKUs — union of FIFO layers + PO items (covers INIT + purchase SKUs)
        val allLayers = fifoLayerRepo.findAll()
        val fifoSkus = allLayers.map { it.sku }.toSet()
        val poSkus = poItemRepo.findDistinctSkus().toSet()
        val allSkus = (fifoSkus + poSkus).toList()

        // 2. Actual inventory — find latest stocktake ≤ targetDate
        val matchedStocktake = stocktakeRepo.findTopByStocktakeDateLessThanEqualOrderByStocktakeDateDesc(targetDate)
        val actualInv = mutableMapOf<String, Int>()
        if (matchedStocktake != null) {
            val items = stocktakeItemRepo.findAllByStocktakeId(matchedStocktake.id)
            items.forEach { actualInv[it.sku] = it.countedQty }
        }

        // 3. Theory inventory — FIFO layers with remaining qty
        val pacificZone = java.time.ZoneId.of("America/Los_Angeles")
        val layersByDate = allLayers.filter {
            it.inDate.atZone(pacificZone).toLocalDate() <= targetDate
        }

        val theoryInv = mutableMapOf<String, Int>()
        val invValue = mutableMapOf<String, Double>()
        val avgCostMap = mutableMapOf<String, Double>()
        val currentCostMap = mutableMapOf<String, Double>()

        // Group layers by SKU for cost calculations
        val layersBySku = layersByDate.groupBy { it.sku }

        // FIX: Build layer-specific landed price maps (replaces buggy (poNum, sku) map)
        // Old approach used Pair(poNum, sku) as key — caused last-write-wins when same
        // SKU shipped via multiple logistics batches at different costs.
        // Correct approach: match each FIFO layer to its own landed price via fifoLayerId/fifoTranId.
        val allLandedPrices = landedPriceRepo.findAll()
        val landedPriceByLayerId = mutableMapOf<Long, BigDecimal>()
        val landedPriceByTranId = mutableMapOf<Long, BigDecimal>()
        allLandedPrices.forEach { lp ->
            if (lp.fifoLayerId != null) {
                landedPriceByLayerId[lp.fifoLayerId!!] = lp.landedPriceUsd
            }
            if (lp.fifoTranId != null) {
                landedPriceByTranId[lp.fifoTranId!!] = lp.landedPriceUsd
            }
        }

        for ((sku, layers) in layersBySku) {
            var totalQty = 0
            var totalValue = BigDecimal.ZERO
            var earliestCost: BigDecimal? = null

            for (layer in layers.sortedBy { it.inDate }) {
                val qty = layer.qtyRemaining
                totalQty += qty

                // FIX: Layer-specific cost lookup (no more key collisions)
                // Priority: 1) landed_price by fifoLayerId  2) landed_price by fifoTranId
                //           3) layer.landedCost              4) layer.unitCost
                val cost = landedPriceByLayerId[layer.id]
                    ?: landedPriceByTranId[layer.inTranId]
                    ?: layer.landedCost
                    ?: layer.unitCost
                totalValue += cost.multiply(BigDecimal(qty))

                // Current cost = earliest non-exhausted layer's cost (FIFO)
                if (qty > 0 && earliestCost == null) {
                    earliestCost = cost
                }
            }

            theoryInv[sku] = totalQty
            invValue[sku] = totalValue.setScale(2, RoundingMode.HALF_UP).toDouble()
            avgCostMap[sku] = if (totalQty > 0) {
                totalValue.divide(BigDecimal(totalQty), 4, RoundingMode.HALF_UP).toDouble()
            } else 0.0
            currentCostMap[sku] = earliestCost?.setScale(4, RoundingMode.HALF_UP)?.toDouble() ?: 0.0
        }

        // 4. Order qty & Transit qty
        val orderQty = mutableMapOf<String, Int>()
        val transitQty = mutableMapOf<String, Int>()
        val orderValue = mutableMapOf<String, Double>()
        val transitValue = mutableMapOf<String, Double>()

        // Get PO items (non-deleted POs with poDate ≤ targetDate)
        val validPos = poRepo.findAll().filter {
            it.deletedAt == null && it.poDate <= targetDate
        }
        val validPoIds = validPos.map { it.id }.toSet()
        val poItems = poItemRepo.findAll().filter {
            it.poId in validPoIds && it.deletedAt == null
        }

        // Get shipment items (non-deleted shipments with sentDate ≤ targetDate)
        val validShipments = shipmentRepo.findAll().filter {
            it.deletedAt == null && it.sentDate <= targetDate
        }
        val validShipmentIds = validShipments.map { it.id }.toSet()
        val sentItems = shipmentItemRepo.findAll().filter {
            it.shipmentId in validShipmentIds && it.deletedAt == null
        }

        // Get receives (non-deleted, receiveDate ≤ targetDate)
        val recvItems = receiveRepo.findAll().filter {
            it.deletedAt == null && it.receiveDate <= targetDate
        }

        // Build sent map: (poNum, sku) → total sent qty
        val sentMap = mutableMapOf<Pair<String, String>, Int>()
        sentItems.forEach { item ->
            val key = Pair(item.poNum, item.sku)
            sentMap[key] = (sentMap[key] ?: 0) + item.quantity
        }

        // Build recv map: (poNum, sku) → total received qty
        val recvMap = mutableMapOf<Pair<String, String>, Int>()
        recvItems.forEach { item ->
            val key = Pair(item.poNum, item.sku)
            recvMap[key] = (recvMap[key] ?: 0) + item.receiveQuantity
        }

        // Calculate per-SKU order & transit
        // FIX: Use qty-weighted average landed price per (poNum, sku) instead of last-write-wins
        data class LpAgg(var totalValue: BigDecimal = BigDecimal.ZERO, var totalQty: Int = 0)
        val landedPriceAgg = mutableMapOf<Pair<String, String>, LpAgg>()
        allLandedPrices.forEach { lp ->
            val key = Pair(lp.poNum, lp.sku)
            val agg = landedPriceAgg.getOrPut(key) { LpAgg() }
            agg.totalValue = agg.totalValue.add(lp.landedPriceUsd.multiply(BigDecimal(lp.quantity)))
            agg.totalQty += lp.quantity
        }

        for (poItem in poItems) {
            val key = Pair(poItem.poNum, poItem.sku)
            val sent = sentMap[key] ?: 0
            val recv = recvMap[key] ?: 0

            val skuOrderQty = maxOf(0, poItem.quantity - sent)
            val skuTransitQty = maxOf(0, sent - recv)

            orderQty[poItem.sku] = (orderQty[poItem.sku] ?: 0) + skuOrderQty
            transitQty[poItem.sku] = (transitQty[poItem.sku] ?: 0) + skuTransitQty

            // FIX: weighted average landed price, fallback to PO unit price (currency-converted)
            val lpAgg = landedPriceAgg[key]
            val priceUsd = if (lpAgg != null && lpAgg.totalQty > 0) {
                lpAgg.totalValue.divide(BigDecimal(lpAgg.totalQty), 5, RoundingMode.HALF_UP).toDouble()
            } else {
                if (poItem.currency == "USD") {
                    poItem.unitPrice.toDouble()
                } else {
                    val rate = poItem.exchangeRate.toDouble()
                    if (rate > 0) poItem.unitPrice.toDouble() / rate else poItem.unitPrice.toDouble()
                }
            }

            if (skuOrderQty > 0) {
                orderValue[poItem.sku] = (orderValue[poItem.sku] ?: 0.0) + skuOrderQty * priceUsd
            }
            if (skuTransitQty > 0) {
                transitValue[poItem.sku] = (transitValue[poItem.sku] ?: 0.0) + skuTransitQty * priceUsd
            }
        }

        // 5. Assemble result
        val result = allSkus.sorted().map { sku ->
            DynamicInvRow(
                sku = sku,
                avgCost = avgCostMap[sku] ?: 0.0,
                currentCost = currentCostMap[sku] ?: 0.0,
                actualQty = actualInv[sku] ?: 0,
                theoryQty = theoryInv[sku] ?: 0,
                invValue = invValue[sku] ?: 0.0,
                orderQty = orderQty[sku] ?: 0,
                orderValue = Math.round((orderValue[sku] ?: 0.0) * 100.0) / 100.0,
                transitQty = transitQty[sku] ?: 0,
                transitValue = Math.round((transitValue[sku] ?: 0.0) * 100.0) / 100.0,
            )
        }

        return ResponseEntity.ok(ApiResponse.ok(DynamicInvResponse(
            date = targetDate.toString(),
            matchedStocktakeDate = matchedStocktake?.stocktakeDate?.toString(),
            data = result,
        )))
    }
}
