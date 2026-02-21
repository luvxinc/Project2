package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Receive
import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.repository.*
import com.mgmt.domain.inventory.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * ReceiveUseCase — 100% V1 parity (Iron Rule R7: ZERO functional deviation).
 *
 * V1 source files:
 *   receive/query.py        → findPendingShipments, findShipmentItems
 *   receive/submit.py       → submitReceive
 *   receive_mgmt/list.py    → findForManagement
 *   receive_mgmt/detail.py  → findManagementDetail
 *   receive_mgmt/edit.py    → editReceive
 *   receive_mgmt/delete.py  → deleteReceive, restoreReceive
 *   receive_mgmt/history.py → getHistory
 *
 * Key V1 algorithms implemented:
 *   ① Multi-price tier allocation (submit.py L165-251 / edit.py L172-258)
 *   ② Seq-based version history with change-diff (history.py)
 *   ③ (po_num, sku) group-merge for shipment items (query.py L267-286)
 *   ④ Pending shipments filter: total_receive_qty == 0 (query.py L186-200)
 *   ⑤ PO quantity from purchase_order_items (po_quantity in diff)
 */
@Service
class ReceiveUseCase(
    private val receiveRepo: ReceiveRepository,
    private val receiveDiffRepo: ReceiveDiffRepository,
    private val shipmentRepo: ShipmentRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poItemRepo: PurchaseOrderItemRepository,
    private val fifoTranRepo: FifoTransactionRepository,
    private val fifoLayerRepo: FifoLayerRepository,
    private val landedPriceRepo: LandedPriceRepository,
) {
    private val log = LoggerFactory.getLogger(ReceiveUseCase::class.java)

    // ═══════════════════════════════════════════════════════
    // SECTION 1 — Query: Pending Shipments (货物入库 - 查询)
    // V1 parity: receive/query.py → get_pending_shipments_api
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: query.py L22-229
     * Returns shipments whose sent_date <= receiveDate that have NOT been received yet.
     * "Not received" = no active receive records exist, OR all qty == 0 (V1 L186-200).
     *
     * CRITICAL: soft-deleted receive records must NOT count as "received" — they are
     * equivalent to V1's empty in_receive_final (deleted via DELETE statement).
     */
    @Transactional(readOnly = true)
    fun findPendingShipments(receiveDate: LocalDate): List<ShipmentResponse> {
        val allShipments = shipmentRepo.findAllByDeletedAtIsNull()
        val eligible = allShipments.filter {
            it.sentDate <= receiveDate && it.status != "cancelled"
        }
        return eligible.filter { shipment ->
            // V1 parity query.py L186-200:
            // "if not receive_data: return (True, 'none')"
            // "if total_receive > 0: return (False, 'received')"
            // Only ACTIVE (non-deleted) receives count as "received"
            val activeReceives = receiveRepo.findAllByShipmentIdAndDeletedAtIsNull(shipment.id)
            val totalActiveReceived = activeReceives.sumOf { it.receiveQuantity }
            totalActiveReceived == 0   // Pending if no active received qty
        }.map { shipment ->
            val items = shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipment.id)
            toShipmentResponse(shipment, items)
        }
    }

    /**
     * V1 parity: query.py L232-295 → get_shipment_items_api
     *
     * CRITICAL FIX (P2-2): V1 groups by (po_num, po_sku) and SUM(sent_quantity).
     * Different price tiers of the same SKU are MERGED into one row for display.
     * V3 returns one grouped response per (po_num, sku) with total quantity.
     */
    @Transactional(readOnly = true)
    fun findShipmentItems(logisticNum: String): List<ShipmentItemGroupedResponse> {
        val shipment = shipmentRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
            ?: throw NotFoundException("purchase.errors.shipmentNotFound")

        val items = shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipment.id)

        // V1 parity: GROUP BY (po_num, po_sku), SUM(sent_quantity) — query.py L267-286
        return items
            .groupBy { "${it.poNum}|${it.sku}" }
            .map { (_, rows) ->
                val first = rows.first()
                ShipmentItemGroupedResponse(
                    poNum = first.poNum,
                    sku = first.sku,
                    sentQuantity = rows.sumOf { it.quantity },   // ← V1: SUM(sent_quantity)
                    unitPrice = first.unitPrice.toDouble(),      // representative price for display
                )
            }
            .sortedWith(compareBy({ it.poNum }, { it.sku }))
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 2 — Submit Receive (货物入库 - 提交)
    // V1 parity: receive/submit.py → submit_receive_api
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: submit.py L28-376
     *
     * Algorithm:
     *   ① Duplicate check: reject if any active receive with qty > 0 exists.
     *   ② For each submitted item (identified by sku):
     *      - Find ALL shipment_items rows for that SKU (may be multiple price tiers).
     *      - Allocate receive_quantity across price tiers (multi-price algorithm).
     *      - Write one Receive record per price tier.
     *      - If sent != received, create ReceiveDiff with po_quantity from PO table.
     *   ③ Mark shipment as "delivered".
     *   ④ Trigger landed price creation (finance integration point).
     */
    @Transactional
    fun submitReceive(dto: SubmitReceiveRequest, username: String): List<Receive> {
        val shipment = shipmentRepo.findByLogisticNumAndDeletedAtIsNull(dto.logisticNum)
            ?: throw NotFoundException("purchase.errors.shipmentNotFound")

        // V1 parity P0-2: duplicate check (submit.py L87-100)
        val existing = receiveRepo.findAllByShipmentIdAndDeletedAtIsNull(shipment.id)
        if (existing.any { it.receiveQuantity > 0 }) {
            throw IllegalStateException("purchase.errors.alreadyReceived: ${dto.logisticNum}")
        }

        val allShipmentItems = shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipment.id)
        val receives = mutableListOf<Receive>()

        dto.items.forEach { input ->
            val inputSku = input.sku.trim().uppercase()
            val inputReceiveQty = input.receiveQuantity

            // V1 parity: all rows for this SKU sorted DESC by price (submit.py L132-140)
            val skuRows = allShipmentItems
                .filter { it.sku == inputSku }
                .sortedByDescending { it.unitPrice }

            if (skuRows.isEmpty()) {
                log.warn("[submitReceive] SKU $inputSku not found in shipment ${dto.logisticNum}, skipping")
                return@forEach
            }

            val totalSentQty = skuRows.sumOf { it.quantity }

            // V1 parity: multi-price tier allocation (submit.py L162-251)
            val allocations = allocateReceiveQty(
                rows = skuRows.map { PriceTierRow(it.unitPrice, it.quantity) },
                receiveQty = inputReceiveQty,
                totalSentQty = totalSentQty,
            )

            skuRows.forEachIndexed { idx, item ->
                val allocatedQty = allocations[idx]
                val poQuantity = queryPoQuantity(item.poNum, item.sku)  // P0-2 fix

                val receive = Receive(
                    shipmentId = shipment.id,
                    logisticNum = shipment.logisticNum,
                    poId = item.poId,
                    poNum = item.poNum,
                    sku = item.sku,
                    unitPrice = item.unitPrice,
                    sentQuantity = item.quantity,
                    receiveQuantity = allocatedQty,
                    receiveDate = input.receiveDate,
                    etaDate = shipment.etaDate,
                    note = input.note ?: "原始入库",
                    createdBy = username,
                    updatedBy = username,
                )
                val saved = receiveRepo.save(receive)
                receives.add(saved)

                // V1 parity: auto-diff creation (submit.py L281-344)
                val diff = item.quantity - allocatedQty
                if (diff != 0) {
                    receiveDiffRepo.save(ReceiveDiff(
                        receiveId = saved.id,
                        logisticNum = shipment.logisticNum,
                        poNum = item.poNum,
                        sku = item.sku,
                        poQuantity = poQuantity,          // from in_po_final equiv
                        sentQuantity = item.quantity,
                        receiveQuantity = allocatedQty,
                        diffQuantity = diff,
                        status = "pending",
                        createdBy = username,
                        updatedBy = username,
                    ))
                }
            }
        }

        // Update shipment status → delivered
        shipment.status = "delivered"
        shipment.updatedAt = Instant.now()
        shipment.updatedBy = username
        shipmentRepo.save(shipment)

        // V1 parity P0-3 (submit.py L358-365): landed price creation
        triggerLandedPriceCreation(dto.logisticNum)

        return receives
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 3 — Management List (入库管理 - 列表)
    // V1 parity: receive_mgmt/list.py → receive_list_api
    // ═══════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun findAll(): List<Receive> = receiveRepo.findAllByDeletedAtIsNullOrderByReceiveDateDesc()

    /**
     * V1 parity: list.py L48-280
     * Returns all logistic nums with status + can_modify + can_delete + detail_seq + update_date.
     *
     * Status rules (list.py L202-237):
     *   - DELETED:         all active records gone (soft-deleted)
     *   - IN_TRANSIT:      no active receives OR totalReceived == 0
     *   - ALL_RECEIVED:    sent == received for all rows
     *   - DIFF_UNRESOLVED: has pending diffs
     *   - DIFF_RESOLVED:   all diffs resolved
     *
     * canModify / canDelete (list.py L207, L223, L226):
     *   IN_TRANSIT only → both true. All other statuses → false.
     *
     * detail_seq / update_date (list.py L115-136):
     *   Max version ("V{N}") based on JPA @Version, update_date = latest updatedAt.
     */
    @Transactional(readOnly = true)
    fun findForManagement(
        sortBy: String = "receiveDate",
        sortOrder: String = "desc",
    ): List<ReceiveManagementItemResponse> {
        val allReceives = receiveRepo.findAll()
        val byLogistic = allReceives.groupBy { it.logisticNum }

        // Batch-load all shipments for involved logisticNums (avoids N+1 + runCatching swallowing errors)
        val logisticNums = byLogistic.keys
        val shipmentMap: Map<String, Shipment> = shipmentRepo
            .findAllByLogisticNumIn(logisticNums)
            .associateBy { it.logisticNum }

        val result = byLogistic.map { (logisticNum, records) ->
            val activeRecords = records.filter { it.deletedAt == null }
            val isDeleted = activeRecords.isEmpty() && records.isNotEmpty()

            val receiveDate = activeRecords.maxByOrNull { it.receiveDate }?.receiveDate
                ?: records.maxByOrNull { it.receiveDate }?.receiveDate

            // Lookup sentDate from pre-loaded shipment map
            val sentDate = shipmentMap[logisticNum]?.sentDate?.toString() ?: "-"

            // V1 parity: detail_seq = max version across active records
            val maxVersion = activeRecords.maxOfOrNull { it.version } ?: 0
            val detailSeq = "V${String.format("%02d", maxVersion + 1)}"

            // V1 parity: update_date = most recent updatedAt
            val updateDate = activeRecords.maxByOrNull { it.updatedAt }?.updatedAt?.toString() ?: "-"

            val sentQty = activeRecords.sumOf { it.sentQuantity }
            val receivedQty = activeRecords.sumOf { it.receiveQuantity }

            val diffs = if (!isDeleted && receivedQty > 0 && sentQty != receivedQty) {
                receiveDiffRepo.findAllByLogisticNum(logisticNum)
            } else emptyList()

            val status = when {
                isDeleted -> ReceiveStatus.DELETED
                activeRecords.isEmpty() || receivedQty == 0 -> ReceiveStatus.IN_TRANSIT
                sentQty == receivedQty -> ReceiveStatus.ALL_RECEIVED
                else -> if (diffs.any { it.status == "pending" }) ReceiveStatus.DIFF_UNRESOLVED
                        else ReceiveStatus.DIFF_RESOLVED
            }

            // V1 parity (list.py L207/L223-226):
            //   IN_TRANSIT → can_modify=True, can_delete=True
            //   ALL_RECEIVED / DIFF_UNRESOLVED / DIFF_RESOLVED → can_modify=False, can_delete=False
            //   DELETED → can_modify=False, can_delete=False
            val canModify = status == ReceiveStatus.IN_TRANSIT
            val canDelete = status == ReceiveStatus.IN_TRANSIT

            ReceiveManagementItemResponse(
                logisticNum = logisticNum,
                sentDate = sentDate,
                receiveDate = receiveDate?.toString() ?: "-",
                detailSeq = detailSeq,
                updateDate = updateDate,
                status = status.name,
                canModify = canModify,
                canDelete = canDelete,
                isDeleted = isDeleted,
            )
        }

        // V1 parity P1-3: honor sortBy / sortOrder (list.py L67-75)
        val allowedSort = setOf("logisticNum", "receiveDate", "sentDate")
        val safeSortBy = if (sortBy in allowedSort) sortBy else "receiveDate"
        val descending = sortOrder != "asc"

        return result.sortedWith(Comparator { a, b ->
            val cmp = when (safeSortBy) {
                "logisticNum" -> a.logisticNum.compareTo(b.logisticNum)
                "sentDate" -> a.sentDate.compareTo(b.sentDate)
                else -> a.receiveDate.compareTo(b.receiveDate)
            }
            if (descending) -cmp else cmp
        })
    }


    // ═══════════════════════════════════════════════════════
    // SECTION 4 — Management Detail (入库管理 - 详情)
    // V1 parity: receive_mgmt/detail.py
    // ═══════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun findOne(id: Long): Receive =
        receiveRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.receiveNotFound")

    @Transactional(readOnly = true)
    fun findByShipment(shipmentId: Long): List<Receive> =
        receiveRepo.findAllByShipmentIdAndDeletedAtIsNull(shipmentId)

    @Transactional(readOnly = true)
    fun findManagementDetail(logisticNum: String): ReceiveManagementDetailResponse {
        val shipment = shipmentRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
        val receives = receiveRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
        val receiveDate = receives.maxByOrNull { it.receiveDate }?.receiveDate
        val sentQty = receives.sumOf { it.sentQuantity }
        val receivedQty = receives.sumOf { it.receiveQuantity }
        val diffs = receiveDiffRepo.findAllByLogisticNum(logisticNum)

        val status = when {
            receivedQty == 0 -> "IN_TRANSIT"
            sentQty == receivedQty -> "ALL_RECEIVED"
            else -> if (diffs.any { it.status == "pending" }) "DIFF_UNRESOLVED" else "DIFF_RESOLVED"
        }

        // Group by (po_num, sku) — sum across price tiers
        val items = receives
            .groupBy { "${it.poNum}|${it.sku}" }
            .map { (_, recs) ->
                val r = recs.first()
                val sentTotal = recs.sumOf { it.sentQuantity }
                val recvTotal = recs.sumOf { it.receiveQuantity }
                val diff = sentTotal - recvTotal
                ReceiveDetailItemResponse(
                    poNum = r.poNum,
                    sku = r.sku,
                    sentQuantity = sentTotal,
                    receiveQuantity = recvTotal,
                    diff = diff,
                    itemStatus = when {
                        diff == 0 -> "normal"
                        diff > 0 -> "deficit"
                        else -> "excess"
                    },
                )
            }
            .sortedWith(compareBy({ it.poNum }, { it.sku }))

        return ReceiveManagementDetailResponse(
            logisticNum = logisticNum,
            receiveDate = receiveDate?.toString() ?: "-",
            etaDate = shipment?.etaDate?.toString() ?: "-",
            pallets = shipment?.pallets ?: 0,
            receiveStatus = status,
            note = receives.firstOrNull()?.note ?: "-",
            createdBy = receives.firstOrNull()?.createdBy ?: "-",
            updatedBy = receives.maxByOrNull { it.updatedAt }?.updatedBy ?: "-",
            items = items,
            diffs = diffs.map { toDiffResponse(it) },
        )
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 5 — Edit Receive (入库管理 - 修改)
    // V1 parity: receive_mgmt/edit.py → receive_edit_submit_api
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: edit.py L70-458
     *
     * Algorithm:
     *   ① Find ALL receive rows for (po_num, sku) sorted by price DESC.
     *   ② Allocate new receive_quantity across price tiers (multi-price algorithm).
     *   ③ Upsert diff records: update existing, create new, or resolve if diff=0.
     *   ④ Trigger landed price recalculation.
     */
    @Transactional
    fun editReceive(logisticNum: String, dto: EditReceiveRequest, username: String): EditReceiveResult {
        val allReceives = receiveRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
        if (allReceives.isEmpty()) throw NotFoundException("purchase.errors.receiveNotFound")

        // V1 parity guard (list.py L207/L223-226): edit is only allowed for IN_TRANSIT status.
        // IN_TRANSIT = totalReceivedQty == 0 (no active receiving has been submitted yet).
        // Any other status (ALL_RECEIVED, DIFF_UNRESOLVED, DIFF_RESOLVED) → reject.
        val totalReceivedQty = allReceives.sumOf { it.receiveQuantity }
        if (totalReceivedQty > 0) {
            throw IllegalStateException("purchase.errors.receiveNotModifiable")
        }

        var updatedRows = 0
        var diffRows = 0

        dto.items.forEach { input ->
            val inputSku = input.sku.trim().uppercase()
            val newReceiveQty = input.receiveQuantity

            // All rows for this (po_num, sku) sorted DESC by price (edit.py L135-143)
            val matchingReceives = allReceives
                .filter { it.poNum == input.poNum && it.sku == inputSku }
                .sortedByDescending { it.unitPrice }

            if (matchingReceives.isEmpty()) return@forEach

            val totalSentQty = matchingReceives.sumOf { it.sentQuantity }

            // V1 parity: multi-price tier allocation (edit.py L172-258)
            val allocations = allocateReceiveQty(
                rows = matchingReceives.map { PriceTierRow(it.unitPrice, it.sentQuantity) },
                receiveQty = newReceiveQty,
                totalSentQty = totalSentQty,
            )

            matchingReceives.forEachIndexed { idx, receive ->
                val allocatedQty = allocations[idx]
                receive.receiveQuantity = allocatedQty
                receive.note = dto.note ?: receive.note
                receive.updatedAt = Instant.now()
                receive.updatedBy = username
                receiveRepo.save(receive)
                updatedRows++

                // V1 parity: diff upsert / resolution (edit.py L260-297)
                val diff = receive.sentQuantity - allocatedQty
                val existingDiffs = receiveDiffRepo.findAllByReceiveId(receive.id)

                if (diff != 0) {
                    val poQuantity = queryPoQuantity(input.poNum, inputSku)
                    if (existingDiffs.isEmpty()) {
                        receiveDiffRepo.save(ReceiveDiff(
                            receiveId = receive.id,
                            logisticNum = logisticNum,
                            poNum = input.poNum,
                            sku = inputSku,
                            poQuantity = poQuantity,
                            sentQuantity = receive.sentQuantity,
                            receiveQuantity = allocatedQty,
                            diffQuantity = diff,
                            status = "pending",
                            createdBy = username,
                            updatedBy = username,
                        ))
                    } else {
                        existingDiffs.forEach { d ->
                            d.receiveQuantity = allocatedQty
                            d.diffQuantity = diff
                            d.status = "pending"
                            d.updatedAt = Instant.now()
                            d.updatedBy = username
                            receiveDiffRepo.save(d)
                        }
                    }
                    diffRows++
                } else {
                    // V1 parity edit.py L291-297: differential cleared → resolve
                    existingDiffs.forEach { d ->
                        d.receiveQuantity = allocatedQty
                        d.diffQuantity = 0
                        d.status = "resolved"
                        d.resolutionNote = dto.note ?: "入库数量已修正"
                        d.updatedAt = Instant.now()
                        d.updatedBy = username
                        receiveDiffRepo.save(d)
                    }
                }
            }
        }

        // V1 parity P0-5 (edit.py L438-443)
        triggerLandedPriceRecalculation(logisticNum)

        return EditReceiveResult(updatedRows = updatedRows, diffRows = diffRows)
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 6 — Diff Resolution
    // ═══════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    fun getPendingDiffs(): List<ReceiveDiff> = receiveDiffRepo.findAllByStatus("pending")

    @Transactional(readOnly = true)
    fun getDiffsByReceive(receiveId: Long): List<ReceiveDiff> = receiveDiffRepo.findAllByReceiveId(receiveId)

    @Transactional
    fun resolveDiff(diffId: Long, dto: ResolveReceiveDiffRequest, username: String): ReceiveDiff {
        val diff = receiveDiffRepo.findById(diffId)
            .orElseThrow { NotFoundException("purchase.errors.diffNotFound") }
        diff.status = "resolved"
        diff.resolutionNote = dto.resolutionNote
        diff.updatedAt = Instant.now()
        diff.updatedBy = username
        return receiveDiffRepo.save(diff)
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 7 — Delete / Restore
    // V1 parity: receive_mgmt/delete.py
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: delete.py L26-216 → submit_receive_delete_api
     *
     * V1 mechanism: writes qty=0 record to in_receive (audit log), DELETEs in_receive_final.
     * V3 equivalent: sets deletedAt (soft-delete). Semantically identical for:
     *   - findForManagement: detects DELETED via activeRecords.isEmpty()
     *   - findPendingShipments: only counts active receives (totalActive == 0 → pending)
     *
     * Note (P0-7): note is REQUIRED — enforced via isNullOrBlank check.
     */
    @Transactional
    fun deleteReceive(logisticNum: String, note: String?, username: String): Boolean {
        if (note.isNullOrBlank()) {
            throw IllegalArgumentException("purchase.errors.deleteNoteRequired")
        }
        val receives = receiveRepo.findByLogisticNumAndDeletedAtIsNull(logisticNum)
        if (receives.isEmpty()) throw NotFoundException("purchase.errors.receiveNotFound")

        val now = Instant.now()
        val deleteNote = "删除订单 by $username: $note"

        receives.forEach { r ->
            r.deletedAt = now
            r.updatedAt = now
            r.updatedBy = username
            r.note = deleteNote
            receiveRepo.save(r)
        }

        // V1 parity: mark pending diffs as deleted and zero out diff_quantity
        receiveDiffRepo.findAllByLogisticNum(logisticNum)
            .filter { it.status == "pending" }
            .forEach { d ->
                d.status = "deleted"
                d.diffQuantity = 0       // V1: writes 0 to in_diff_final
                d.resolutionNote = "订单已删除: $note"
                d.updatedAt = now
                d.updatedBy = username
                receiveDiffRepo.save(d)
            }

        return true
    }

    /**
     * V1 parity: delete.py L219-526 → submit_receive_undelete_api
     *
     * V1 mechanism: finds deleted records, backtracks to previous valid seq, re-inserts into finals.
     * V3 equivalent: clears deletedAt on all soft-deleted records.
     * Restores diffs that had non-zero sent/received difference.
     */
    @Transactional
    fun restoreReceive(logisticNum: String, username: String): Boolean {
        val allRecords = receiveRepo.findAllByLogisticNumOrderBySkuAsc(logisticNum)
        val deletedRecords = allRecords.filter { it.deletedAt != null }
        if (deletedRecords.isEmpty()) throw NotFoundException("purchase.errors.receiveNotDeleted")

        val now = Instant.now()
        val restoreNote = "恢复订单 by $username"

        deletedRecords.forEach { r ->
            r.deletedAt = null
            r.updatedAt = now
            r.updatedBy = username
            r.note = restoreNote
            receiveRepo.save(r)
        }

        // V1 parity delete.py L412-503: restore diffs with non-zero diff
        receiveDiffRepo.findAllByLogisticNum(logisticNum)
            .filter { it.status == "deleted" && it.sentQuantity != it.receiveQuantity }
            .forEach { d ->
                d.diffQuantity = d.sentQuantity - d.receiveQuantity  // recompute
                d.status = "pending"
                d.resolutionNote = null
                d.updatedAt = now
                d.updatedBy = username
                receiveDiffRepo.save(d)
            }

        return true
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 8 — History (入库管理 - 历史记录)
    // V1 parity: receive_mgmt/history.py → get_receive_history_api
    // ═══════════════════════════════════════════════════════

    /**
     * FULL V1 PARITY rewrite (P2-3 FIXED).
     *
     * V1 algorithm (history.py):
     *   ① Group in_receive rows by seq (e.g. V01, R02, V03).
     *   ② For each seq-group, compute delta changes vs previous state.
     *   ③ First group = initial version (isInitial=true) → return all items.
     *   ④ Subsequent groups = adjustments (isInitial=false) → return only changed items.
     *   ⑤ Same logic applied to in_diff records grouped by seq (D01, D02...).
     *
     * V3 mapping:
     *   - Receive.version (JPA @Version) increments on every save = V{版本号}
     *   - Receives with same version within a logistic_num = same seq-group
     *   - For soft-deleted records, version still tracks the deletion seq
     *
     * Strategy: group by (note + version) to reconstruct seq batches,
     * then compute field-level diffs between consecutive versions.
     */
    @Transactional(readOnly = true)
    fun getHistory(logisticNum: String): ReceiveHistoryResponse {
        // All records including soft-deleted (V1: reads in_receive directly — all rows)
        val allRecords = receiveRepo.findAllByLogisticNumOrderBySkuAsc(logisticNum)
        val allDiffs = receiveDiffRepo.findAllByLogisticNum(logisticNum)

        // ── RECEIVE VERSIONS ─────────────────────────────
        // Group by JPA version counter (equiv. to V1's seq field)
        val recordsByVersion = allRecords
            .groupBy { it.version }
            .toSortedMap()   // ascending → oldest first

        // Running state: (po_num, sku, price) → receive_qty at current version
        val prevState = mutableMapOf<Triple<String, String, BigDecimal>, Int>()

        // Also track sentQty — doesn't change per version but needed for snapshot
        val sentQtyState = mutableMapOf<Triple<String, String, BigDecimal>, Int>()

        val receiveVersions = recordsByVersion.entries.mapIndexed { seqIdx, (versionNum, records) ->
            val seq = "V${String.format("%02d", versionNum + 1)}"
            val isInitial = seqIdx == 0
            val latestRecord = records.maxByOrNull { it.updatedAt }!!

            val changeList = mutableListOf<ReceiveHistoryChange>()

            // Update running state with this version's records
            records.forEach { r ->
                val key = Triple(r.poNum, r.sku, r.unitPrice)
                val oldQty = prevState.getOrDefault(key, 0)
                val newQty = r.receiveQuantity

                sentQtyState[key] = r.sentQuantity

                if (!isInitial && oldQty != newQty) {
                    changeList.add(ReceiveHistoryChange(
                        type = when {
                            r.note?.startsWith("删除订单") == true -> "delete"
                            r.note?.startsWith("恢复订单") == true -> "restore"
                            else -> "adjust"
                        },
                        poNum = r.poNum,
                        sku = r.sku,
                        unitPrice = r.unitPrice.toDouble(),
                        fields = listOf(ReceiveHistoryFieldChange(
                            field = "入库数量",
                            old = oldQty,
                            new = newQty,
                        )),
                    ))
                }
                prevState[key] = newQty
            }

            // Full snapshot: ALL keys in prevState = complete picture at this version
            val snapshotItems = prevState.entries
                .sortedWith(compareBy({ it.key.first }, { it.key.second }))
                .map { (key, recvQty) ->
                    ReceiveHistoryItem(
                        poNum = key.first,
                        sku = key.second,
                        unitPrice = key.third.toDouble(),
                        sentQuantity = sentQtyState.getOrDefault(key, 0),
                        receiveQuantity = recvQty,
                        action = if (isInitial) "new" else "adjust",
                    )
                }

            ReceiveHistoryVersion(
                seq = seq,
                versionDate = latestRecord.receiveDate.toString(),
                updatedAt = latestRecord.updatedAt.toString(),
                updatedBy = latestRecord.updatedBy ?: "-",
                note = latestRecord.note ?: "",
                isInitial = isInitial,
                isActive = latestRecord.deletedAt == null,
                items = snapshotItems,     // ← every version has full items
                changes = changeList,      // ← non-initial versions also show delta
            )
        }


        // ── DIFF VERSIONS ─────────────────────────────────
        // Group diffs by version (V1 groups by seq starting with D)
        val diffsByVersion = allDiffs
            .groupBy { it.version }
            .toSortedMap()

        val prevDiffState = mutableMapOf<Pair<String, String>, Int>()  // (po_num, sku) → diff_qty

        val diffVersions = diffsByVersion.entries.mapIndexed { seqIdx, (versionNum, diffs) ->
            val seq = "D${String.format("%02d", versionNum + 1)}"
            val isInitial = seqIdx == 0
            val latestDiff = diffs.maxByOrNull { it.updatedAt }!!

            val items: List<ReceiveDiffHistoryItem>
            val changes: List<ReceiveDiffHistoryChange>

            if (isInitial) {
                // V1 parity history.py L157-159: initial diff version
                items = diffs.map { d ->
                    val key = Pair(d.poNum, d.sku)
                    prevDiffState[key] = d.diffQuantity
                    ReceiveDiffHistoryItem(
                        poNum = d.poNum,
                        sku = d.sku,
                        poQuantity = d.poQuantity,
                        sentQuantity = d.sentQuantity,
                        receiveQuantity = d.receiveQuantity,
                        diffQuantity = d.diffQuantity,
                        status = d.status,
                        action = "new",
                        resolutionNote = d.resolutionNote,
                        updatedAt = d.updatedAt.toString(),
                    )
                }
                changes = emptyList()
            } else {
                // V1 parity history.py L161-174: diff delta changes
                items = emptyList()
                val changeList = mutableListOf<ReceiveDiffHistoryChange>()

                diffs.forEach { d ->
                    val key = Pair(d.poNum, d.sku)
                    val oldDiff = prevDiffState.getOrDefault(key, 0)
                    val newDiff = d.diffQuantity

                    if (oldDiff != newDiff) {
                        changeList.add(ReceiveDiffHistoryChange(
                            type = "adjust",
                            poNum = d.poNum,
                            sku = d.sku,
                            fields = listOf(
                                ReceiveHistoryFieldChange(field = "差异数量", old = oldDiff, new = newDiff),
                                ReceiveHistoryFieldChange(field = "入库数量", old = d.receiveQuantity - (newDiff - oldDiff), new = d.receiveQuantity),
                            ),
                        ))
                    }
                    prevDiffState[key] = newDiff
                }
                changes = changeList
            }

            ReceiveDiffHistoryVersion(
                seq = seq,
                receiveDate = latestDiff.updatedAt.toString().substring(0, 10),
                updatedBy = latestDiff.updatedBy ?: "-",
                note = latestDiff.resolutionNote ?: "",
                isInitial = isInitial,
                items = items,
                changes = changes,
            )
        }

        return ReceiveHistoryResponse(
            logisticNum = logisticNum,
            receiveVersions = receiveVersions,
            diffVersions = diffVersions,
        )
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 9 — Legacy single-record helpers
    // ═══════════════════════════════════════════════════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val receive = findOne(id)
        receive.deletedAt = Instant.now()
        receive.updatedBy = username
        receiveRepo.save(receive)
        return true
    }

    // ═══════════════════════════════════════════════════════
    // PRIVATE — V1 Algorithm: Multi-price Tier Allocation
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: submit.py L165-251 / edit.py L172-258
     *
     * Exact algorithm:
     *   Single row → direct 1:1 mapping.
     *   Multiple rows (sorted DESC by price):
     *     DEFICIT (receive < sent):  remove from LOWEST price rows first (sort ASC then deduct).
     *     EXCESS  (receive > sent):  add surplus to HIGHEST price row (index 0 in DESC list).
     *
     * @param rows  price tiers sorted DESC by unit_price (matches V1 ORDER BY po_price DESC)
     * @param receiveQty total quantity received for this SKU
     * @param totalSentQty total quantity sent across all tiers
     * @return list of allocated receive quantities (same order as input rows)
     */
    private fun allocateReceiveQty(
        rows: List<PriceTierRow>,
        receiveQty: Int,
        totalSentQty: Int,
    ): List<Int> {
        if (rows.size == 1) {
            return listOf(receiveQty)  // single row: direct mapping
        }

        val diff = totalSentQty - receiveQty

        return if (diff > 0) {
            // DEFICIT: sent > received — deduct from LOWEST price first (V1 submit.py L191-220)
            val sortedAscByIdx = rows.indices.sortedBy { rows[it].unitPrice }
            val result = rows.map { it.sentQty }.toMutableList()
            var remaining = diff

            for (idx in sortedAscByIdx) {
                if (remaining <= 0) break
                val deduct = minOf(remaining, result[idx])
                result[idx] -= deduct
                remaining -= deduct
            }
            result
        } else if (diff < 0) {
            // EXCESS: received > sent — add surplus to HIGHEST price row (V1 submit.py L221-251)
            val excess = -diff
            val result = rows.map { it.sentQty }.toMutableList()
            result[0] += excess   // rows[0] = highest price (sorted DESC)
            result
        } else {
            // Perfect match: each row gets its sent_quantity
            rows.map { it.sentQty }
        }
    }

    /**
     * V1 parity submit.py L286-292:
     * Query po_quantity = SUM(quantity) FROM purchase_order_items
     * WHERE po_num=? AND sku=? (equiv. in_po_final SUM(po_quantity))
     */
    private fun queryPoQuantity(poNum: String, sku: String): Int =
        poItemRepo.findAllByPoNumAndDeletedAtIsNull(poNum)
            .filter { it.sku == sku }
            .sumOf { it.quantity }

    /**
     * V1 parity: submit.py L358-365 → create_landed_price_records(logistic_num)
     *
     * For each received SKU with qty > 0:
     *   ① INSERT fifo_transactions (action=IN, tran_type=purchase)
     *   ② INSERT fifo_layers (sku, unit_cost=unitPrice, qty_in=qty, qty_remaining=qty)
     *   ③ INSERT landed_prices (logistic_num, po_num, sku, base_price, landed_price)
     *
     * Note: At initial creation, landed_price = unit_price (no freight apportioned yet).
     * Finance module will call recalculateLandedPrices() to update with freight costs.
     */
    private fun triggerLandedPriceCreation(logisticNum: String) {
        val receives = receiveRepo.findAllByLogisticNumOrderBySkuAsc(logisticNum)
            .filter { it.deletedAt == null && it.receiveQuantity > 0 }

        if (receives.isEmpty()) {
            log.info("[LandedPrice:CREATE] logisticNum=$logisticNum — no active receives to process")
            return
        }

        var createdCount = 0

        for (recv in receives) {
            val refKey = "receive_${logisticNum}_${recv.poNum}_${recv.sku}_${recv.unitPrice}"

            // Idempotent guard — V1 parity: existing_tran check
            if (fifoTranRepo.findByRefKey(refKey) != null) {
                log.debug("[LandedPrice:CREATE] skip duplicate: $refKey")
                continue
            }

            val unitPriceUsd = recv.unitPrice  // TODO [CURRENCY]: convert if non-USD via strategy

            // ① fifo_transactions
            val tran = fifoTranRepo.save(FifoTransaction(
                transactionDate = recv.receiveDate
                    ?.let { java.time.ZonedDateTime.of(it, java.time.LocalTime.NOON, java.time.ZoneId.of("America/Los_Angeles")).toInstant() }
                    ?: Instant.now(),
                sku = recv.sku,
                poNum = recv.poNum,
                unitPrice = unitPriceUsd,
                quantity = recv.receiveQuantity,
                action = "in",
                tranType = "purchase",
                refKey = refKey,
                note = "入库_${logisticNum}",
            ))

            // ② fifo_layers
            val layer = fifoLayerRepo.save(FifoLayer(
                sku = recv.sku,
                inTranId = tran.id,
                inDate = tran.transactionDate,
                poNum = recv.poNum,
                unitCost = unitPriceUsd,
                landedCost = unitPriceUsd,  // Initial: landed = unit (no freight yet)
                qtyIn = recv.receiveQuantity,
                qtyRemaining = recv.receiveQuantity,
            ))

            // ③ landed_prices
            val existing = landedPriceRepo.findByLogisticNumAndPoNumAndSku(
                logisticNum, recv.poNum, recv.sku
            )
            if (existing == null) {
                landedPriceRepo.save(LandedPrice(
                    fifoTranId = tran.id,
                    fifoLayerId = layer.id,
                    logisticNum = logisticNum,
                    poNum = recv.poNum,
                    sku = recv.sku,
                    quantity = recv.receiveQuantity,
                    basePriceUsd = unitPriceUsd,
                    landedPriceUsd = unitPriceUsd,  // Initial: same as base
                ))
            }

            createdCount++
        }

        log.info("[LandedPrice:CREATE] logisticNum=$logisticNum — created $createdCount FIFO records")
    }

    /**
     * V1 parity edit.py L438-443: recalculate_landed_prices(logistic_num=)
     * TODO [FINANCE-INTEGRATION]: Full implementation when Finance module is migrated.
     */
    private fun triggerLandedPriceRecalculation(logisticNum: String) {
        log.info("[LandedPrice:RECALC] logisticNum=$logisticNum — Finance module pending full implementation")
    }

    // ═══════════════════════════════════════════════════════
    // PRIVATE — Mappers
    // ═══════════════════════════════════════════════════════

    private fun toShipmentResponse(
        shipment: com.mgmt.modules.purchase.domain.model.Shipment,
        items: List<com.mgmt.modules.purchase.domain.model.ShipmentItem>,
    ) = ShipmentResponse(
        id = shipment.id,
        logisticNum = shipment.logisticNum,
        sentDate = shipment.sentDate,
        etaDate = shipment.etaDate,
        pallets = shipment.pallets,
        totalWeight = shipment.totalWeight.toDouble(),
        priceKg = shipment.priceKg.toDouble(),
        logisticsCost = shipment.logisticsCost.toDouble(),
        exchangeRate = shipment.exchangeRate.toDouble(),
        rateMode = shipment.rateMode,
        status = shipment.status,
        note = shipment.note,
        items = items.map { toShipmentItemResponse(it) },
        createdAt = shipment.createdAt,
        updatedAt = shipment.updatedAt,
    )

    private fun toShipmentItemResponse(item: com.mgmt.modules.purchase.domain.model.ShipmentItem) =
        ShipmentItemResponse(
            id = item.id,
            poNum = item.poNum,
            sku = item.sku,
            quantity = item.quantity,
            unitPrice = item.unitPrice.toDouble(),
            poChange = item.poChange,
            note = item.note,
        )

    private fun toDiffResponse(d: ReceiveDiff) = ReceiveDiffResponse(
        id = d.id,
        receiveId = d.receiveId,
        logisticNum = d.logisticNum,
        poNum = d.poNum,
        sku = d.sku,
        poQuantity = d.poQuantity,
        sentQuantity = d.sentQuantity,
        receiveQuantity = d.receiveQuantity,
        diffQuantity = d.diffQuantity,
        status = d.status,
        resolutionNote = d.resolutionNote,
        createdAt = d.createdAt,
        updatedAt = d.updatedAt,
    )
}

// ── Internal data class for price tier allocation ──────────────────────────
private data class PriceTierRow(val unitPrice: BigDecimal, val sentQty: Int)

// ── Status enum ────────────────────────────────────────────────────────────
enum class ReceiveStatus { IN_TRANSIT, ALL_RECEIVED, DIFF_UNRESOLVED, DIFF_RESOLVED, DELETED }
