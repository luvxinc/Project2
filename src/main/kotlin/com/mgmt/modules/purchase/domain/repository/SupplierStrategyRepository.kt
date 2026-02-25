package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.SupplierStrategy
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.time.LocalDate

@Repository
interface SupplierStrategyRepository : JpaRepository<SupplierStrategy, Long> {

    fun findAllBySupplierIdAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierId: Long): List<SupplierStrategy>

    fun findAllBySupplierCodeAndDeletedAtIsNullOrderByEffectiveDateDesc(supplierCode: String): List<SupplierStrategy>

    /** Find the strategy effective on a given date (latest effective_date <= target) */
    fun findFirstBySupplierCodeAndEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(
        supplierCode: String, targetDate: LocalDate
    ): SupplierStrategy?

    fun existsBySupplierCodeAndEffectiveDateAndDeletedAtIsNull(supplierCode: String, effectiveDate: LocalDate): Boolean

    fun findBySupplierCodeAndEffectiveDateAndDeletedAtIsNull(
        supplierCode: String, effectiveDate: LocalDate
    ): SupplierStrategy?

    /** Batch-load all active strategies with effectiveDate <= target (N+1 fix for findAllWithStrategy). */
    fun findAllByEffectiveDateLessThanEqualAndDeletedAtIsNullOrderByEffectiveDateDesc(
        targetDate: LocalDate
    ): List<SupplierStrategy>
}
