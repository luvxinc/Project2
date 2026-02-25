package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.LogisticPaymentRepository
import com.mgmt.modules.finance.domain.repository.POPaymentRepository
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.modules.purchase.domain.repository.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * FlowNativeService — builds the flow overview (订收发总览) natively in V3.
 *
 *
 * Two endpoints:
 *   1. getFlowList()        — 11-step aggregation for all POs
 *   2. getFlowDetail(poNum) — per-PO logistics breakdown with SKU-level landed prices
 */
@Service
class FlowNativeService(
    private val purchaseOrderRepository: PurchaseOrderRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
    private val shipmentItemRepository: ShipmentItemRepository,
    private val shipmentRepository: ShipmentRepository,
    private val receiveRepository: ReceiveRepository,
    private val receiveDiffRepository: ReceiveDiffRepository,
    private val depositPaymentRepository: DepositPaymentRepository,
    private val poPaymentRepository: POPaymentRepository,
    private val logisticPaymentRepository: LogisticPaymentRepository,
    private val productRepository: ProductRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════════════════════════════════════════
    // 1. FLOW LIST — 11-step aggregation
    // ═══════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getFlowList(): FlowListResponse {
        // Step 1: Get all POs + latest strategy (no requireDeposit filter)
        val allPOs = purchaseOrderRepository.findAllByDeletedAtIsNullOrderByPoDateDesc()

        val poContexts = mutableListOf<FlowPOContext>()
        for (po in allPOs) {
            val latestStrategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(po.poNum)
                ?: continue

            poContexts.add(FlowPOContext(
                poNum = po.poNum,
                poId = po.id,
                supplierCode = po.supplierCode,
                currency = latestStrategy.currency,
                exchangeRate = latestStrategy.exchangeRate,
                depositRatio = latestStrategy.depositRatio,
                requireDeposit = latestStrategy.requireDeposit,
                floatEnabled = latestStrategy.floatEnabled,
                floatThreshold = latestStrategy.floatThreshold,
                rateMode = latestStrategy.rateMode,
            ))
        }

        if (poContexts.isEmpty()) {
            return FlowListResponse(data = emptyList(), count = 0)
        }

        val poNums = poContexts.map { it.poNum }

        // Step 2: Get order totals — SUM(unitPrice * quantity) per PO, count distinct SKUs
        val orderStatsMap = mutableMapOf<String, OrderStats>()
        for (poNum in poNums) {
            val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val skuCount = items.map { it.sku }.distinct().size
            val totalAmount = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
            orderStatsMap[poNum] = OrderStats(skuCount, totalAmount)
        }

        // Step 3: Get deposit payments — aggregate per PO
        val depositPayments = depositPaymentRepository.findDepositPaymentsByPoNums(poNums)
        val depositPaymentMap = depositPayments.groupBy { it.poNum ?: "" }

        // Step 4: Get PO payments — aggregate per PO
        val poPayments = poPaymentRepository.findPOPaymentsByPoNums(poNums)
        val poPaymentMap = poPayments.groupBy { it.poNum ?: "" }

        // Step 5: Get shipments — find all ShipmentItems by poNum, collect logisticNums
        // poNum → list of (logisticNum, sku, quantity, unitPrice)
        val poShipmentItemsMap = mutableMapOf<String, MutableList<ShipmentItemInfo>>()
        for (poNum in poNums) {
            val shipmentItems = shipmentItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val infoList = shipmentItems.map { si ->
                ShipmentItemInfo(
                    logisticNum = si.logisticNum,
                    sku = si.sku,
                    quantity = si.quantity,
                    unitPrice = si.unitPrice,
                )
            }
            if (infoList.isNotEmpty()) {
                poShipmentItemsMap[poNum] = infoList.toMutableList()
            }
        }

        // Collect all logistic nums across all POs
        val allLogisticNums = poShipmentItemsMap.values.flatten().map { it.logisticNum }.distinct()

        // Step 6: Get logistics info — totalWeight, logisticsCost, exchangeRate from Shipment
        val shipmentMap = mutableMapOf<String, ShipmentInfo>()
        if (allLogisticNums.isNotEmpty()) {
            val shipments = shipmentRepository.findAllByLogisticNumIn(allLogisticNums)
            for (s in shipments) {
                shipmentMap[s.logisticNum] = ShipmentInfo(
                    logisticNum = s.logisticNum,
                    totalWeight = s.totalWeight,
                    logisticsCost = s.logisticsCost,
                    exchangeRate = s.exchangeRate,
                    status = s.status,
                )
            }
        }

        // Step 7: Get SKU weights from Product.weight (grams → kg by /1000)
        val allProducts = productRepository.findAllByDeletedAtIsNull()
        val skuWeightMap = mutableMapOf<String, BigDecimal>()
        for (p in allProducts) {
            skuWeightMap[p.sku] = BigDecimal(p.weight).divide(BigDecimal("1000"), 10, RoundingMode.HALF_UP)
        }

        // Step 8: Get logistics extra fees — from LogisticPayment's extraAmount
        // logisticNum → extraAmount (USD)
        val logExtraMap = mutableMapOf<String, BigDecimal>()
        for (logNum in allLogisticNums) {
            val logPmt = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", logNum)
            if (logPmt != null && logPmt.extraAmount > BigDecimal.ZERO) {
                logExtraMap[logNum] = logPmt.extraAmount
            }
        }

        // Step 9: Get receive status — check if all logistics for a PO have receives
        // logisticNum → boolean (has receives)
        val logReceiveMap = mutableMapOf<String, Boolean>()
        for (logNum in allLogisticNums) {
            val receives = receiveRepository.findByLogisticNumAndDeletedAtIsNull(logNum)
            logReceiveMap[logNum] = receives.isNotEmpty()
        }

        // Step 10: Get diff status — count diffs with diffQuantity != 0
        val pendingDiffs = receiveDiffRepository.findAllByPoNumInAndStatus(poNums, "pending")
        val diffMap = pendingDiffs.groupBy { it.poNum }

        // Build a global map: for each logisticNum, collect ALL POs' shipped items
        // (needed for weight ratio calculation across all POs sharing a logistics)
        val logToAllShipmentItems = mutableMapOf<String, MutableList<ShipmentItemInfo>>()
        for ((_, items) in poShipmentItemsMap) {
            for (item in items) {
                val parentLog = getParentLogistic(item.logisticNum)
                logToAllShipmentItems.getOrPut(parentLog) { mutableListOf() }.add(item)
            }
        }

        // Also build: for each parent logistics, which POs are involved
        val logToPoNums = mutableMapOf<String, MutableSet<String>>()
        for ((poNum, items) in poShipmentItemsMap) {
            for (item in items) {
                val parentLog = getParentLogistic(item.logisticNum)
                logToPoNums.getOrPut(parentLog) { mutableSetOf() }.add(poNum)
            }
        }

        // Collect all child logisticNums per parent
        val parentToChildLogs = mutableMapOf<String, MutableSet<String>>()
        for (logNum in allLogisticNums) {
            val parent = getParentLogistic(logNum)
            parentToChildLogs.getOrPut(parent) { mutableSetOf() }.add(logNum)
        }

        // Step 11: Build response
        val orders = mutableListOf<FlowOrderItem>()

        for (ctx in poContexts) {
            val poNum = ctx.poNum
            val stats = orderStatsMap[poNum] ?: OrderStats(0, BigDecimal.ZERO)
            val depPmts = depositPaymentMap[poNum] ?: emptyList()
            val poPmts = poPaymentMap[poNum] ?: emptyList()
            val diffs = diffMap[poNum] ?: emptyList()

            val poDate = parsePoDate(poNum)
            val totalAmountBD = stats.totalAmount
            val totalAmount = totalAmountBD.setScale(5, RoundingMode.HALF_UP).toDouble()
            val curCurrency = ctx.currency
            val curUsdRmb = ctx.exchangeRate.setScale(4, RoundingMode.HALF_UP).toDouble()
            val depositPar = ctx.depositRatio.setScale(1, RoundingMode.HALF_UP).toDouble()

            // Currency conversion for order total
            val totalAmountUsd: Double = if (curCurrency == "RMB") {
                totalAmountBD.divSafe(ctx.exchangeRate).round5()
            } else {
                totalAmount
            }

            // Deposit calculation
            val depositAmountBD = totalAmountBD.multiply(ctx.depositRatio)
                .divide(BigDecimal("100"), 10, RoundingMode.HALF_UP)
            val depositRequiredUsd: Double = if (curCurrency == "RMB") {
                depositAmountBD.divSafe(ctx.exchangeRate).round5()
            } else {
                depositAmountBD.round5()
            }

            // Aggregate deposit paid (same logic as POPaymentListService)
            var depositPaidBD = BigDecimal.ZERO
            var depositPaidUsdBD = BigDecimal.ZERO
            var depExtraUsdBD = BigDecimal.ZERO
            var hasDepositOverride = false

            for (pmt in depPmts) {
                val pmtCur = pmt.currency
                val pmtAmount = pmt.cashAmount
                val pmtRate = pmt.exchangeRate
                val prepayAmount = pmt.prepayAmount

                // Cash payment conversion to settlement currency
                if (pmtCur == curCurrency) {
                    depositPaidBD = depositPaidBD.add(pmtAmount)
                } else {
                    if (curCurrency == "USD") {
                        depositPaidBD = depositPaidBD.add(pmtAmount.divSafe(pmtRate))
                    } else {
                        depositPaidBD = depositPaidBD.add(pmtAmount.multiply(pmtRate))
                    }
                }
                depositPaidBD = depositPaidBD.add(prepayAmount)

                // USD amount
                if (pmtCur == "USD") {
                    depositPaidUsdBD = depositPaidUsdBD.add(pmtAmount)
                } else {
                    depositPaidUsdBD = depositPaidUsdBD.add(pmtAmount.divSafe(pmtRate))
                }
                if (curCurrency == "USD") {
                    depositPaidUsdBD = depositPaidUsdBD.add(prepayAmount)
                } else {
                    depositPaidUsdBD = depositPaidUsdBD.add(prepayAmount.divSafe(pmtRate))
                }

                // Deposit extra fees
                val extraAmt = pmt.extraAmount
                val extraCur = pmt.extraCurrency ?: ""
                if (extraAmt > BigDecimal.ZERO) {
                    if (extraCur == "USD") {
                        depExtraUsdBD = depExtraUsdBD.add(extraAmt)
                    } else {
                        depExtraUsdBD = depExtraUsdBD.add(extraAmt.divSafe(pmtRate))
                    }
                }

                if (pmt.depositOverride == true) {
                    hasDepositOverride = true
                }
            }

            // Deposit status
            val depositStatus: String
            val depositStatusText: String
            if (!ctx.requireDeposit) {
                depositStatus = "not_required"
                depositStatusText = "N/A"
            } else if (hasDepositOverride) {
                depositStatus = "override"
                depositStatusText = "OK"
            } else if (depositPaidBD.compareTo(BigDecimal.ZERO) == 0) {
                depositStatus = "unpaid"
                depositStatusText = "Unpaid"
            } else if ((depositAmountBD - depositPaidBD).abs() < BigDecimal("0.01")) {
                depositStatus = "paid"
                depositStatusText = "OK"
            } else {
                depositStatus = "partial"
                depositStatusText = "Partial"
            }

            // Aggregate PO paid
            var poPaidBD = BigDecimal.ZERO
            var poPaidUsdBD = BigDecimal.ZERO
            var pmtExtraUsdBD = BigDecimal.ZERO
            var hasPOOverride = false

            for (pmt in poPmts) {
                val pmtCur = pmt.currency
                val pmtAmount = pmt.cashAmount
                val pmtRate = pmt.exchangeRate
                val prepayAmount = pmt.prepayAmount
                val extraAmt = pmt.extraAmount
                val extraCur = pmt.extraCurrency ?: ""

                // Extra fees
                if (extraAmt > BigDecimal.ZERO) {
                    if (extraCur == "USD") {
                        pmtExtraUsdBD = pmtExtraUsdBD.add(extraAmt)
                    } else {
                        pmtExtraUsdBD = pmtExtraUsdBD.add(extraAmt.divSafe(pmtRate))
                    }
                }

                if (pmt.depositOverride == true) {
                    hasPOOverride = true
                }

                // Cash payment conversion
                if (pmtCur == curCurrency) {
                    poPaidBD = poPaidBD.add(pmtAmount)
                } else {
                    if (curCurrency == "USD") {
                        poPaidBD = poPaidBD.add(pmtAmount.divSafe(pmtRate))
                    } else {
                        poPaidBD = poPaidBD.add(pmtAmount.multiply(pmtRate))
                    }
                }

                // USD amount
                if (pmtCur == "USD") {
                    poPaidUsdBD = poPaidUsdBD.add(pmtAmount)
                } else {
                    poPaidUsdBD = poPaidUsdBD.add(pmtAmount.divSafe(pmtRate))
                }

                // Prepay deduction
                poPaidBD = poPaidBD.add(prepayAmount)
                if (curCurrency == "USD") {
                    poPaidUsdBD = poPaidUsdBD.add(prepayAmount)
                } else {
                    poPaidUsdBD = poPaidUsdBD.add(prepayAmount.divSafe(pmtRate))
                }
            }

            // Balance remaining
            val balanceRemainingBD = totalAmountBD.subtract(depositPaidBD).subtract(poPaidBD)
            val balanceRemainingUsdBD = if (curCurrency == "RMB") {
                balanceRemainingBD.divSafe(ctx.exchangeRate)
            } else {
                balanceRemainingBD
            }

            // Actual paid total
            val actualPaidBD = depositPaidBD.add(poPaidBD)
            val actualPaidUsdBD = depositPaidUsdBD.add(poPaidUsdBD)

            // Is fully paid?
            val isFullyPaid = balanceRemainingBD.abs() < BigDecimal("0.01") ||
                balanceRemainingBD <= BigDecimal.ZERO ||
                hasPOOverride

            // PO payment status (order status)
            val orderStatus: String
            val orderStatusText: String
            if (isFullyPaid) {
                orderStatus = "paid"
                orderStatusText = "OK"
            } else if ((depositPaidBD + poPaidBD).compareTo(BigDecimal.ZERO) == 0) {
                orderStatus = "unpaid"
                orderStatusText = "Unpaid"
            } else {
                orderStatus = "partial"
                orderStatusText = "Partial"
            }

            // Diff status
            val unresolvedDiffs = diffs.filter { it.diffQuantity != 0 }
            val hasDiff = unresolvedDiffs.isNotEmpty()

            // Logistics apportionment (weight-ratio based)
            val poShipItems = poShipmentItemsMap[poNum] ?: emptyList()
            val poParentLogs = poShipItems.map { getParentLogistic(it.logisticNum) }.distinct()

            var logisticsApportionedRmb = BigDecimal.ZERO
            var logisticsApportionedUsd = BigDecimal.ZERO
            var logisticsExtraUsdBD = BigDecimal.ZERO
            val logisticsListSet = mutableSetOf<String>()
            var orderWeightKg = BigDecimal.ZERO

            // Track logistics payment status
            var logTotalPrice = BigDecimal.ZERO
            var logTotalPaid = BigDecimal.ZERO

            for (parentLog in poParentLogs) {
                logisticsListSet.add(parentLog)

                val childLogs = parentToChildLogs[parentLog] ?: continue

                // Total logistics cost for this parent (sum all children)
                var parentLogCostRmb = BigDecimal.ZERO
                var parentLogExRate = BigDecimal.ZERO
                for (childLog in childLogs) {
                    val shipInfo = shipmentMap[childLog] ?: continue
                    parentLogCostRmb = parentLogCostRmb.add(shipInfo.logisticsCost)
                    if (parentLogExRate == BigDecimal.ZERO) {
                        parentLogExRate = shipInfo.exchangeRate
                    }
                }

                // Calculate order weight in this logistics
                var orderWeightInLog = BigDecimal.ZERO
                for (item in poShipItems) {
                    if (getParentLogistic(item.logisticNum) == parentLog) {
                        val skuWeightKg = skuWeightMap[item.sku] ?: BigDecimal.ZERO
                        orderWeightInLog = orderWeightInLog.add(skuWeightKg.multiply(BigDecimal(item.quantity)))
                    }
                }
                orderWeightKg = orderWeightKg.add(orderWeightInLog)

                // Calculate total weight for ratio (all POs' items in this logistics)
                val allItemsInLog = logToAllShipmentItems[parentLog] ?: emptyList()
                var totalWeightForRatio = BigDecimal.ZERO
                for (item in allItemsInLog) {
                    val skuWeightKg = skuWeightMap[item.sku] ?: BigDecimal.ZERO
                    totalWeightForRatio = totalWeightForRatio.add(skuWeightKg.multiply(BigDecimal(item.quantity)))
                }

                // Weight ratio apportionment
                val weightRatio = orderWeightInLog.divSafe(totalWeightForRatio)
                val apportionedRmb = parentLogCostRmb.multiply(weightRatio)
                val logRate = if (parentLogExRate > BigDecimal.ZERO) parentLogExRate else BigDecimal.ONE
                val apportionedUsd = apportionedRmb.divSafe(logRate)

                logisticsApportionedRmb = logisticsApportionedRmb.add(apportionedRmb)
                logisticsApportionedUsd = logisticsApportionedUsd.add(apportionedUsd)

                // Extra fees from logistics
                for (childLog in childLogs) {
                    val extra = logExtraMap[childLog]
                    if (extra != null) {
                        logisticsExtraUsdBD = logisticsExtraUsdBD.add(extra.multiply(weightRatio))
                    }
                }

                // Logistics payment tracking
                logTotalPrice = logTotalPrice.add(apportionedRmb)
                for (childLog in childLogs) {
                    val logPmt = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", childLog)
                    if (logPmt != null) {
                        // Apportion the payment by weight ratio
                        logTotalPaid = logTotalPaid.add(logPmt.cashAmount.multiply(weightRatio))
                    }
                }
            }

            // Logistics payment status
            val logisticsPaymentStatus: String
            if (poParentLogs.isEmpty()) {
                logisticsPaymentStatus = "unpaid"
            } else if (logTotalPaid > BigDecimal.ZERO && (logTotalPrice - logTotalPaid).abs() < BigDecimal("0.01")) {
                logisticsPaymentStatus = "paid"
            } else if (logTotalPaid > BigDecimal.ZERO) {
                logisticsPaymentStatus = "partial"
            } else {
                logisticsPaymentStatus = "unpaid"
            }

            // Logistics receive status
            val logisticsStatus: String
            if (poParentLogs.isEmpty()) {
                logisticsStatus = "none"
            } else {
                val allChildLogs = poParentLogs.flatMap { parentToChildLogs[it] ?: emptySet() }
                val allReceived = allChildLogs.all { logReceiveMap[it] == true }
                logisticsStatus = if (allReceived) "arrived" else "in_transit"
            }

            // Total extra fees
            val totalExtraUsdBD = depExtraUsdBD.add(pmtExtraUsdBD).add(logisticsExtraUsdBD)
            val totalExtraBD = if (curCurrency == "RMB") {
                totalExtraUsdBD.multiply(ctx.exchangeRate)
            } else {
                totalExtraUsdBD
            }

            // Logistics currency/rate (use first parent's exchange rate)
            var logCurrency = "RMB"
            var logUsdRmb = 0.0
            if (poParentLogs.isNotEmpty()) {
                val firstChild = parentToChildLogs[poParentLogs.first()]?.firstOrNull()
                if (firstChild != null) {
                    val shipInfo = shipmentMap[firstChild]
                    if (shipInfo != null) {
                        logCurrency = "RMB"
                        logUsdRmb = shipInfo.exchangeRate.setScale(4, RoundingMode.HALF_UP).toDouble()
                    }
                }
            }

            // Total cost calculation
            val baseCostBD: BigDecimal = if (isFullyPaid) actualPaidBD else totalAmountBD
            val baseCostUsdBD: BigDecimal = if (isFullyPaid) actualPaidUsdBD else BigDecimal.valueOf(totalAmountUsd)
            val totalCostBD = baseCostBD.add(totalExtraBD).add(logisticsApportionedRmb)
            val totalCostUsdBD = baseCostUsdBD.add(totalExtraUsdBD).add(logisticsApportionedUsd)

            // Payment status text (combined)
            val paymentStatusText = when {
                depositStatus == "unpaid" && orderStatus == "unpaid" -> "Unpaid"
                orderStatus == "paid" -> "OK"
                else -> "Partial"
            }

            // Fluctuation (simplified: todayRate=0, frontend computes)
            val fluctuationTriggered = false

            orders.add(FlowOrderItem(
                poNum = poNum,
                poDate = poDate,
                skuCount = stats.skuCount,
                curCurrency = curCurrency,
                curUsdRmb = curUsdRmb,
                totalAmount = totalAmount,
                totalAmountUsd = totalAmountUsd,
                depositRequiredUsd = depositRequiredUsd,
                depositPar = depositPar,
                depositStatus = depositStatus,
                depositStatusText = depositStatusText,
                depPaidUsd = depositPaidUsdBD.round5(),
                pmtPaid = poPaidBD.round5(),
                pmtPaidUsd = poPaidUsdBD.round5(),
                balanceRemaining = balanceRemainingBD.round5(),
                balanceRemainingUsd = balanceRemainingUsdBD.round5(),
                actualPaid = actualPaidBD.round5(),
                actualPaidUsd = actualPaidUsdBD.round5(),
                waiverUsd = if (hasPOOverride && balanceRemainingBD > BigDecimal.ZERO) balanceRemainingUsdBD.round5() else 0.0,
                depExtraUsd = depExtraUsdBD.round5(),
                pmtExtraUsd = pmtExtraUsdBD.round5(),
                logisticsExtraUsd = logisticsExtraUsdBD.round5(),
                totalExtra = totalExtraBD.round5(),
                totalExtraUsd = totalExtraUsdBD.round5(),
                logisticsList = logisticsListSet.sorted(),
                orderWeightKg = orderWeightKg.round5(),
                logisticsApportioned = logisticsApportionedRmb.round5(),
                logisticsApportionedUsd = logisticsApportionedUsd.round5(),
                logisticsCurrency = logCurrency,
                logisticsUsdRmb = logUsdRmb,
                totalCost = totalCostBD.round5(),
                totalCostUsd = totalCostUsdBD.round5(),
                orderStatus = orderStatus,
                orderStatusText = orderStatusText,
                hasDiff = hasDiff,
                logisticsStatus = logisticsStatus,
                logisticsPaymentStatus = logisticsPaymentStatus,
                paymentStatusText = paymentStatusText,
                curFloat = ctx.floatEnabled,
                curExFloat = ctx.floatThreshold.toDouble(),
                fluctuationTriggered = fluctuationTriggered,
            ))
        }

        // Sort by poDate descending (default)
        val sorted = orders.sortedByDescending { it.poDate }

        return FlowListResponse(data = sorted, count = sorted.size)
    }

    // ═══════════════════════════════════════════════
    // 2. FLOW DETAIL — per-PO landed price calculation
    // ═══════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getFlowDetail(poNum: String): FlowDetailResponse {
        // Step 1: Get strategy (currency, rate)
        val latestStrategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(poNum)
            ?: return FlowDetailResponse(data = emptyList(), count = 0, meta = null)

        val curCurrency = latestStrategy.currency
        val curExRate = latestStrategy.exchangeRate

        // Step 2: Get order total
        val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
        val totalAmountBD = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
        val totalAmountUsd = if (curCurrency == "RMB") {
            totalAmountBD.divSafe(curExRate)
        } else {
            totalAmountBD
        }

        // Step 3: Get deposit + PO payments → actual_paid_usd
        val depPmts = depositPaymentRepository.findByPoNumActive(poNum)
        val poPmts = poPaymentRepository.findByPoNumActive(poNum)

        var depositPaidBD = BigDecimal.ZERO
        var poPaidBD = BigDecimal.ZERO
        var depositPaidUsdBD = BigDecimal.ZERO
        var poPaidUsdBD = BigDecimal.ZERO
        var depExtraUsdBD = BigDecimal.ZERO
        var pmtExtraUsdBD = BigDecimal.ZERO

        for (pmt in depPmts) {
            val pmtCur = pmt.currency
            val pmtAmount = pmt.cashAmount
            val pmtRate = pmt.exchangeRate
            val prepayAmount = pmt.prepayAmount

            if (pmtCur == curCurrency) {
                depositPaidBD = depositPaidBD.add(pmtAmount)
            } else {
                if (curCurrency == "USD") {
                    depositPaidBD = depositPaidBD.add(pmtAmount.divSafe(pmtRate))
                } else {
                    depositPaidBD = depositPaidBD.add(pmtAmount.multiply(pmtRate))
                }
            }
            depositPaidBD = depositPaidBD.add(prepayAmount)

            if (pmtCur == "USD") {
                depositPaidUsdBD = depositPaidUsdBD.add(pmtAmount)
            } else {
                depositPaidUsdBD = depositPaidUsdBD.add(pmtAmount.divSafe(pmtRate))
            }
            if (curCurrency == "USD") {
                depositPaidUsdBD = depositPaidUsdBD.add(prepayAmount)
            } else {
                depositPaidUsdBD = depositPaidUsdBD.add(prepayAmount.divSafe(pmtRate))
            }

            // Deposit extra fees
            val extraAmt = pmt.extraAmount
            val extraCur = pmt.extraCurrency ?: ""
            if (extraAmt > BigDecimal.ZERO) {
                if (extraCur == "USD") {
                    depExtraUsdBD = depExtraUsdBD.add(extraAmt)
                } else {
                    depExtraUsdBD = depExtraUsdBD.add(extraAmt.divSafe(pmtRate))
                }
            }
        }

        for (pmt in poPmts) {
            val pmtCur = pmt.currency
            val pmtAmount = pmt.cashAmount
            val pmtRate = pmt.exchangeRate
            val prepayAmount = pmt.prepayAmount

            if (pmtCur == curCurrency) {
                poPaidBD = poPaidBD.add(pmtAmount)
            } else {
                if (curCurrency == "USD") {
                    poPaidBD = poPaidBD.add(pmtAmount.divSafe(pmtRate))
                } else {
                    poPaidBD = poPaidBD.add(pmtAmount.multiply(pmtRate))
                }
            }

            if (pmtCur == "USD") {
                poPaidUsdBD = poPaidUsdBD.add(pmtAmount)
            } else {
                poPaidUsdBD = poPaidUsdBD.add(pmtAmount.divSafe(pmtRate))
            }

            poPaidBD = poPaidBD.add(prepayAmount)
            if (curCurrency == "USD") {
                poPaidUsdBD = poPaidUsdBD.add(prepayAmount)
            } else {
                poPaidUsdBD = poPaidUsdBD.add(prepayAmount.divSafe(pmtRate))
            }

            // PO payment extra fees
            val extraAmt = pmt.extraAmount
            val extraCur = pmt.extraCurrency ?: ""
            if (extraAmt > BigDecimal.ZERO) {
                if (extraCur == "USD") {
                    pmtExtraUsdBD = pmtExtraUsdBD.add(extraAmt)
                } else {
                    pmtExtraUsdBD = pmtExtraUsdBD.add(extraAmt.divSafe(pmtRate))
                }
            }
        }

        val actualPaidBD = depositPaidBD.add(poPaidBD)
        val actualPaidUsdBD = depositPaidUsdBD.add(poPaidUsdBD)

        // Step 4: Calculate payment_ratio
        val isFullyPaid = (totalAmountBD - actualPaidBD).abs() < BigDecimal("0.01") ||
            actualPaidBD >= totalAmountBD
        val paymentRatio: BigDecimal = if (isFullyPaid && totalAmountUsd > BigDecimal.ZERO) {
            actualPaidUsdBD.divSafe(totalAmountUsd)
        } else {
            BigDecimal.ONE
        }

        // Step 5: Get extra fees (dep + pmt) — already computed above
        val orderExtraUsd = depExtraUsdBD.add(pmtExtraUsdBD)

        // Step 6: Get shipped SKUs grouped by parent logistics
        val shipmentItems = shipmentItemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)

        // Group by parent logistics
        data class SkuShipInfo(
            val sku: String,
            val quantity: Int,
            val unitPrice: BigDecimal,
            val logisticNum: String,
        )

        val parentLogToSkus = mutableMapOf<String, MutableList<SkuShipInfo>>()
        val shippedSkuSet = mutableSetOf<String>()
        for (si in shipmentItems) {
            val parentLog = getParentLogistic(si.logisticNum)
            parentLogToSkus.getOrPut(parentLog) { mutableListOf() }.add(SkuShipInfo(
                sku = si.sku,
                quantity = si.quantity,
                unitPrice = si.unitPrice,
                logisticNum = si.logisticNum,
            ))
            shippedSkuSet.add(si.sku)
        }

        // Step 7: Get SKU weights
        val allProducts = productRepository.findAllByDeletedAtIsNull()
        val skuWeightMap = mutableMapOf<String, BigDecimal>()
        for (p in allProducts) {
            skuWeightMap[p.sku] = BigDecimal(p.weight).divide(BigDecimal("1000"), 10, RoundingMode.HALF_UP)
        }

        // Collect unique parent logistics for this PO
        val parentLogList = parentLogToSkus.keys.sorted()
        val logisticsCount = parentLogList.size.coerceAtLeast(1)

        // For each parent logistics, find all child logistic nums and count POs
        val parentToChildLogs = mutableMapOf<String, MutableSet<String>>()
        for (si in shipmentItems) {
            val parent = getParentLogistic(si.logisticNum)
            parentToChildLogs.getOrPut(parent) { mutableSetOf() }.add(si.logisticNum)
        }

        // For po count in each logistics, get all shipment items for child logistics
        val parentLogToPoCount = mutableMapOf<String, Int>()
        for (parentLog in parentLogList) {
            val childLogs = parentToChildLogs[parentLog] ?: emptySet()
            val poNumsInLog = mutableSetOf<String>()
            for (childLog in childLogs) {
                val allItemsInLog = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(childLog)
                for (item in allItemsInLog) {
                    poNumsInLog.add(item.poNum)
                }
            }
            parentLogToPoCount[parentLog] = poNumsInLog.size.coerceAtLeast(1)
        }

        // Step 8: Build logistics blocks
        val blocks = mutableListOf<FlowLogisticsBlock>()
        var metaTotalCostUsd = BigDecimal.ZERO
        var metaTotalCostRmb = BigDecimal.ZERO

        for (parentLog in parentLogList) {
            val childLogs = parentToChildLogs[parentLog] ?: emptySet()
            val skuInfoList = parentLogToSkus[parentLog] ?: emptyList()

            // Logistics cost and exchange rate for this parent
            var logCostRmb = BigDecimal.ZERO
            var logExRate = BigDecimal.ONE
            var logIsPaid = true
            for (childLog in childLogs) {
                val shipInfo = shipmentRepository.findByLogisticNumAndDeletedAtIsNull(childLog)
                if (shipInfo != null) {
                    logCostRmb = logCostRmb.add(shipInfo.logisticsCost)
                    if (logExRate == BigDecimal.ONE && shipInfo.exchangeRate > BigDecimal.ZERO) {
                        logExRate = shipInfo.exchangeRate
                    }
                }
                val logPmt = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", childLog)
                if (logPmt == null) {
                    logIsPaid = false
                }
            }
            // Logistics extra fees for this parent
            var logExtraUsd = BigDecimal.ZERO
            for (childLog in childLogs) {
                val extra = logisticPaymentRepository.findByPaymentTypeAndLogisticNumAndDeletedAtIsNull("logistics", childLog)
                if (extra != null && extra.extraAmount > BigDecimal.ZERO) {
                    logExtraUsd = logExtraUsd.add(extra.extraAmount)
                }
            }

            // Order weight in this logistics
            var orderWeightInLog = BigDecimal.ZERO
            for (info in skuInfoList) {
                val skuWeightKg = skuWeightMap[info.sku] ?: BigDecimal.ZERO
                orderWeightInLog = orderWeightInLog.add(skuWeightKg.multiply(BigDecimal(info.quantity)))
            }

            // Total weight for ratio (all POs in this logistics)
            var totalWeightForRatio = BigDecimal.ZERO
            for (childLog in childLogs) {
                val allItemsInLog = shipmentItemRepository.findAllByLogisticNumAndDeletedAtIsNull(childLog)
                for (item in allItemsInLog) {
                    val skuWeightKg = skuWeightMap[item.sku] ?: BigDecimal.ZERO
                    totalWeightForRatio = totalWeightForRatio.add(skuWeightKg.multiply(BigDecimal(item.quantity)))
                }
            }

            // Weight ratio for this PO in this logistics
            val weightRatio = orderWeightInLog.divSafe(totalWeightForRatio)
            val orderLogCostRmb = logCostRmb.multiply(weightRatio)
            val orderLogCostUsd = orderLogCostRmb.divSafe(logExRate)

            // Fee pool
            val poCountInLog = parentLogToPoCount[parentLog] ?: 1
            val apportionedOrderExtraUsd = orderExtraUsd.divide(BigDecimal(logisticsCount), 10, RoundingMode.HALF_UP)
            val apportionedLogExtraUsd = logExtraUsd.divide(BigDecimal(poCountInLog), 10, RoundingMode.HALF_UP)
            val feePoolUsd = apportionedOrderExtraUsd.add(apportionedLogExtraUsd).add(orderLogCostUsd)

            // Build per-SKU details
            val skuDetails = mutableListOf<FlowSkuDetail>()
            for (info in skuInfoList) {
                val skuWeightKg = skuWeightMap[info.sku] ?: BigDecimal.ZERO
                val skuTotalWeight = skuWeightKg.multiply(BigDecimal(info.quantity))
                val skuWeightRatio = skuTotalWeight.divSafe(orderWeightInLog)

                val feeApportionedTotal = feePoolUsd.multiply(skuWeightRatio)
                val feeApportionedPerUnit = if (info.quantity > 0) {
                    feeApportionedTotal.divide(BigDecimal(info.quantity), 10, RoundingMode.HALF_UP)
                } else {
                    BigDecimal.ZERO
                }

                // Price conversion
                val priceOriginal = info.unitPrice
                val priceUsd = if (curCurrency == "RMB") {
                    priceOriginal.divSafe(curExRate)
                } else {
                    priceOriginal
                }

                // Actual price (adjusted by payment ratio)
                val actualPriceUsd = priceUsd.multiply(paymentRatio)
                val actualPrice = if (curCurrency == "RMB") {
                    actualPriceUsd.multiply(curExRate)
                } else {
                    actualPriceUsd
                }

                // Landed price
                val landedPriceUsd = actualPriceUsd.add(feeApportionedPerUnit)
                val landedPrice = if (curCurrency == "RMB") {
                    landedPriceUsd.multiply(curExRate)
                } else {
                    landedPriceUsd
                }

                // Fee apportioned in settlement currency
                val feeApportioned = if (curCurrency == "RMB") {
                    feeApportionedPerUnit.multiply(curExRate)
                } else {
                    feeApportionedPerUnit
                }

                val totalUsd = landedPriceUsd.multiply(BigDecimal(info.quantity))

                skuDetails.add(FlowSkuDetail(
                    sku = info.sku,
                    priceOriginal = priceOriginal.round5(),
                    priceUsd = priceUsd.round5(),
                    actualPrice = actualPrice.round5(),
                    actualPriceUsd = actualPriceUsd.round5(),
                    feeApportioned = feeApportioned.round5(),
                    feeApportionedUsd = feeApportionedPerUnit.round5(),
                    landedPrice = landedPrice.round5(),
                    landedPriceUsd = landedPriceUsd.round5(),
                    qty = info.quantity,
                    totalUsd = totalUsd.round5(),
                ))

                metaTotalCostUsd = metaTotalCostUsd.add(totalUsd)
                metaTotalCostRmb = metaTotalCostRmb.add(
                    if (curCurrency == "RMB") landedPriceUsd.multiply(curExRate).multiply(BigDecimal(info.quantity))
                    else totalUsd
                )
            }

            blocks.add(FlowLogisticsBlock(
                logisticNum = parentLog,
                currency = "RMB",
                usdRmb = logExRate.setScale(4, RoundingMode.HALF_UP).toDouble(),
                logPriceRmb = orderLogCostRmb.round5(),
                logPriceUsd = orderLogCostUsd.round5(),
                isPaid = logIsPaid,
                skus = skuDetails,
            ))
        }

        // Step 9: Handle unshipped SKUs (NOT_SHIPPED block)
        val allOrderSkus = items.map { it.sku }.distinct()
        val unshippedSkus = allOrderSkus.filter { it !in shippedSkuSet }

        if (unshippedSkus.isNotEmpty()) {
            val unshippedDetails = mutableListOf<FlowSkuDetail>()
            for (sku in unshippedSkus) {
                val orderItem = items.find { it.sku == sku } ?: continue
                val priceOriginal = orderItem.unitPrice
                val priceUsd = if (curCurrency == "RMB") {
                    priceOriginal.divSafe(curExRate)
                } else {
                    priceOriginal
                }
                val actualPriceUsd = priceUsd.multiply(paymentRatio)
                val actualPrice = if (curCurrency == "RMB") {
                    actualPriceUsd.multiply(curExRate)
                } else {
                    actualPriceUsd
                }

                val totalUsd = actualPriceUsd.multiply(BigDecimal(orderItem.quantity))

                unshippedDetails.add(FlowSkuDetail(
                    sku = sku,
                    priceOriginal = priceOriginal.round5(),
                    priceUsd = priceUsd.round5(),
                    actualPrice = actualPrice.round5(),
                    actualPriceUsd = actualPriceUsd.round5(),
                    feeApportioned = 0.0,
                    feeApportionedUsd = 0.0,
                    landedPrice = actualPrice.round5(),
                    landedPriceUsd = actualPriceUsd.round5(),
                    qty = orderItem.quantity,
                    totalUsd = totalUsd.round5(),
                ))

                metaTotalCostUsd = metaTotalCostUsd.add(totalUsd)
                metaTotalCostRmb = metaTotalCostRmb.add(
                    if (curCurrency == "RMB") actualPriceUsd.multiply(curExRate).multiply(BigDecimal(orderItem.quantity))
                    else totalUsd
                )
            }

            blocks.add(FlowLogisticsBlock(
                logisticNum = "NOT_SHIPPED",
                currency = curCurrency,
                usdRmb = curExRate.setScale(4, RoundingMode.HALF_UP).toDouble(),
                logPriceRmb = 0.0,
                logPriceUsd = 0.0,
                isPaid = false,
                skus = unshippedDetails,
            ))
        }

        val meta = FlowDetailMeta(
            totalCostUsd = metaTotalCostUsd.round5(),
            totalCostRmb = metaTotalCostRmb.round5(),
        )

        return FlowDetailResponse(data = blocks, count = blocks.size, meta = meta)
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    /**
     * Extract parent logistics number.
     */
    private fun getParentLogistic(logisticNum: String): String {
        if ("_delay_" in logisticNum || "_V" in logisticNum) {
            return logisticNum.split("_")[0]
        }
        return logisticNum
    }

    private fun parsePoDate(poNum: String): String {
        val match = Regex("^[A-Za-z]{2}(\\d{4})(\\d{2})(\\d{2})").find(poNum)
        return if (match != null) {
            val (year, month, day) = match.destructured
            "$year-$month-$day"
        } else ""
    }

    private data class FlowPOContext(
        val poNum: String,
        val poId: Long,
        val supplierCode: String,
        val currency: String,
        val exchangeRate: BigDecimal,
        val depositRatio: BigDecimal,
        val requireDeposit: Boolean,
        val floatEnabled: Boolean,
        val floatThreshold: BigDecimal,
        val rateMode: String,
    )

    private data class OrderStats(
        val skuCount: Int,
        val totalAmount: BigDecimal,
    )

    private data class ShipmentItemInfo(
        val logisticNum: String,
        val sku: String,
        val quantity: Int,
        val unitPrice: BigDecimal,
    )

    private data class ShipmentInfo(
        val logisticNum: String,
        val totalWeight: BigDecimal,
        val logisticsCost: BigDecimal,
        val exchangeRate: BigDecimal,
        val status: String,
    )
}
