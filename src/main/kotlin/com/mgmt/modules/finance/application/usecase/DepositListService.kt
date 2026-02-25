package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.repository.DepositPaymentRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * DepositListService — builds the deposit payment list view.
 *
 *
 * Key business rules:
 *   1. Only show POs where latest strategy has requireDeposit=true (cur_deposit>0)
 *   2. For each PO: calculate deposit amount, actual paid, pending, balance
 *   3. Currency conversion: RMB /rate → USD, USD *rate → RMB, 5 decimal places
 *   4. Payment status: abs(pending)<0.01 OR has_override → paid, actualPaid==0 → unpaid, else → partial
 *   5. Sort by po_date or po_num (asc/desc)
 */
@Service
class DepositListService(
    private val purchaseOrderRepository: PurchaseOrderRepository,
    private val strategyRepository: PurchaseOrderStrategyRepository,
    private val itemRepository: PurchaseOrderItemRepository,
    private val depositPaymentRepository: DepositPaymentRepository,
    private val supplierRepository: SupplierRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional(readOnly = true)
    fun getDepositList(sortBy: String = "po_date", sortOrder: String = "desc"): DepositListResponse {
        // Step 1: Get all POs with latest strategy having requireDeposit=true
        // V1: SELECT s.po_num, ... FROM in_po_strategy s WHERE s.cur_deposit > 0
        val allPOs = purchaseOrderRepository.findAllByDeletedAtIsNullOrderByPoDateDesc()

        // Collect POs where latest strategy has requireDeposit=true
        val depositPOs = mutableListOf<DepositPOContext>()
        for (po in allPOs) {
            // Get latest strategy version (max strategySeq)
            // V1: SELECT ... FROM in_po_strategy WHERE MAX(seq) AND cur_deposit > 0
            val latestStrategy = strategyRepository.findFirstByPoNumOrderByStrategySeqDesc(po.poNum)
                ?: continue
            if (!latestStrategy.requireDeposit) continue
            if (latestStrategy.depositRatio <= BigDecimal.ZERO) continue

            depositPOs.add(DepositPOContext(
                poNum = po.poNum,
                poId = po.id,
                supplierCode = po.supplierCode,
                currency = latestStrategy.currency,
                exchangeRate = latestStrategy.exchangeRate,
                depositRatio = latestStrategy.depositRatio,
                floatEnabled = latestStrategy.floatEnabled,
                rateMode = latestStrategy.rateMode,
            ))
        }

        if (depositPOs.isEmpty()) {
            return DepositListResponse(data = emptyList(), count = 0)
        }

        // Step 2: Get supplier names (V1: api.py:88-99)
        val supplierCodes = depositPOs.map { it.supplierCode }.distinct()
        val supplierMap = mutableMapOf<String, String>()
        for (code in supplierCodes) {
            val supplier = supplierRepository.findBySupplierCodeAndDeletedAtIsNull(code)
            if (supplier != null) {
                supplierMap[code] = supplier.supplierName
            }
        }

        // Step 3: Get order totals (V1: api.py:117-133)
        val poNums = depositPOs.map { it.poNum }
        val orderStatsMap = mutableMapOf<String, OrderStats>()
        for (poNum in poNums) {
            val items = itemRepository.findAllByPoNumAndDeletedAtIsNull(poNum)
            val skuCount = items.map { it.sku }.distinct().size
            val totalAmount = items.sumOf { it.unitPrice.multiply(BigDecimal(it.quantity)) }
            orderStatsMap[poNum] = OrderStats(skuCount, totalAmount)
        }

        // Step 4: Get payment records (V1: api.py:136-205)
        val payments = depositPaymentRepository.findDepositPaymentsByPoNums(poNums)
        val paymentMap = payments.groupBy { it.poNum ?: "" }

        // Step 4.5: Get latest payment date per PO (V1: api.py:157-173)
        val latestDateMap = mutableMapOf<String, String>()
        for ((poNum, pmts) in paymentMap) {
            val latest = pmts.maxByOrNull { it.paymentDate }
            if (latest != null) {
                latestDateMap[poNum] = latest.paymentDate.toString()
            }
        }

        // Step 5: Build result items (V1: api.py:208-373)
        val orders = mutableListOf<DepositListItem>()

        for (ctx in depositPOs) {
            val poNum = ctx.poNum
            val stats = orderStatsMap[poNum] ?: OrderStats(0, BigDecimal.ZERO)
            val pmts = paymentMap[poNum] ?: emptyList()

            val poDate = parsePoDate(poNum)
            val totalAmount = stats.totalAmount.setScale(5, RoundingMode.HALF_UP).toDouble()
            val curCurrency = ctx.currency
            val curUsdRmb = ctx.exchangeRate.setScale(4, RoundingMode.HALF_UP).toDouble()
            val depositPar = ctx.depositRatio.setScale(1, RoundingMode.HALF_UP).toDouble()
            val rateMode = ctx.rateMode

            val rateSource = if (rateMode == "auto") "Auto" else "Manual"
            val rateSourceCode = if (rateMode == "auto") "AUTO" else "MANUAL"

            // Deposit calculation (V1: api.py:233)
            val depositAmountBD = stats.totalAmount.multiply(ctx.depositRatio)
                .divide(BigDecimal("100"), 10, RoundingMode.HALF_UP)
            val depositAmount = depositAmountBD.round5()

            // Currency conversion (V1: api.py:236-245)
            val totalAmountUsd: Double
            val totalAmountRmb: Double
            val depositAmountUsd: Double
            val depositAmountRmb: Double

            if (curCurrency == "RMB") {
                totalAmountUsd = stats.totalAmount.divSafe(ctx.exchangeRate).round5()
                totalAmountRmb = totalAmount
                depositAmountUsd = depositAmountBD.divSafe(ctx.exchangeRate).round5()
                depositAmountRmb = depositAmount
            } else {
                totalAmountUsd = totalAmount
                totalAmountRmb = stats.totalAmount.multiply(ctx.exchangeRate).round5()
                depositAmountUsd = depositAmount
                depositAmountRmb = depositAmountBD.multiply(ctx.exchangeRate).round5()
            }

            // Calculate actual paid (V1: api.py:248-316)
            var actualPaid = BigDecimal.ZERO
            var actualPaidUsd = BigDecimal.ZERO
            var totalPrepayDeducted = BigDecimal.ZERO
            var totalPrepayDeductedUsd = BigDecimal.ZERO
            var totalExtraFeesUsd = BigDecimal.ZERO
            var totalExtraFeesRmb = BigDecimal.ZERO
            var hasOverride = false

            val paymentDetails = mutableListOf<DepositPaymentDetail>()

            for (pmt in pmts) {
                val pmtCur = pmt.currency
                val pmtAmount = pmt.cashAmount
                val pmtRate = pmt.exchangeRate
                val prepayAmount = pmt.prepayAmount
                val extraAmt = pmt.extraAmount
                val extraCur = pmt.extraCurrency ?: ""

                // Extra fees calculation (V1: api.py:267-279)
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

                // Override check (V1: api.py:282-283)
                if (pmt.depositOverride == true) {
                    hasOverride = true
                }

                // Cash payment conversion (V1: api.py:286-302)
                if (pmtCur == curCurrency) {
                    actualPaid = actualPaid.add(pmtAmount)
                } else {
                    if (curCurrency == "USD") {
                        actualPaid = actualPaid.add(pmtAmount.divSafe(pmtRate))
                    } else {
                        actualPaid = actualPaid.add(pmtAmount.multiply(pmtRate))
                    }
                }

                // USD amount (V1: api.py:298-302)
                if (pmtCur == "USD") {
                    actualPaidUsd = actualPaidUsd.add(pmtAmount)
                } else {
                    actualPaidUsd = actualPaidUsd.add(pmtAmount.divSafe(pmtRate))
                }

                // Prepay deduction (V1: api.py:304-316)
                actualPaid = actualPaid.add(prepayAmount)
                totalPrepayDeducted = totalPrepayDeducted.add(prepayAmount)

                if (curCurrency == "USD") {
                    actualPaidUsd = actualPaidUsd.add(prepayAmount)
                    totalPrepayDeductedUsd = totalPrepayDeductedUsd.add(prepayAmount)
                } else {
                    val prepayUsd = prepayAmount.divSafe(pmtRate)
                    actualPaidUsd = actualPaidUsd.add(prepayUsd)
                    totalPrepayDeductedUsd = totalPrepayDeductedUsd.add(prepayUsd)
                }

                // Build payment detail (V1: api.py:194-205)
                val depDateStr = pmt.paymentDate.toString()
                paymentDetails.add(DepositPaymentDetail(
                    pmtNo = pmt.paymentNo,
                    depDate = depDateStr,
                    depCur = pmtCur,
                    depPaid = pmtAmount.round5(),
                    depPaidCur = pmtRate.setScale(4, RoundingMode.HALF_UP).toDouble(),
                    depCurMode = if (pmt.rateMode == "auto") "A" else "M",
                    depPrepayAmount = prepayAmount.round5(),
                    depOverride = if (pmt.depositOverride == true) 1 else 0,
                    extraAmount = extraAmt.round5(),
                    extraCur = extraCur,
                ))
            }

            // Deposit pending (V1: api.py:318-320)
            val depositPending = depositAmountBD.subtract(actualPaid)
            val depositPendingUsd = BigDecimal.valueOf(depositAmountUsd).subtract(actualPaidUsd)

            // Balance remaining (V1: api.py:322-327)
            val balanceRemaining = stats.totalAmount.subtract(actualPaid)
            val balanceRemainingUsd = if (curCurrency == "RMB") {
                balanceRemaining.divSafe(ctx.exchangeRate)
            } else {
                balanceRemaining
            }

            // Payment status (V1: api.py:329-340)
            val isPaid: Boolean
            val paymentStatus: String
            if (depositPending.abs() < BigDecimal("0.01") || hasOverride) {
                paymentStatus = "paid"
                isPaid = true
            } else if (actualPaid.compareTo(BigDecimal.ZERO) == 0) {
                paymentStatus = "unpaid"
                isPaid = false
            } else {
                paymentStatus = "partial"
                isPaid = false
            }

            orders.add(DepositListItem(
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
                depositAmountUsd = depositAmountUsd,
                depositAmountRmb = depositAmountRmb,
                actualPaid = actualPaid.round5(),
                actualPaidUsd = actualPaidUsd.round5(),
                prepayDeducted = totalPrepayDeducted.round5(),
                prepayDeductedUsd = totalPrepayDeductedUsd.round5(),
                depositPending = depositPending.round5(),
                depositPendingUsd = depositPendingUsd.round5(),
                balanceRemaining = balanceRemaining.round5(),
                balanceRemainingUsd = balanceRemainingUsd.round5(),
                paymentStatus = paymentStatus,
                isPaid = isPaid,
                supplierCode = ctx.supplierCode,
                supplierName = supplierMap[ctx.supplierCode] ?: ctx.supplierCode,
                latestPaymentDate = latestDateMap[poNum] ?: "-",
                extraFeesUsd = totalExtraFeesUsd.round5(),
                extraFeesRmb = totalExtraFeesRmb.round5(),
                paymentDetails = paymentDetails,
            ))
        }

        // Step 6: Sort (V1: api.py:376-382)
        val sorted = when (sortBy) {
            "po_num" -> if (sortOrder == "desc") orders.sortedByDescending { it.poNum }
                        else orders.sortedBy { it.poNum }
            else -> if (sortOrder == "desc") orders.sortedByDescending { it.poDate }
                    else orders.sortedBy { it.poDate }
        }

        return DepositListResponse(data = sorted, count = sorted.size)
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    /**
     * Parse PO date from po_num format: AAYYYYMMDD-S## → YYYY-MM-DD
     */
    private fun parsePoDate(poNum: String): String {
        val match = Regex("^[A-Za-z]{2}(\\d{4})(\\d{2})(\\d{2})").find(poNum)
        return if (match != null) {
            val (year, month, day) = match.destructured
            "$year-$month-$day"
        } else ""
    }

    private data class DepositPOContext(
        val poNum: String,
        val poId: Long,
        val supplierCode: String,
        val currency: String,
        val exchangeRate: BigDecimal,
        val depositRatio: BigDecimal,
        val floatEnabled: Boolean,
        val rateMode: String,
    )

    private data class OrderStats(
        val skuCount: Int,
        val totalAmount: BigDecimal,
    )
}

// ═══════════════════════════════════════════════
// Extension functions for precision (5 decimal places)
// V1: round(..., 5) — used across all deposit calculations
// ═══════════════════════════════════════════════

internal fun BigDecimal.round5(): Double =
    this.setScale(5, RoundingMode.HALF_UP).toDouble()

internal fun BigDecimal.divSafe(divisor: BigDecimal): BigDecimal =
    if (divisor > BigDecimal.ZERO) this.divide(divisor, 10, RoundingMode.HALF_UP)
    else this
