package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * PurchaseOrderEvent — append-only audit trail for PO changes.
 *
 * Each event records what changed (before/after JSONB), who did it, and when.
 * This entity is NEVER updated or deleted — only inserted.
 */
@Entity
@Table(
    name = "purchase_order_events",
    uniqueConstraints = [UniqueConstraint(columnNames = ["po_id", "event_seq"])]
)
class PurchaseOrderEvent(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "po_id", nullable = false)
    var poId: Long = 0,

    @Column(name = "po_num", length = 50, nullable = false)
    var poNum: String = "",

    /** CREATE | UPDATE_ITEMS | UPDATE_STRATEGY | DELETE | RESTORE */
    @Column(name = "event_type", length = 30, nullable = false)
    var eventType: String = "",

    /** Per-PO incrementing sequence (1, 2, 3...) — maps to V1's L01, L02, L03 */
    @Column(name = "event_seq", nullable = false)
    var eventSeq: Int = 0,

    /** JSONB: before/after diff recording field-level changes */
    @Column(name = "changes", nullable = false, columnDefinition = "jsonb")
    var changes: String = "{}",

    /** Human-readable note (V1: "原始订单", "删除订单_aaron_2026-02-20") */
    @Column(length = 500)
    var note: String? = null,

    /** Username of operator */
    @Column(length = 50, nullable = false)
    var operator: String = "",

    /** Immutable creation timestamp */
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
