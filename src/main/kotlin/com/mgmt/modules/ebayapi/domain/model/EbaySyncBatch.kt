package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * EbaySyncBatch — API 同步批次追踪。
 */
@Entity
@Table(name = "sync_batches", schema = "ebay_api")
class EbaySyncBatch(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "batch_id", nullable = false, unique = true, length = 50)
    var batchId: String = "",

    @Column(name = "status", nullable = false, length = 30)
    var status: String = "started",

    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,

    @Column(name = "date_from")
    var dateFrom: Instant? = null,

    @Column(name = "date_to")
    var dateTo: Instant? = null,

    @Column(name = "transactions_fetched")
    var transactionsFetched: Int = 0,

    @Column(name = "orders_fetched")
    var ordersFetched: Int = 0,

    @Column(name = "cleaned_produced")
    var cleanedProduced: Int = 0,

    @Column(name = "validation_match_pct", precision = 5, scale = 2)
    var validationMatchPct: BigDecimal? = null,

    @Column(name = "error_message", columnDefinition = "text")
    var errorMessage: String? = null,

    @Column(name = "started_at", nullable = false)
    var startedAt: Instant = Instant.now(),

    @Column(name = "completed_at")
    var completedAt: Instant? = null,

    @Column(name = "progress")
    var progress: Int = 0,

    @Column(name = "stage_message", columnDefinition = "text")
    var stageMessage: String? = null,
)
