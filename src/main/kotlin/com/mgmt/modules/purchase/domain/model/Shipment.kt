package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * Shipment entity — logistics shipment header.
 *
 * V3: shipments + shipment_items.
 */
@Entity
@Table(name = "shipments")
class Shipment(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "logistic_num", length = 50, unique = true, nullable = false)
    var logisticNum: String = "",

    @Column(name = "sent_date", nullable = false)
    var sentDate: LocalDate = LocalDate.now(),

    @Column(name = "eta_date")
    var etaDate: LocalDate? = null,

    @Column(nullable = false)
    var pallets: Int = 0,

    @Column(name = "total_weight", precision = 12, scale = 2, nullable = false)
    var totalWeight: BigDecimal = BigDecimal.ZERO,

    @Column(name = "price_kg", precision = 12, scale = 5, nullable = false)
    var priceKg: BigDecimal = BigDecimal.ZERO,

    @Column(name = "logistics_cost", precision = 12, scale = 2, nullable = false)
    var logisticsCost: BigDecimal = BigDecimal.ZERO,

    @Column(name = "exchange_rate", precision = 10, scale = 4, nullable = false)
    var exchangeRate: BigDecimal = BigDecimal("7.0"),

    /** in_send.mode — 'A' = auto (API-fetched), 'M' = manual (user-entered) */
    @Column(name = "rate_mode", length = 1, nullable = false)
    var rateMode: String = "M",

    @Column(length = 20, nullable = false, columnDefinition = "shipment_status")
    var status: String = "pending",  // pending / in_transit / delivered / cancelled

    @Column(length = 500)
    var note: String? = null,

    // §8.1 Audit
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(name = "created_by", length = 36)
    var createdBy: String? = null,

    @Column(name = "updated_by", length = 36)
    var updatedBy: String? = null,

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,

    @Version
    @Column(nullable = false)
    var version: Int = 0,

    @OneToMany(fetch = FetchType.LAZY)
    @JoinColumn(name = "shipment_id", insertable = false, updatable = false)
    var items: MutableList<ShipmentItem> = mutableListOf(),
)
