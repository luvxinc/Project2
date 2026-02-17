package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.BadRequestException
import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Supplier
import com.mgmt.modules.purchase.domain.model.SupplierStrategy
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import com.mgmt.modules.purchase.domain.repository.SupplierStrategyRepository
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

        val supplier = Supplier(
            supplierCode = code,
            supplierName = dto.supplierName.trim(),
            createdBy = username,
            updatedBy = username,
        )
        return supplierRepo.save(supplier)
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdateSupplierRequest, username: String): Supplier {
        val supplier = findOne(id)
        dto.supplierName?.let { supplier.supplierName = it.trim() }
        dto.status?.let { supplier.status = it }
        supplier.updatedAt = Instant.now()
        supplier.updatedBy = username
        return supplierRepo.save(supplier)
    }

    // ═══════════ Soft Delete ═══════════

    @Transactional
    fun delete(id: Long, username: String): Boolean {
        val supplier = findOne(id)
        supplier.deletedAt = Instant.now()
        supplier.updatedBy = username
        supplierRepo.save(supplier)
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

        val strategy = SupplierStrategy(
            supplierId = supplier.id,
            supplierCode = supplier.supplierCode,
            category = dto.category ?: "E",
            currency = dto.currency ?: "USD",
            floatCurrency = dto.floatCurrency ?: false,
            floatThreshold = dto.floatThreshold ?: java.math.BigDecimal.ZERO,
            requireDeposit = dto.requireDeposit ?: false,
            depositRatio = dto.depositRatio ?: java.math.BigDecimal.ZERO,
            effectiveDate = dto.effectiveDate,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        return strategyRepo.save(strategy)
    }
}
