package com.mgmt.modules.finance.domain.repository

import com.mgmt.modules.finance.domain.model.PaymentEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

/**
 * PaymentEventRepository — append-only event store for payment audit trail.
 *
 */
@Repository
interface PaymentEventRepository : JpaRepository<PaymentEvent, Long> {

    /**
     * Get all events for a payment, ordered by event_seq.
     */
    fun findAllByPaymentIdOrderByEventSeqAsc(paymentId: Long): List<PaymentEvent>

    /**
     * Get all events for a payment by payment_no, ordered by event_seq.
     */
    fun findAllByPaymentNoOrderByEventSeqAsc(paymentNo: String): List<PaymentEvent>

    /**
     * Get the latest event_seq for a payment (for incrementing).
     */
    @Query("""
        SELECT COALESCE(MAX(pe.eventSeq), 0) FROM PaymentEvent pe 
        WHERE pe.paymentId = :paymentId
    """)
    fun findMaxEventSeq(@Param("paymentId") paymentId: Long): Int
}
