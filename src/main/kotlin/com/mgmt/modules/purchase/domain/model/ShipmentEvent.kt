package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * ShipmentEvent — append-only audit trail for shipment changes.
 *
 * Each event records what changed (before/after JSONB), who did it, and when.
 * This entity is NEVER updated or deleted — only inserted.
 */
@Entity
@Table(
    name = "shipment_events",
    uniqueConstraints = [UniqueConstraint(columnNames = ["shipment_id", "event_seq"])]
)
class ShipmentEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "shipment_id", nullable = false)
    var shipmentId: Long = 0,

    @Column(name = "logistic_num", length = 50, nullable = false)
    var logisticNum: String = "",

    /** CREATE | UPDATE_LOGISTICS | UPDATE_ITEMS | DELETE | RESTORE */
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
