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
 * V1 parity: in_pmt_deposit_final table (denormalized current state).
 * Reuses the Payment entity from purchase module.
 */
@Repository
interface DepositPaymentRepository : JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {

    /**
     * Find all active deposit payments for given PO numbers.
     * V1 parity: SELECT * FROM in_pmt_deposit_final WHERE po_num IN (:poNums)
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
     * V1 parity: SELECT * FROM in_pmt_deposit_final WHERE pmt_no = :pmtNo
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
     * V1 parity: SELECT * FROM in_pmt_deposit_final WHERE po_num = :poNum
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
     * V1 parity: SELECT COUNT(*) FROM in_pmt_deposit WHERE pmt_no LIKE 'DPMT_{date}_N%'
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
     * V1 parity: SELECT * FROM in_pmt_prepay WHERE tran_note LIKE 'Deposit_{pmtNo}%'
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
     * V1 parity: SELECT COUNT(*) FROM in_pmt_prepay WHERE tran_num LIKE '{code}_{date}_out_%'
     */
    @Query("""
        SELECT p.paymentNo FROM Payment p
        WHERE p.paymentType = 'prepay'
          AND p.paymentNo LIKE :pattern
        ORDER BY p.paymentNo DESC
    """)
    fun findLatestPrepayNoForPattern(@Param("pattern") pattern: String, pageable: Pageable): List<String>
}
