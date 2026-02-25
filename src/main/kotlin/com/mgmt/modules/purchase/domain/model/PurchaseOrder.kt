package com.mgmt.modules.purchase.domain.model

import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate

/**
 * PurchaseOrder entity — aggregate root for PO subdomain.
 *
 * V1 source: in_po + in_po_final merged.
 * V3: single table with @Version optimistic locking, history via audit_log.
 */
@Entity
@Table(name = "purchase_orders")
class PurchaseOrder(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "po_num", length = 50, unique = true, nullable = false)
    var poNum: String = "",

    @Column(name = "supplier_id", nullable = false)
    var supplierId: Long = 0,

    @Column(name = "supplier_code", length = 2, nullable = false)
    var supplierCode: String = "",

    @Column(name = "po_date", nullable = false)
    var poDate: LocalDate = LocalDate.now(),

    @Column(length = 20, nullable = false)
    var status: String = "active",  // active / cancelled / completed

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

    /** V1 parity: item edit version counter (L01, L02, ...) */
    @Column(name = "detail_seq", nullable = false)
    var detailSeq: Int = 1,

    @Version
    @Column(nullable = false)
    var version: Int = 0,

    // Child items relationship
    @OneToMany(fetch = FetchType.LAZY)
    @JoinColumn(name = "po_id", insertable = false, updatable = false)
    var items: MutableList<PurchaseOrderItem> = mutableListOf(),
)
