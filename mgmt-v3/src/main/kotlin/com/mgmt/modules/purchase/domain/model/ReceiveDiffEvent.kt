package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * ReceiveDiffEvent — append-only audit trail for receive diff changes.
 *
 * Mirrors ShipmentEvent pattern exactly.
 * Records: CREATED, PROCESS_M1..M4, DELETED events.
 * This entity is NEVER updated or deleted — only inserted.
 */
@Entity
@Table(
    name = "receive_diff_events",
    uniqueConstraints = [UniqueConstraint(columnNames = ["diff_id", "event_seq"])]
)
class ReceiveDiffEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "diff_id", nullable = false)
    var diffId: Long = 0,

    @Column(name = "logistic_num", length = 50, nullable = false)
    var logisticNum: String = "",

    /** CREATED | PROCESS_M1 | PROCESS_M2 | PROCESS_M3 | PROCESS_M4 | DELETED */
    @Column(name = "event_type", length = 30, nullable = false)
    var eventType: String = "",

    @Column(name = "event_seq", nullable = false)
    var eventSeq: Int = 0,

    @Column(name = "changes", nullable = false, columnDefinition = "jsonb")
    var changes: String = "{}",

    @Column(length = 500)
    var note: String? = null,

    @Column(length = 50, nullable = false)
    var operator: String = "",

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
