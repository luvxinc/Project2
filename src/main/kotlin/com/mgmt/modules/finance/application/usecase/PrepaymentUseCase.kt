package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.finance.application.dto.*
import com.mgmt.modules.finance.domain.model.PaymentEvent
import com.mgmt.modules.finance.domain.repository.PaymentEventRepository
import com.mgmt.modules.finance.domain.repository.PrepaymentRepository
import com.mgmt.modules.finance.domain.repository.findLatestAutoRate
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import com.mgmt.modules.purchase.domain.repository.SupplierStrategyRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * PrepaymentUseCase — core business logic for prepayment management.
 *
 */
@Service
class PrepaymentUseCase(
    private val prepaymentRepo: PrepaymentRepository,
    private val eventRepo: PaymentEventRepository,
    private val supplierRepo: SupplierRepository,
    private val strategyRepo: SupplierStrategyRepository,
    private val balanceService: PrepaymentBalanceService,
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════════════════════════════════════════
    // TRANSACTION LIST
    // ═══════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getTransactionList(params: TransactionQueryParams): TransactionListResponse {
        val supplierCode = params.supplierCode.uppercase().trim()

        // Step 1: Get supplier info (V1: api.py L153-161)
        val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(supplierCode)
            ?: throw NotFoundException("finance.errors.supplierNotFound")

        // Step 2: Get supplier settlement currency (V1: api.py L166-174)
        val latestStrategy = strategyRepo
            .findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierCode)
            .firstOrNull()
        val supplierCurrency = latestStrategy?.currency ?: "RMB"

        // Step 3: Resolve date range (V1: api.py L143-151)
        val today = LocalDate.now()
        var dateFrom = params.dateFrom
        var dateTo = params.dateTo

        when (params.preset) {
            "6m" -> { dateFrom = today.minusDays(180).toString(); dateTo = today.toString() }
            "1y" -> { dateFrom = today.minusDays(365).toString(); dateTo = today.toString() }
            "2y" -> { dateFrom = today.minusDays(730).toString(); dateTo = today.toString() }
        }

        // Step 4: Get ALL transactions including deleted for this supplier (V1: api.py L178-186)
        val allTxns = prepaymentRepo.findAllBySupplierCodeIncludeDeleted(supplierCode)

        // Step 5: Get latest event seq for each transaction (for displaying version like T01)
        val eventSeqMap = mutableMapOf<Long, String>()
        for (txn in allTxns) {
            val maxSeq = eventRepo.findMaxEventSeq(txn.id)
            eventSeqMap[txn.id] = "T${String.format("%02d", maxSeq)}"
        }

        // Step 6: Calculate beginning_balance and build filtered list (V1: api.py L189-258)
        var beginningBalance = BigDecimal.ZERO
        val filteredTxns = mutableListOf<TransactionItem>()

        for (txn in allTxns) {
            val txnDateStr = txn.paymentDate.toString()
            val isDeleted = txn.deletedAt != null
            val amount = txn.cashAmount
            val currUse = txn.currency
            val tranType = txn.prepayTranType ?: continue

            // Convert to supplier currency (V1: api.py L212-218)
            val converted = convertToSupplierCurrency(amount, currUse, supplierCurrency, txn.exchangeRate)

            // Check if in filter range
            val beforeRange = dateFrom != null && txnDateStr < dateFrom
            val afterRange = dateTo != null && txnDateStr > dateTo
            val inFilterRange = !beforeRange && !afterRange

            if (beforeRange && !isDeleted) {
                // Before filter range: accumulate to beginning balance (V1: api.py L221-226)
                when (tranType) {
                    "deposit", "refund" -> beginningBalance = beginningBalance.add(converted)
                    "usage", "withdraw" -> beginningBalance = beginningBalance.subtract(converted)
                }
            } else if (inFilterRange) {
                // In filter range: add to result list
                // V1: check file existence (api.py L228-237)
                val hasFile = if (tranType == "deposit" && !isDeleted) {
                    checkFileExists(txn.paymentNo, txnDateStr)
                } else false

                filteredTxns.add(TransactionItem(
                    id = txn.id,
                    tranNum = txn.paymentNo,
                    tranDate = txnDateStr,
                    tranCurrReq = txn.tranCurrReq ?: supplierCurrency,
                    tranCurrUse = currUse,
                    tranAmount = amount.toDouble(),
                    tranType = tranType,
                    exchangeRate = txn.exchangeRate.toDouble(),
                    rateMode = txn.rateMode,
                    tranSeq = eventSeqMap[txn.id] ?: "T01",
                    tranBy = txn.createdBy ?: "-",
                    tranNote = txn.note ?: "",
                    convertedAmount = converted.setScale(5, RoundingMode.HALF_UP).toDouble(),
                    runningBalance = 0.0, // calculated below
                    hasFile = hasFile,
                    isDeleted = isDeleted,
                ))
            }
        }

        // Step 7: Calculate running balance (V1: api.py L260-271)
        var runningBalance = beginningBalance
        for (txn in filteredTxns) {
            if (txn.isDeleted) {
                // Deleted records don't affect balance (V1: api.py L264-265)
                filteredTxns[filteredTxns.indexOf(txn)] = txn.copy(
                    runningBalance = runningBalance.setScale(5, RoundingMode.HALF_UP).toDouble()
                )
            } else {
                when (txn.tranType) {
                    "deposit", "refund" -> runningBalance = runningBalance.add(BigDecimal(txn.convertedAmount.toString()))
                    "usage", "withdraw" -> runningBalance = runningBalance.subtract(BigDecimal(txn.convertedAmount.toString()))
                }
                filteredTxns[filteredTxns.indexOf(txn)] = txn.copy(
                    runningBalance = runningBalance.setScale(5, RoundingMode.HALF_UP).toDouble()
                )
            }
        }

        return TransactionListResponse(
            supplierCode = supplierCode,
            supplierName = supplier.supplierName,
            supplierCurrency = supplierCurrency,
            beginningBalance = beginningBalance.setScale(5, RoundingMode.HALF_UP).toDouble(),
            transactions = filteredTxns,
            filter = TransactionFilter(dateFrom = dateFrom, dateTo = dateTo),
        )
    }

    // ═══════════════════════════════════════════════
    // CREATE PREPAYMENT
    // ═══════════════════════════════════════════════

    @Transactional
    fun createPrepayment(dto: CreatePrepaymentRequest, username: String): CreatePrepaymentResponse {
        val code = dto.supplierCode.uppercase().trim()

        // Validate supplier exists
        val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(code)
            ?: throw NotFoundException("finance.errors.supplierNotFound")

        // Validate amount > 0 (V1: api.py L348-349)
        require(dto.amount > BigDecimal.ZERO) { "finance.errors.amountMustBePositive" }

        // Validate exchange rate > 0 (V1: api.py L345-346)
        require(dto.exchangeRate > BigDecimal.ZERO) { "finance.errors.rateMustBePositive" }

        // Generate payment_no (V1: api.py L351-372)
        // Format: {supplier_code}_{YYYYMMDD}_in_{##}
        val dateStr = dto.tranDate.format(DateTimeFormatter.BASIC_ISO_DATE) // YYYYMMDD
        val existingNos = prepaymentRepo.findLatestPaymentNoForDate(code, dto.tranDate)
        val seqNum = if (existingNos.isEmpty()) 1 else {
            val lastNo = existingNos.first()
            try {
                lastNo.split("_").last().toInt() + 1
            } catch (_: Exception) { 1 }
        }
        val paymentNo = "${code}_${dateStr}_in_${String.format("%02d", seqNum)}"

        // Create payment record (V1: api.py L378-399)
        val payment = Payment(
            paymentType = "prepay",
            paymentNo = paymentNo,
            supplierId = supplier.id,
            supplierCode = code,
            paymentDate = dto.tranDate,
            currency = dto.tranCurrUse,
            cashAmount = dto.amount,
            exchangeRate = dto.exchangeRate,
            rateMode = dto.rateMode,
            prepayTranType = "deposit",    // V1: tran_type='in'
            tranCurrReq = dto.tranCurrReq,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        val saved = prepaymentRepo.save(payment)

        // Create event (V1: each INSERT into in_pmt_prepay = one event)
        val initialSnapshot = mapOf(
            "payment_no" to paymentNo,
            "supplier_code" to code,
            "payment_date" to dto.tranDate.toString(),
            "tran_curr_req" to dto.tranCurrReq,
            "currency" to dto.tranCurrUse,
            "exchange_rate" to dto.exchangeRate.toDouble(),
            "rate_mode" to dto.rateMode,
            "cash_amount" to dto.amount.toDouble(),
            "prepay_tran_type" to "deposit",
            "note" to dto.note,
        )
        val event = PaymentEvent(
            paymentId = saved.id,
            paymentNo = paymentNo,
            eventType = "CREATE",
            eventSeq = 1,
            changes = objectMapper.writeValueAsString(initialSnapshot),
            note = dto.note,
            operator = username,
        )
        eventRepo.save(event)

        return CreatePrepaymentResponse(
            id = saved.id,
            tranNum = paymentNo,
            fileSaved = false, // file handling done in controller
            message = "finance.messages.prepaymentCreated",
        )
    }

    // ═══════════════════════════════════════════════
    // SOFT DELETE
    // ═══════════════════════════════════════════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val payment = prepaymentRepo.findByIdAndPaymentType(id, "prepay")
            ?: throw NotFoundException("finance.errors.prepaymentNotFound")

        // Check not already deleted (V1: api.py L691-692)
        if (payment.deletedAt != null) {
            throw IllegalStateException("finance.errors.alreadyDeleted")
        }

        // Soft delete: set deleted_at (V1: insert row with amount=0)
        payment.deletedAt = Instant.now()
        payment.updatedBy = username
        prepaymentRepo.save(payment)

        // Record event
        val nextSeq = eventRepo.findMaxEventSeq(id) + 1
        val event = PaymentEvent(
            paymentId = id,
            paymentNo = payment.paymentNo,
            eventType = "DELETE",
            eventSeq = nextSeq,
            changes = objectMapper.writeValueAsString(mapOf(
                "before" to mapOf("deleted_at" to null, "cash_amount" to payment.cashAmount.toDouble()),
                "after" to mapOf("deleted_at" to payment.deletedAt.toString(), "cash_amount" to 0),
            )),
            note = "删除付款",
            operator = username,
        )
        eventRepo.save(event)

        return true
    }

    // ═══════════════════════════════════════════════
    // RESTORE
    // ═══════════════════════════════════════════════

    @Transactional
    fun restore(id: Long, username: String): Boolean {
        val payment = prepaymentRepo.findByIdAndPaymentType(id, "prepay")
            ?: throw NotFoundException("finance.errors.prepaymentNotFound")

        // Check is deleted (V1: api.py L767-768)
        if (payment.deletedAt == null) {
            throw IllegalStateException("finance.errors.notDeleted")
        }

        // Restore: clear deleted_at (V1: restore amount from prev version)
        payment.deletedAt = null
        payment.updatedBy = username
        prepaymentRepo.save(payment)

        // Record event
        val nextSeq = eventRepo.findMaxEventSeq(id) + 1
        val event = PaymentEvent(
            paymentId = id,
            paymentNo = payment.paymentNo,
            eventType = "RESTORE",
            eventSeq = nextSeq,
            changes = objectMapper.writeValueAsString(mapOf(
                "before" to mapOf("deleted_at" to "was_deleted"),
                "after" to mapOf("deleted_at" to null, "cash_amount" to payment.cashAmount.toDouble()),
            )),
            note = "恢复删除",
            operator = username,
        )
        eventRepo.save(event)

        return true
    }

    // ═══════════════════════════════════════════════
    // HISTORY (3-column layout)
    // ═══════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getHistory(paymentNo: String): PrepaymentHistoryResponse {
        val trimmed = paymentNo.trim()

        // Parse supplier_code from tran_num (V1: api.py L467)
        val supplierCode = if ("_" in trimmed) trimmed.split("_")[0] else ""

        // Find the payment
        val payment = prepaymentRepo.findByPaymentTypeAndPaymentNo("prepay", trimmed)

        // ========== LEFT COLUMN: Supplier strategy versions (V1: api.py L489-523) ==========
        val strategies = strategyRepo
            .findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierCode)
            .reversed() // oldest first, V1: ORDER BY effective_date ASC

        val strategyVersions = mutableListOf<StrategyVersionItem>()
        var prevCurrency: String? = null
        for ((i, strat) in strategies.withIndex()) {
            val isFirst = (i == 0)
            val changes = mutableListOf<FieldChange>()

            if (!isFirst && prevCurrency != null && strat.currency != prevCurrency) {
                changes.add(FieldChange(
                    field = "厂商要求货币",
                    old = prevCurrency,
                    new = strat.currency
                ))
            }

            // Only add if initial or has changes (V1: api.py L522-523)
            if (isFirst || changes.isNotEmpty()) {
                strategyVersions.add(StrategyVersionItem(
                    seq = "S${i + 1}",
                    date = strat.createdAt.toString(),
                    by = strat.createdBy ?: "-",
                    note = strat.note ?: "",
                    isInitial = isFirst,
                    effectiveDate = strat.effectiveDate.toString(),
                    currency = if (isFirst) strat.currency else null,
                    changes = changes,
                ))
            }
            prevCurrency = strat.currency
        }

        // ========== MIDDLE + RIGHT COLUMNS: from payment_events (V1: api.py L525-643) ==========
        val events = if (payment != null) {
            eventRepo.findAllByPaymentIdOrderByEventSeqAsc(payment.id)
        } else {
            eventRepo.findAllByPaymentNoOrderByEventSeqAsc(trimmed)
        }

        val rateVersions = mutableListOf<RateVersionItem>()
        val amountVersions = mutableListOf<AmountVersionItem>()

        var prevRate: Double? = null
        var prevCurrUse: String? = null
        var prevAmount: Double? = null
        var prevAmountCurrency: String? = null

        for ((i, evt) in events.withIndex()) {
            val isFirst = (i == 0)
            @Suppress("UNCHECKED_CAST")
            val changesMap = try {
                objectMapper.readValue(evt.changes, Map::class.java) as Map<String, Any?>
            } catch (_: Exception) { emptyMap() }

            // Parse rate and currency from event changes
            val currentRate = (changesMap["exchange_rate"] as? Number)?.toDouble()
                ?: (changesMap["after"] as? Map<*, *>)?.get("exchange_rate")?.let { (it as? Number)?.toDouble() }
                ?: prevRate ?: 0.0
            val currentCurrUse = (changesMap["currency"] as? String)
                ?: (changesMap["after"] as? Map<*, *>)?.get("currency") as? String
                ?: prevCurrUse ?: ""
            val currentAmount = (changesMap["cash_amount"] as? Number)?.toDouble()
                ?: (changesMap["after"] as? Map<*, *>)?.get("cash_amount")?.let { (it as? Number)?.toDouble() }
                ?: prevAmount ?: 0.0

            // MIDDLE COLUMN: rate/currency changes
            val rateChanges = mutableListOf<FieldChange>()
            if (!isFirst) {
                if (prevRate != null && kotlin.math.abs(currentRate - prevRate) > 0.000001) {
                    rateChanges.add(FieldChange("汇率", "%.4f".format(prevRate), "%.4f".format(currentRate)))
                }
                if (prevCurrUse != null && currentCurrUse != prevCurrUse) {
                    rateChanges.add(FieldChange("操作货币", prevCurrUse, currentCurrUse))
                }
            }

            rateVersions.add(RateVersionItem(
                seq = "T${String.format("%02d", evt.eventSeq)}",
                date = evt.createdAt.toString(),
                by = evt.operator,
                note = evt.note ?: "",
                isInitial = isFirst,
                exchangeRate = currentRate,
                tranCurrUse = currentCurrUse,
                changes = rateChanges,
            ))

            // RIGHT COLUMN: amount changes
            val amountChanges = mutableListOf<FieldChange>()
            if (!isFirst && prevAmount != null && currentAmount != prevAmount) {
                val oldCurr = prevAmountCurrency ?: ""
                val newCurr = currentCurrUse
                amountChanges.add(FieldChange(
                    field = "付款金额",
                    old = "$oldCurr ${"%,.2f".format(prevAmount)}",
                    new = "$newCurr ${"%,.2f".format(currentAmount)}",
                ))
            }

            // Calculate USD amount
            val usdAmount = if (currentCurrUse == "RMB" && currentRate > 0) {
                currentAmount / currentRate
            } else currentAmount

            amountVersions.add(AmountVersionItem(
                seq = "T${String.format("%02d", evt.eventSeq)}",
                date = evt.createdAt.toString(),
                by = evt.operator,
                note = evt.note ?: "",
                isInitial = isFirst,
                eventType = evt.eventType,
                currency = currentCurrUse,
                exchangeRate = currentRate,
                amount = if (isFirst) currentAmount else null,
                usdAmount = if (isFirst) usdAmount else null,
                changes = amountChanges,
            ))

            prevRate = currentRate
            prevCurrUse = currentCurrUse
            prevAmount = currentAmount
            prevAmountCurrency = currentCurrUse
        }

        return PrepaymentHistoryResponse(
            tranNum = trimmed,
            supplierCode = supplierCode,
            supplierStrategyVersions = strategyVersions,
            rateVersions = rateVersions,
            amountVersions = amountVersions,
        )
    }

    // ═══════════════════════════════════════════════
    // EXCHANGE RATE
    // ═══════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getExchangeRate(): ExchangeRateResponse {
        // V1: Look for most recent auto-rate transaction
        // BUG-4 fix: push filter to SQL instead of loading all records
        val latestAutoRate = prepaymentRepo.findLatestAutoRate()

        return if (latestAutoRate != null) {
            ExchangeRateResponse(
                rate = latestAutoRate.exchangeRate.toDouble(),
                source = "recent_transaction",
            )
        } else {
            ExchangeRateResponse(
                rate = 7.2500,
                source = "default",
            )
        }
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════

    /**
     * Convert amount to supplier's settlement currency.
     */
    private fun convertToSupplierCurrency(
        amount: BigDecimal,
        currUse: String,
        supplierCurrency: String,
        exchangeRate: BigDecimal,
    ): BigDecimal {
        return if (currUse != supplierCurrency) {
            if (supplierCurrency == "RMB") {
                amount.multiply(exchangeRate)
            } else {
                if (exchangeRate > BigDecimal.ZERO) {
                    amount.divide(exchangeRate, 10, RoundingMode.HALF_UP)
                } else amount
            }
        } else amount
    }

    /**
     * Check if files exist for a prepayment record.
     */
    private fun checkFileExists(paymentNo: String, dateStr: String): Boolean {
        return try {
            val year = dateStr.substring(0, 4)
            val dir = java.nio.file.Paths.get("data", "records", "finance", "prepay", year, paymentNo)
            java.nio.file.Files.exists(dir) && java.nio.file.Files.list(dir).findFirst().isPresent
        } catch (_: Exception) { false }
    }
}
