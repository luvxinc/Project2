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
     * V1 parity: transaction_list_api — reads from in_pmt_prepay_final WHERE supplier_code = ?
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
     * V1 parity: reads ALL from in_pmt_prepay_final (deleted records have amount=0, but in V3 they have deletedAt set)
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
     * V1 parity: supplier_balance_api queries in_supplier then cross-references.
     */
    @Query("""
        SELECT DISTINCT p.supplierCode FROM Payment p 
        WHERE p.paymentType = 'prepay' 
          AND p.supplierCode IS NOT NULL
    """)
    fun findDistinctSupplierCodes(): List<String>

    /**
     * Find all active prepayments for balance calculation.
     * V1 parity: balance uses in_pmt_prepay_final (only non-deleted rows).
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
}
