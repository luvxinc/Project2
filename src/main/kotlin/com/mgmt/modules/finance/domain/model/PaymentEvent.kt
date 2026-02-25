package com.mgmt.modules.finance.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * PaymentEvent entity — append-only audit trail for payment changes.
 *
 * Consistent with purchase_order_events (V10) and shipment_events (V12).
 *
 * Event types:
 *   CREATE       — initial record
 *   DELETE        — soft delete
 *   RESTORE       — undelete
 *   RATE_CHANGE   — exchange rate modification
 *   AMOUNT_CHANGE — amount modification
 */
@Entity
@Table(
    name = "payment_events",
    uniqueConstraints = [UniqueConstraint(columnNames = ["payment_id", "event_seq"])]
)
class PaymentEvent(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "payment_id", nullable = false)
    var paymentId: Long = 0,

    @Column(name = "payment_no", length = 100, nullable = false)
    var paymentNo: String = "",

    @Column(name = "event_type", length = 30, nullable = false)
    var eventType: String = "",  // CREATE / DELETE / RESTORE / RATE_CHANGE / AMOUNT_CHANGE

    @Column(name = "event_seq", nullable = false)
    var eventSeq: Int = 0,

    @Column(columnDefinition = "jsonb", nullable = false)
    var changes: String = "{}",  // JSONB: initial snapshot or {before, after} diff

    @Column(length = 500)
    var note: String? = null,

    @Column(length = 50, nullable = false)
    var operator: String = "",

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
