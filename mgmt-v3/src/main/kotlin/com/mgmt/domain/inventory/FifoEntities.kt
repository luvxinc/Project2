package com.mgmt.domain.inventory

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * FifoTransaction — maps to fifo_transactions table.
 * V1 parity: in_dynamic_tran
 */
@Entity
@Table(name = "fifo_transactions")
class FifoTransaction(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "transaction_date", nullable = false)
    var transactionDate: Instant = Instant.now(),

    @Column(length = 100, nullable = false)
    var sku: String = "",

    @Column(name = "po_num", length = 50)
    var poNum: String? = null,

    @Column(name = "unit_price", precision = 12, scale = 5, nullable = false)
    var unitPrice: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(nullable = false, columnDefinition = "fifo_action")
    var action: String = "in",

    @Column(name = "tran_type", nullable = false, columnDefinition = "fifo_tran_type")
    var tranType: String = "purchase",

    @Column(name = "ref_key")
    var refKey: String? = null,

    var note: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)

/**
 * FifoLayer — maps to fifo_layers table.
 * V1 parity: in_dynamic_fifo_layers + in_dynamic_landed_price merged.
 */
@Entity
@Table(name = "fifo_layers")
class FifoLayer(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(length = 100, nullable = false)
    var sku: String = "",

    @Column(name = "in_tran_id", nullable = false)
    var inTranId: Long = 0,

    @Column(name = "in_date", nullable = false)
    var inDate: Instant = Instant.now(),

    @Column(name = "po_num", length = 50)
    var poNum: String? = null,

    @Column(name = "unit_cost", precision = 12, scale = 5, nullable = false)
    var unitCost: BigDecimal = BigDecimal.ZERO,

    @Column(name = "landed_cost", precision = 12, scale = 5)
    var landedCost: BigDecimal? = null,

    @Column(name = "qty_in", nullable = false)
    var qtyIn: Int = 0,

    @Column(name = "qty_remaining", nullable = false)
    var qtyRemaining: Int = 0,

    @Column(name = "closed_at")
    var closedAt: Instant? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)

/**
 * LandedPrice — maps to landed_prices table.
 * V1 parity: in_dynamic_landed_price.
 * Created by Purchase (receive submit), Updated by Finance (payment recalculation).
 */
@Entity
@Table(name = "landed_prices")
class LandedPrice(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "fifo_tran_id")
    var fifoTranId: Long? = null,

    @Column(name = "fifo_layer_id")
    var fifoLayerId: Long? = null,

    @Column(name = "logistic_num", length = 50, nullable = false)
    var logisticNum: String = "",

    @Column(name = "po_num", length = 50, nullable = false)
    var poNum: String = "",

    @Column(length = 100, nullable = false)
    var sku: String = "",

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(name = "base_price_usd", precision = 12, scale = 5, nullable = false)
    var basePriceUsd: BigDecimal = BigDecimal.ZERO,

    @Column(name = "landed_price_usd", precision = 12, scale = 5, nullable = false)
    var landedPriceUsd: BigDecimal = BigDecimal.ZERO,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)

// ─── Repositories ────────────────────────────────────────────

interface FifoTransactionRepository : org.springframework.data.jpa.repository.JpaRepository<FifoTransaction, Long> {
    /**
     * Find INIT-type transactions for a given SKU.
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT t FROM FifoTransaction t WHERE t.sku = :sku AND t.poNum LIKE 'INIT%'"
    )
    fun findInitTransactionsBySku(sku: String): List<FifoTransaction>

    /** Check if a receive transaction already exists (idempotent guard, V1 parity) */
    fun findByRefKey(refKey: String): FifoTransaction?
}

interface FifoLayerRepository : org.springframework.data.jpa.repository.JpaRepository<FifoLayer, Long> {
    fun findByInTranIdIn(tranIds: List<Long>): List<FifoLayer>

    fun findByInTranId(tranId: Long): FifoLayer?

    /**
     * Bulk update init layers' costs when COGS changes.
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(
        "UPDATE FifoLayer l SET l.unitCost = :cost, l.landedCost = :cost WHERE l.inTranId IN :tranIds"
    )
    fun updateCostByTranIds(tranIds: List<Long>, cost: java.math.BigDecimal): Int
}

interface LandedPriceRepository : org.springframework.data.jpa.repository.JpaRepository<LandedPrice, Long> {
    /** Idempotent check — V1 parity: existing_price check before INSERT */
    fun findByLogisticNumAndPoNumAndSku(logisticNum: String, poNum: String, sku: String): LandedPrice?

    /** For Finance recalculation: find all landed prices for a PO */
    fun findByPoNum(poNum: String): List<LandedPrice>

    /** For Finance recalculation: find all landed prices for a logistic num */
    fun findByLogisticNum(logisticNum: String): List<LandedPrice>
}

