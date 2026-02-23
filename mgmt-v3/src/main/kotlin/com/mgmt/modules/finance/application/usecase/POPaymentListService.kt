package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.finance.domain.repository.POPaymentRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.ReceiveDiffRepository
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * POPaymentListService — builds the PO payment (balance payment) list view.
 *
 * Key differences from DepositListService:
 *   1. Shows ALL POs (not just deposit-required ones)
 *   2. Includes deposit paid aggregation
 *   3. Balance = totalAmount - depositPaid - poPaid
 *   4. Exchange rate fluctuation detection
 *   5. Receive diff blocking logic
 */
@Service
class POPaymentListService(
    private val purchaseOrderRepository: PurchaseOrderRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
    private val depositPaymentRepository: DepositPaymentRepository,
    private val poPaymentRepository: POPaymentRepository,
    private val supplierRepository: SupplierRepository,
    private val receiveDiffRepository: ReceiveDiffRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional(readOnly = true)
    fun getPOPaymentList(sortBy: String = "po_date", sortOrder: String = "desc"): POPaymentListResponse {
        // Step 1: Get ALL POs (no requireDeposit filter)
        val allPOs = purchaseOrderRepository.findAllByDeletedAtIsNullOrderByPoDateDesc()

        val poContexts = mutableListOf<POPaymentContext>()
        for (po in allPOs) {
            val latestStrategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(po.poNum)
                ?: continue

            poContexts.add(POPaymentContext(
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
            return POPaymentListResponse(data = emptyList(), count = 0)
        }

        // Step 2: Get supplier names
        val supplierCodes = poContexts.map { it.supplierCode }.distinct()
        val supplierMap = mutableMapOf<String, String>()
        for (code in supplierCodes) {
            val supplier = supplierRepository.findBySupplierCodeAndDeletedAtIsNull(code)
            if (supplier != null) {
                supplierMap[code] = supplier.supplierName
            }
        }

        // Step 3: Get order totals
        val poNums = poContexts.map { it.poNum }
        val orderStatsMap = mutableMapOf<String, OrderStats>()
        for (poNum in poNums) {
            val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val skuCount = items.map { it.sku }.distinct().size
            val totalAmount = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
            orderStatsMap[poNum] = OrderStats(skuCount, totalAmount)
        }

        // Step 4: Get deposit payments (aggregate per PO)
        val depositPayments = depositPaymentRepository.findDepositPaymentsByPoNums(poNums)
        val depositPaymentMap = depositPayments.groupBy { it.poNum ?: "" }

        // Step 5: Get PO payments (aggregate per PO)
        val poPayments = poPaymentRepository.findPOPaymentsByPoNums(poNums)
        val poPaymentMap = poPayments.groupBy { it.poNum ?: "" }

        // Step 6: Get receive diffs for blocking
        val pendingDiffs = receiveDiffRepository.findAllByPoNumInAndStatus(poNums, "pending")
        val diffMap = pendingDiffs.groupBy { it.poNum }

        // Step 7: Build result items
        val orders = mutableListOf<POPaymentListItem>()

        for (ctx in poContexts) {
            val poNum = ctx.poNum
            val stats = orderStatsMap[poNum] ?: OrderStats(0, BigDecimal.ZERO)
            val depPmts = depositPaymentMap[poNum] ?: emptyList()
            val poPmts = poPaymentMap[poNum] ?: emptyList()
            val diffs = diffMap[poNum] ?: emptyList()

            val poDate = parsePoDate(poNum)
            val totalAmount = stats.totalAmount.setScale(5, RoundingMode.HALF_UP).toDouble()
            val curCurrency = ctx.currency
            val curUsdRmb = ctx.exchangeRate.setScale(4, RoundingMode.HALF_UP).toDouble()
            val depositPar = ctx.depositRatio.setScale(1, RoundingMode.HALF_UP).toDouble()

            val rateSource = if (ctx.rateMode == "auto") "Auto" else "Manual"
            val rateSourceCode = if (ctx.rateMode == "auto") "AUTO" else "MANUAL"

            // Deposit calculation
            val depositAmountBD = stats.totalAmount.multiply(ctx.depositRatio)
                .divide(BigDecimal("100"), 10, RoundingMode.HALF_UP)
            val depositAmount = depositAmountBD.round5()

            // Currency conversion for totals
            val totalAmountUsd: Double
            val totalAmountRmb: Double
            if (curCurrency == "RMB") {
                totalAmountUsd = stats.totalAmount.divSafe(ctx.exchangeRate).round5()
                totalAmountRmb = totalAmount
            } else {
                totalAmountUsd = totalAmount
                totalAmountRmb = stats.totalAmount.multiply(ctx.exchangeRate).round5()
            }

            // Aggregate deposit paid
            var depositPaidBD = BigDecimal.ZERO
            var depositPaidUsdBD = BigDecimal.ZERO
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
            }

            // Deposit status
            val depositStatus = if (!ctx.requireDeposit) {
                "not_required"
            } else if (depositPaidBD.compareTo(BigDecimal.ZERO) == 0) {
                "unpaid"
            } else if ((depositAmountBD - depositPaidBD).abs() < BigDecimal("0.01")) {
                "paid"
            } else {
                "partial"
            }

            // Aggregate PO paid + build payment details
            var poPaidBD = BigDecimal.ZERO
            var poPaidUsdBD = BigDecimal.ZERO
            var totalExtraFeesUsd = BigDecimal.ZERO
            var totalExtraFeesRmb = BigDecimal.ZERO
            var hasOverride = false

            val paymentDetails = mutableListOf<POPaymentDetail>()

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
                        totalExtraFeesUsd = totalExtraFeesUsd.add(extraAmt)
                        val currentRate = if (pmtRate > BigDecimal.ZERO) pmtRate else ctx.exchangeRate
                        totalExtraFeesRmb = totalExtraFeesRmb.add(extraAmt.multiply(currentRate))
                    } else {
                        totalExtraFeesRmb = totalExtraFeesRmb.add(extraAmt)
                        totalExtraFeesUsd = totalExtraFeesUsd.add(extraAmt.divSafe(pmtRate))
                    }
                }

                // Override check
                if (pmt.depositOverride == true) {
                    hasOverride = true
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

                val pmtDateStr = pmt.paymentDate.toString()
                paymentDetails.add(POPaymentDetail(
                    pmtNo = pmt.paymentNo,
                    poDate = pmtDateStr,
                    poCur = pmtCur,
                    poPaid = pmtAmount.round5(),
                    poPaidCur = pmtRate.setScale(4, RoundingMode.HALF_UP).toDouble(),
                    poCurMode = if (pmt.rateMode == "auto") "A" else "M",
                    poPrepayAmount = prepayAmount.round5(),
                    poOverride = if (pmt.depositOverride == true) 1 else 0,
                    extraAmount = extraAmt.round5(),
                    extraCur = extraCur,
                ))
            }

            // Balance calculation: totalAmount - depositPaid - poPaid
            val balanceRemainingBD = stats.totalAmount.subtract(depositPaidBD).subtract(poPaidBD)
            val balanceRemainingUsdBD = if (curCurrency == "RMB") {
                balanceRemainingBD.divSafe(ctx.exchangeRate)
            } else {
                balanceRemainingBD
            }

            // Exchange rate fluctuation (todayRate = 0.0, frontend computes)
            val todayRate = 0.0
            val fluctuationTriggered = false
            val adjustedBalance = balanceRemainingBD.round5()
            val adjustedBalanceUsd = balanceRemainingUsdBD.round5()

            // Diff blocking
            val unresolvedDiffs = diffs.filter { it.diffQuantity != 0 }
            val hasUnresolvedDiff = unresolvedDiffs.isNotEmpty()
            val diffCount = unresolvedDiffs.size
            val paymentBlocked = hasUnresolvedDiff

            // Payment status (for PO payment)
            val isPaid: Boolean
            val paymentStatus: String
            if (balanceRemainingBD.abs() < BigDecimal("0.01") || balanceRemainingBD <= BigDecimal.ZERO || hasOverride) {
                paymentStatus = "paid"
                isPaid = true
            } else if ((depositPaidBD + poPaidBD).compareTo(BigDecimal.ZERO) == 0) {
                paymentStatus = "unpaid"
                isPaid = false
            } else {
                paymentStatus = "partial"
                isPaid = false
            }

            // Latest payment date
            val latestPaymentDate = poPmts.maxByOrNull { it.paymentDate }?.paymentDate?.toString() ?: "-"

            orders.add(POPaymentListItem(
                poNum = poNum,
                poDate = poDate,
                skuCount = stats.skuCount,
                totalAmount = totalAmount,
                totalAmountUsd = totalAmountUsd,
                totalAmountRmb = totalAmountRmb,
                curCurrency = curCurrency,
                curUsdRmb = curUsdRmb,
                rateSource = rateSource,
                rateSourceCode = rateSourceCode,
                depositPar = depositPar,
                depositAmount = depositAmount,
                depositPaid = depositPaidBD.round5(),
                depositPaidUsd = depositPaidUsdBD.round5(),
                depositStatus = depositStatus,
                poPaid = poPaidBD.round5(),
                poPaidUsd = poPaidUsdBD.round5(),
                balanceRemaining = balanceRemainingBD.round5(),
                balanceRemainingUsd = balanceRemainingUsdBD.round5(),
                floatEnabled = ctx.floatEnabled,
                floatThreshold = ctx.floatThreshold.toDouble(),
                todayRate = todayRate,
                fluctuationTriggered = fluctuationTriggered,
                adjustedBalance = adjustedBalance,
                adjustedBalanceUsd = adjustedBalanceUsd,
                hasUnresolvedDiff = hasUnresolvedDiff,
                diffCount = diffCount,
                paymentBlocked = paymentBlocked,
                paymentStatus = paymentStatus,
                isPaid = isPaid,
                supplierCode = ctx.supplierCode,
                supplierName = supplierMap[ctx.supplierCode] ?: ctx.supplierCode,
                latestPaymentDate = latestPaymentDate,
                extraFeesUsd = totalExtraFeesUsd.round5(),
                extraFeesRmb = totalExtraFeesRmb.round5(),
                paymentDetails = paymentDetails,
            ))
        }

        // Sort
        val sorted = when (sortBy) {
            "po_num" -> if (sortOrder == "desc") orders.sortedByDescending { it.poNum }
                        else orders.sortedBy { it.poNum }
            else -> if (sortOrder == "desc") orders.sortedByDescending { it.poDate }
                    else orders.sortedBy { it.poDate }
        }

        return POPaymentListResponse(data = sorted, count = sorted.size)
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    private fun parsePoDate(poNum: String): String {
        val match = Regex("^[A-Za-z]{2}(\\d{4})(\\d{2})(\\d{2})").find(poNum)
        return if (match != null) {
            val (year, month, day) = match.destructured
            "$year-$month-$day"
        } else ""
    }

    private data class POPaymentContext(
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
}
