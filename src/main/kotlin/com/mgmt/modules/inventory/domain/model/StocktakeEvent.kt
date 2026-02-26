package com.mgmt.modules.inventory.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * StocktakeEvent — audit history entry for stocktake operations.
 *
 * Tracks every operation on stocktakes: UPLOAD, UPDATE_ITEMS, UPDATE_NOTE, DELETE.
 * old_data/new_data are JSONB snapshots for full traceability.
 */
@Entity
@Table(name = "stocktake_events")
class StocktakeEvent(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "stocktake_id", nullable = false)
    var stocktakeId: Long = 0,

    @Column(name = "event_type", length = 20, nullable = false)
    var eventType: String = "",

    @Column(columnDefinition = "text")
    var summary: String? = null,

    @Column(name = "old_data", columnDefinition = "jsonb")
    var oldData: String? = null,

    @Column(name = "new_data", columnDefinition = "jsonb")
    var newData: String? = null,

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
