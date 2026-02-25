package com.mgmt.modules.sales.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * SkuCorrection — SKU 修正记忆库。
 *
 * V3: DB 表 + UNIQUE(custom_label, bad_sku) 去重
 */
@Entity
@Table(
    name = "sku_corrections",
    uniqueConstraints = [UniqueConstraint(columnNames = ["custom_label", "bad_sku"])]
)
class SkuCorrection(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "custom_label", length = 500, nullable = false)
    var customLabel: String = "",

    @Column(name = "bad_sku", length = 100, nullable = false)
    var badSku: String = "",

    @Column(name = "bad_qty", length = 20)
    var badQty: String? = null,

    @Column(name = "correct_sku", length = 100, nullable = false)
    var correctSku: String = "",

    @Column(name = "correct_qty", length = 20)
    var correctQty: String? = null,

    @Column(name = "created_by", length = 100)
    var createdBy: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
)
