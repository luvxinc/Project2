package com.mgmt.modules.finance.domain.repository

import com.mgmt.modules.purchase.domain.model.Payment
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

/**
 * LogisticPaymentRepository — queries scoped to payment_type='logistics'.
 *
 * V1 parity: in_pmt_logistic_final table (denormalized current state).
 * Reuses the Payment entity from purchase module.
 */
@Repository
interface LogisticPaymentRepository : JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {

    /**
     * Find all active logistics payments.
     * V1 parity: SELECT * FROM in_pmt_logistic_final WHERE logistic_num IN (...)
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'logistics'
          AND p.deletedAt IS NULL
        ORDER BY p.paymentDate DESC
    """)
    fun findAllActiveLogistics(): List<Payment>

    /**
     * Find by paymentNo (active only).
     * V1 parity: SELECT * FROM in_pmt_logistic_final WHERE pmt_no = :pmt_no
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'logistics'
          AND p.paymentNo = :paymentNo
          AND p.deletedAt IS NULL
    """)
    fun findByPaymentNo(@Param("paymentNo") paymentNo: String): List<Payment>

    /**
     * Find by paymentNo including deleted (for restore).
     * V1 parity: needed for restore_payment_api
     */
    @Query("""
        SELECT p FROM Payment p
        WHERE p.paymentType = 'logistics'
          AND p.paymentNo = :paymentNo
    """)
    fun findByPaymentNoIncludeDeleted(@Param("paymentNo") paymentNo: String): List<Payment>

    /**
     * Find by logisticNum (active only).
     * V1 parity: SELECT * FROM in_pmt_logistic_final WHERE logistic_num = :logistic_num
     */
    fun findByPaymentTypeAndLogisticNumAndDeletedAtIsNull(paymentType: String, logisticNum: String): Payment?

    /**
     * Find the latest paymentNo sequence for a given date prefix.
     * V1 parity: SELECT pmt_no FROM in_pmt_logistic WHERE pmt_no LIKE '{date}_S%' ORDER BY pmt_no DESC LIMIT 1
     */
    @Query("""
        SELECT p.paymentNo FROM Payment p
        WHERE p.paymentType = 'logistics'
          AND p.paymentNo LIKE :prefix
        ORDER BY p.paymentNo DESC
    """)
    fun findLatestPaymentNo(@Param("prefix") prefix: String, pageable: Pageable): List<String>

    /** Get logistic nums that have deleted logistics payments (for "deleted" status in list view) */
    @Query("""
        SELECT DISTINCT p.logisticNum FROM Payment p
        WHERE p.paymentType = 'logistics'
          AND p.deletedAt IS NOT NULL
          AND p.logisticNum IS NOT NULL
    """)
    fun findDeletedLogisticNums(): Set<String>
}
