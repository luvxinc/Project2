package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.BadRequestException
import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Supplier
import com.mgmt.modules.purchase.domain.model.SupplierStrategy
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import com.mgmt.modules.purchase.domain.repository.SupplierStrategyRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate

/**
 * SupplierUseCase — CRUD for suppliers + strategy management.
 *
 * V1 parity: supplier_add, supplier_list, modify_supplier_strategy,
 *            check_supplier_code_exists, check_strategy_date_conflict.
 */
@Service
class SupplierUseCase(
    private val supplierRepo: SupplierRepository,
    private val strategyRepo: SupplierStrategyRepository,
) {
    private val log = LoggerFactory.getLogger(SupplierUseCase::class.java)

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(): List<Supplier> =
        supplierRepo.findAllByDeletedAtIsNullOrderBySupplierCodeAsc()

    @Transactional(readOnly = true)
    fun findActive(): List<Supplier> =
        supplierRepo.findAllByStatusAndDeletedAtIsNull(true)

    @Transactional(readOnly = true)
    fun findOne(id: Long): Supplier =
        supplierRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.supplierNotFound")

    @Transactional(readOnly = true)
    fun findByCode(code: String): Supplier =
        supplierRepo.findBySupplierCodeAndDeletedAtIsNull(code.uppercase())
            ?: throw NotFoundException("purchase.errors.supplierNotFound")

    @Transactional(readOnly = true)
    fun codeExists(code: String): Boolean =
        supplierRepo.existsBySupplierCodeAndDeletedAtIsNull(code.uppercase())

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreateSupplierRequest, username: String): Supplier {
        val code = dto.supplierCode.uppercase().trim()
        if (code.length != 2) throw BadRequestException("Supplier code must be exactly 2 characters")
        if (codeExists(code)) throw ConflictException("Supplier code '$code' already exists")

        // Validate float/deposit business rules
        validateStrategyRules(dto.floatCurrency, dto.floatThreshold, dto.requireDeposit, dto.depositRatio)

        val supplier = Supplier(
            supplierCode = code,
            supplierName = dto.supplierName.trim(),
            createdBy = username,
            updatedBy = username,
        )
        val saved = supplierRepo.save(supplier)

        // Create initial default strategy (V1 parity)
        val strategy = SupplierStrategy(
            supplierId = saved.id,
            supplierCode = saved.supplierCode,
            category = dto.category,
            currency = dto.currency,
            floatCurrency = dto.floatCurrency,
            floatThreshold = dto.floatThreshold,
            requireDeposit = dto.requireDeposit,
            depositRatio = dto.depositRatio,
            effectiveDate = LocalDate.now(),
            createdBy = username,
            updatedBy = username,
        )
        strategyRepo.save(strategy)

        log.info("[Supplier:CREATE] code={} name={} by={}", saved.supplierCode, saved.supplierName, username)
        return saved
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdateSupplierRequest, username: String): Supplier {
        val supplier = findOne(id)
        dto.supplierName?.let { supplier.supplierName = it.trim() }
        dto.status?.let { supplier.status = it }
        supplier.updatedAt = Instant.now()
        supplier.updatedBy = username
        return supplierRepo.save(supplier).also {
            log.info("[Supplier:UPDATE] code={} by={}", it.supplierCode, username)
        }
    }

    // ═══════════ Soft Delete ═══════════

    @Transactional
    fun delete(id: Long, username: String): Boolean {
        val supplier = findOne(id)
        supplier.deletedAt = Instant.now()
        supplier.updatedBy = username
        supplierRepo.save(supplier)
        log.info("[Supplier:DELETE] code={} by={}", supplier.supplierCode, username)
        return true
    }

    // ═══════════ Strategy ═══════════

    @Transactional(readOnly = true)
    fun getStrategies(supplierId: Long): List<SupplierStrategy> =
        strategyRepo.findAllBySupplierIdAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierId)

    @Transactional(readOnly = true)
    fun getStrategiesByCode(supplierCode: String): List<SupplierStrategy> =
        strategyRepo.findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierCode.uppercase())

    /** V1 parity: find strategy effective on a given date */
    @Transactional(readOnly = true)
    fun getEffectiveStrategy(supplierCode: String, date: LocalDate): SupplierStrategy? =
        strategyRepo.findFirstBySupplierCodeAndEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(
            supplierCode.uppercase(), date
        )

    /** V1 parity: check date conflict before modifying strategy */
    @Transactional(readOnly = true)
    fun strategyDateConflict(supplierCode: String, effectiveDate: LocalDate): Boolean =
        strategyRepo.existsBySupplierCodeAndEffectiveDateAndDeletedAtIsNull(supplierCode.uppercase(), effectiveDate)

    /** V1 parity: modify (create/update) strategy for a supplier */
    @Transactional
    fun modifyStrategy(dto: ModifyStrategyRequest, username: String): SupplierStrategy {
        val supplier = findByCode(dto.supplierCode)

        val floatCurrency = dto.floatCurrency ?: false
        val floatThreshold = dto.floatThreshold ?: java.math.BigDecimal.ZERO
        val requireDeposit = dto.requireDeposit ?: false
        val depositRatio = dto.depositRatio ?: java.math.BigDecimal.ZERO

        // Validate float/deposit business rules
        validateStrategyRules(floatCurrency, floatThreshold, requireDeposit, depositRatio)

        // Update supplier name/status if provided
        dto.supplierName?.let {
            supplier.supplierName = it.trim()
            supplier.updatedAt = Instant.now()
            supplier.updatedBy = username
        }
        dto.status?.let {
            supplier.status = it
            supplier.updatedAt = Instant.now()
            supplier.updatedBy = username
        }
        if (dto.supplierName != null || dto.status != null) {
            supplierRepo.save(supplier)
        }

        // Check date conflict
        val existing = strategyRepo.findBySupplierCodeAndEffectiveDateAndDeletedAtIsNull(
            supplier.supplierCode, dto.effectiveDate
        )
        if (existing != null && !dto.override) {
            throw ConflictException("Strategy already exists for date ${dto.effectiveDate}. Set override=true to replace.")
        }

        if (existing != null && dto.override) {
            // Update in-place
            existing.category = dto.category ?: existing.category
            existing.currency = dto.currency ?: existing.currency
            existing.floatCurrency = floatCurrency
            existing.floatThreshold = floatThreshold
            existing.requireDeposit = requireDeposit
            existing.depositRatio = depositRatio
            existing.note = dto.note
            existing.updatedAt = Instant.now()
            existing.updatedBy = username
            return strategyRepo.save(existing)
        }

        // Create new strategy
        val strategy = SupplierStrategy(
            supplierId = supplier.id,
            supplierCode = supplier.supplierCode,
            category = dto.category ?: "E",
            currency = dto.currency ?: "USD",
            floatCurrency = floatCurrency,
            floatThreshold = floatThreshold,
            requireDeposit = requireDeposit,
            depositRatio = depositRatio,
            effectiveDate = dto.effectiveDate,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        return strategyRepo.save(strategy).also {
            log.info("[Supplier:STRATEGY] code={} date={} by={}", supplier.supplierCode, dto.effectiveDate, username)
        }
    }

    // ═══════════ Aggregated Query ═══════════

    @Transactional(readOnly = true)
    fun findAllWithStrategy(): List<Pair<Supplier, SupplierStrategy?>> {
        val suppliers = supplierRepo.findAllByDeletedAtIsNullOrderBySupplierCodeAsc()
        // Batch-load ALL applicable strategies in ONE query (N+1 fix)
        val today = LocalDate.now()
        val allStrategies = strategyRepo
            .findAllByEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(today)
        // Group by supplierCode, take first (= latest effectiveDate due to ORDER BY DESC)
        val latestByCode = allStrategies.groupBy { it.supplierCode }
            .mapValues { (_, list) -> list.first() }

        return suppliers.map { supplier ->
            supplier to latestByCode[supplier.supplierCode]
        }
    }

    // ═══════════ Validation ═══════════

    private fun validateStrategyRules(
        floatCurrency: Boolean,
        floatThreshold: java.math.BigDecimal,
        requireDeposit: Boolean,
        depositRatio: java.math.BigDecimal,
    ) {
        if (floatCurrency && (floatThreshold <= java.math.BigDecimal.ZERO || floatThreshold > java.math.BigDecimal.TEN)) {
            throw BadRequestException("Float threshold must be >0 and <=10 when float currency is enabled")
        }
        if (requireDeposit && depositRatio <= java.math.BigDecimal.ZERO) {
            throw BadRequestException("Deposit ratio must be >0 when deposit is required")
        }
    }
}
