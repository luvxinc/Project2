package com.mgmt.modules.finance.application.usecase

import com.mgmt.modules.finance.application.dto.SupplierBalanceResponse
import com.mgmt.modules.finance.domain.repository.PrepaymentRepository
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import com.mgmt.modules.purchase.domain.repository.SupplierStrategyRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * PrepaymentBalanceService — calculates supplier prepayment balance.
 *
 * V1 parity: supplier_balance_api (api.py L21-116)
 *
 * Balance calculation rules (from V1 source code):
 *   1. Read all suppliers from in_supplier
 *   2. Read latest strategy per supplier for settlement currency
 *   3. For each supplier's prepay records from in_pmt_prepay_final:
 *      - tran_type='in' (V3: deposit/refund) → ADD amount
 *      - tran_type='out' (V3: usage/withdraw) → SUBTRACT amount
 *      - If tran_curr_use ≠ supplier_currency, convert via usd_rmb rate
 *
 * This service is designed to be reusable by:
 *   - PrepaymentUseCase (prepayment page balance list)
 *   - Future: PO payment wizard (vendor_balance API)
 *   - Future: Deposit payment wizard (vendor_balance API)
 */
@Service
class PrepaymentBalanceService(
    private val prepaymentRepo: PrepaymentRepository,
    private val supplierRepo: SupplierRepository,
    private val strategyRepo: SupplierStrategyRepository,
) {

    /**
     * Get all supplier balances.
     * V1 parity: supplier_balance_api → returns list of {supplier_code, supplier_name, currency, balance}
     */
    @Transactional(readOnly = true)
    fun getAllBalances(): List<SupplierBalanceResponse> {
        // Step 1: Get all suppliers (V1: SELECT supplier_code, supplier_name FROM in_supplier ORDER BY supplier_code)
        val suppliers = supplierRepo.findAllByDeletedAtIsNullOrderBySupplierCodeAsc()

        if (suppliers.isEmpty()) return emptyList()

        // Step 2: Get latest strategy per supplier for settlement currency
        // V1: SELECT s.supplier_code, s.currency FROM in_supplier_strategy s INNER JOIN (MAX effective_date)
        val currencyMap = mutableMapOf<String, String>()
        for (supplier in suppliers) {
            val latestStrategy = strategyRepo
                .findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplier.supplierCode)
                .firstOrNull()
            currencyMap[supplier.supplierCode] = latestStrategy?.currency ?: "RMB"
        }

        // Step 3: Get all active prepayment transactions
        // V1: SELECT supplier_code, tran_curr_use, tran_amount, tran_type, usd_rmb FROM in_pmt_prepay_final
        val allPrepayments = prepaymentRepo.findAllActivePrepayments()

        // Step 4: Calculate balance per supplier
        // V1 logic: api.py L71-111
        return suppliers.map { supplier ->
            val code = supplier.supplierCode
            val name = supplier.supplierName
            val supplierCurrency = currencyMap[code] ?: "RMB"

            val supplierTxns = allPrepayments.filter { it.supplierCode == code }
            val balance = calculateBalance(supplierTxns, supplierCurrency)

            SupplierBalanceResponse(
                supplierCode = code,
                supplierName = name,
                currency = supplierCurrency,
                balance = balance.setScale(5, RoundingMode.HALF_UP).toDouble(),
            )
        }
    }

    /**
     * Get balance for a single supplier.
     * V1 parity: deposit/vendor_balance_api and po/vendor_balance_api
     */
    @Transactional(readOnly = true)
    fun getBalanceForSupplier(supplierCode: String): SupplierBalanceResponse {
        val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(supplierCode.uppercase())
            ?: throw com.mgmt.common.exception.NotFoundException("purchase.errors.supplierNotFound")

        val latestStrategy = strategyRepo
            .findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplier.supplierCode)
            .firstOrNull()
        val supplierCurrency = latestStrategy?.currency ?: "RMB"

        val txns = prepaymentRepo.findAllBySupplierCode(supplier.supplierCode)
        val balance = calculateBalance(txns, supplierCurrency)

        return SupplierBalanceResponse(
            supplierCode = supplier.supplierCode,
            supplierName = supplier.supplierName,
            currency = supplierCurrency,
            balance = balance.setScale(5, RoundingMode.HALF_UP).toDouble(),
        )
    }

    /**
     * Calculate balance from a list of prepayment records.
     *
     * V1 parity: api.py L82-104
     * Rules:
     *   - deposit/refund → ADD (V1: tran_type='in')
     *   - usage/withdraw → SUBTRACT (V1: tran_type='out')
     *   - If currency mismatch: convert via exchange_rate (usd_rmb)
     */
    internal fun calculateBalance(transactions: List<Payment>, supplierCurrency: String): BigDecimal {
        var balance = BigDecimal.ZERO

        for (txn in transactions) {
            val amount = txn.cashAmount
            val currUse = txn.currency  // V1: tran_curr_use
            val tranType = txn.prepayTranType ?: continue
            val exchangeRate = txn.exchangeRate

            // Currency conversion (V1: api.py L89-98)
            val converted = if (currUse != supplierCurrency) {
                if (supplierCurrency == "RMB") {
                    // currUse is USD, convert to RMB: amount × rate
                    amount.multiply(exchangeRate)
                } else {
                    // currUse is RMB, convert to USD: amount / rate
                    if (exchangeRate > BigDecimal.ZERO) {
                        amount.divide(exchangeRate, 10, RoundingMode.HALF_UP)
                    } else {
                        amount
                    }
                }
            } else {
                amount
            }

            // Add or subtract based on transaction type (V1: api.py L100-104)
            when (tranType) {
                "deposit", "refund" -> balance = balance.add(converted)    // V1: tran_type='in'
                "usage", "withdraw" -> balance = balance.subtract(converted) // V1: tran_type='out'
                "rate" -> { /* rate adjustments — future extension */ }
            }
        }

        return balance
    }
}
