package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate

/**
 * EtlBatch — ETL 批次追踪。
 *
 * V3: DB 表，持久化可恢复，支持轮询进度
 */
@Entity
@Table(name = "etl_batches")
class EtlBatch(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "batch_id", length = 50, nullable = false, unique = true)
    var batchId: String = "",

    /** uploading / parsing / cleaning / transforming / syncing / done / error */
    @Column(name = "status", length = 20, nullable = false)
    var status: String = "uploading",

    @Column(name = "seller", length = 100)
    var seller: String? = null,

    @Column(name = "date_min")
    var dateMin: LocalDate? = null,

    @Column(name = "date_max")
    var dateMax: LocalDate? = null,

    /** FIFO return ratios (configurable per batch) */
    @Column(name = "fifo_ratio_re", nullable = false)
    var fifoRatioRe: Int = 60,

    @Column(name = "fifo_ratio_cr", nullable = false)
    var fifoRatioCr: Int = 50,

    @Column(name = "fifo_ratio_cc", nullable = false)
    var fifoRatioCc: Int = 30,

    /** 0-100 progress percentage */
    @Column(name = "progress", nullable = false)
    var progress: Int = 0,

    @Column(name = "stage_message", columnDefinition = "text")
    var stageMessage: String? = null,

    /** JSON stats: {trans_count, earn_count, parse_stats, transform_stats, fifo_stats} */
    @Column(name = "stats", columnDefinition = "jsonb")
    var stats: String? = null,

    @Column(name = "error_message", columnDefinition = "text")
    var errorMessage: String? = null,

    @Column(name = "created_by", length = 100)
    var createdBy: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
