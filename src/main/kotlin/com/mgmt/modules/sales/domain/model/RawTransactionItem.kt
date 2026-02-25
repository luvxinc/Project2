package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

/**
 * RawTransactionItem — 原始交易的行项目 (SKU + Quantity)。
 *
 * V3 重构: 从 denormalized 10 列 → normalized 子表 (1:N)
 *
 * CASCADE DELETE from parent RawTransaction.
 */
@Entity
@Table(name = "raw_transaction_items")
class RawTransactionItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_id", nullable = false)
    var transaction: RawTransaction? = null,

    /** 便于直接查询, 不通过 join */
    @Column(name = "transaction_id", insertable = false, updatable = false)
    var transactionId: Long = 0,

    /** V1: P_SKU{n} — Parser 从 Custom label 提取 */
    @Column(name = "sku", length = 100, nullable = false)
    var sku: String = "",

    /** V1: P_Quantity{n} */
    @Column(name = "quantity", nullable = false)
    var quantity: Int = 0,

    /** 单价 (V1: item subtotal / quantity) */
    @Column(name = "unit_price", precision = 12, scale = 5, nullable = false)
    var unitPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
