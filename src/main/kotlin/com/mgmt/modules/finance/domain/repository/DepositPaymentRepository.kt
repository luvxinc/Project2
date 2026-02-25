package com.mgmt.modules.finance.domain.repository

import com.mgmt.modules.purchase.domain.model.Payment
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

/**
 * DepositPaymentRepository — queries scoped to payment_type='deposit'.
 *
 * Reuses the Payment entity from purchase module.
 */
@Repository
interface DepositPaymentRepository : JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {

    /**
     * Find all active deposit payments for given PO numbers.
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'deposit'
          AND p.poNum IN :poNums
          AND p.deletedAt IS NULL
        ORDER BY p.paymentDate DESC, p.paymentNo DESC
    """)
    fun findDepositPaymentsByPoNums(@Param("poNums") poNums: List<String>): List<Payment>

    /**
     * Find active deposit payments by paymentNo.
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'deposit'
          AND p.paymentNo = :paymentNo
          AND p.deletedAt IS NULL
    """)
    fun findActiveByPaymentNo(@Param("paymentNo") paymentNo: String): List<Payment>

    /**
     * Find all deposit payments by paymentNo (including deleted, for history).
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'deposit'
          AND p.paymentNo = :paymentNo
    """)
    fun findByPaymentNo(@Param("paymentNo") paymentNo: String): List<Payment>

    /**
     * Find active deposit payments for a specific PO.
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'deposit'
          AND p.poNum = :poNum
          AND p.deletedAt IS NULL
        ORDER BY p.paymentDate DESC, p.paymentNo DESC
    """)
    fun findByPoNumActive(@Param("poNum") poNum: String): List<Payment>

    /**
     * Find the latest paymentNo sequence for a given date prefix.
     */
    @Query("""
        SELECT p.paymentNo FROM Payment p
        WHERE p.paymentType = 'deposit'
          AND p.paymentNo LIKE :prefix
        ORDER BY p.paymentNo DESC
    """)
    fun findLatestPaymentNoForDate(@Param("prefix") prefix: String, pageable: Pageable): List<String>

    /**
     * Find prepay 'usage' records linked to a deposit payment via note.
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'prepay'
          AND p.note LIKE :notePattern
          AND p.deletedAt IS NULL
    """)
    fun findPrepayUsageByDepositNote(@Param("notePattern") notePattern: String): List<Payment>

    /**
     * Find latest prepay out sequence for a supplier/date pattern.
     */
    @Query("""
        SELECT p.paymentNo FROM Payment p
        WHERE p.paymentType = 'prepay'
          AND p.paymentNo LIKE :pattern
        ORDER BY p.paymentNo DESC
    """)
    fun findLatestPrepayNoForPattern(@Param("pattern") pattern: String, pageable: Pageable): List<String>
}
