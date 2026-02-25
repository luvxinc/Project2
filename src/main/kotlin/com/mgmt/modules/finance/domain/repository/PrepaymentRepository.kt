package com.mgmt.modules.finance.domain.repository

import com.mgmt.modules.purchase.domain.model.Payment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

/**
 * PrepaymentRepository — queries scoped to payment_type='prepay'.
 *
 * Reuses the Payment entity from purchase module.
 * All queries filter by paymentType='prepay' to avoid cross-contamination.
 */
@Repository
interface PrepaymentRepository : JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {

    /**
     * Find all active prepayment records for a supplier.
     */
    @Query("""
        SELECT p FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.supplierCode = :supplierCode 
          AND p.deletedAt IS NULL 
        ORDER BY p.paymentDate ASC, p.paymentNo ASC
    """)
    fun findAllBySupplierCode(@Param("supplierCode") supplierCode: String): List<Payment>

    /**
     * Find ALL prepayment records for a supplier (including deleted, for history/balance).
     */
    @Query("""
        SELECT p FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.supplierCode = :supplierCode 
        ORDER BY p.paymentDate ASC, p.paymentNo ASC
    """)
    fun findAllBySupplierCodeIncludeDeleted(@Param("supplierCode") supplierCode: String): List<Payment>

    /**
     * Find a prepayment by its payment number (tran_num in V1).
     */
    fun findByPaymentTypeAndPaymentNoAndDeletedAtIsNull(paymentType: String, paymentNo: String): Payment?

    /**
     * Find a prepayment by payment_no including deleted records (for restore).
     */
    fun findByPaymentTypeAndPaymentNo(paymentType: String, paymentNo: String): Payment?

    /**
     * Find a prepayment by ID.
     */
    fun findByIdAndPaymentTypeAndDeletedAtIsNull(id: Long, paymentType: String): Payment?

    /**
     * Find by ID including deleted (for restore operation).
     */
    fun findByIdAndPaymentType(id: Long, paymentType: String): Payment?

    /**
     * Get all unique supplier codes that have prepayment records.
     */
    @Query("""
        SELECT DISTINCT p.supplierCode FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.supplierCode IS NOT NULL
    """)
    fun findDistinctSupplierCodes(): List<String>

    /**
     * Find all active prepayments for balance calculation.
     */
    @Query("""
        SELECT p FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.deletedAt IS NULL
    """)
    fun findAllActivePrepayments(): List<Payment>

    /**
     * Count existing payment_no for sequence generation.
     * V1: SELECT tran_num FROM in_pmt_prepay WHERE supplier_code=:code AND tran_date=:date AND tran_type='in'
     */
    @Query("""
        SELECT p.paymentNo FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.supplierCode = :supplierCode 
          AND p.paymentDate = :paymentDate 
          AND p.prepayTranType = 'deposit'
        ORDER BY p.paymentNo DESC
    """)
    fun findLatestPaymentNoForDate(
        @Param("supplierCode") supplierCode: String,
        @Param("paymentDate") paymentDate: java.time.LocalDate
    ): List<String>

    /**
     * Find the most recent auto-rate prepayment for exchange rate lookup.
     *   WHERE tran_curr_type='A' AND usd_rmb>0 ORDER BY tran_date DESC LIMIT 1
     * BUG-4 fix: push filter to SQL instead of loading all records.
     */
    @Query("""
        SELECT p FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.deletedAt IS NULL 
          AND p.rateMode = 'auto' 
          AND p.exchangeRate > 0 
        ORDER BY p.paymentDate DESC, p.paymentNo DESC
    """)
    fun findLatestAutoRateAll(): List<Payment>
}

/**
 * Extension to get just the first result (LIMIT 1 equivalent).
 */
fun PrepaymentRepository.findLatestAutoRate(): Payment? = findLatestAutoRateAll().firstOrNull()
