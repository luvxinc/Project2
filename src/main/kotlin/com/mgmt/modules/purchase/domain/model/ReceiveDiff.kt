package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * ReceiveDiff — discrepancy record when sent ≠ received.
 *
 * V1 source: in_diff + in_diff_final merged.
 * status: pending → resolved (with resolution_note).
 */
@Entity
@Table(name = "receive_diffs")
class ReceiveDiff(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "receive_id", nullable = false)
    var receiveId: Long = 0,

    @Column(name = "logistic_num", length = 50, nullable = false)
    var logisticNum: String = "",

    @Column(name = "po_num", length = 50, nullable = false)
    var poNum: String = "",

    @Column(length = 100, nullable = false)
    var sku: String = "",

    @Column(name = "po_quantity", nullable = false)
    var poQuantity: Int = 0,

    @Column(name = "sent_quantity", nullable = false)
    var sentQuantity: Int = 0,

    @Column(name = "receive_quantity", nullable = false)
    var receiveQuantity: Int = 0,

    @Column(name = "diff_quantity", nullable = false)
    var diffQuantity: Int = 0,

    @Column(length = 20, nullable = false, columnDefinition = "receive_diff_status")
    var status: String = "pending",  // pending / resolved

    @Column(name = "resolution_note", columnDefinition = "TEXT")
    var resolutionNote: String? = null,

    // §8.1 Audit
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,

    @Version
    @Column(nullable = false)
    var version: Int = 0,
)
