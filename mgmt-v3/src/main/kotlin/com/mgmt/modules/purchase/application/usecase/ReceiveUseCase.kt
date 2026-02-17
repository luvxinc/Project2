package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Receive
import com.mgmt.modules.purchase.domain.model.ReceiveDiff
import com.mgmt.modules.purchase.domain.repository.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * ReceiveUseCase — inbound receiving + discrepancy management.
 *
 * V1 parity: receive_submit, receive_list, receive_detail, receive_edit,
 *            receive_delete, abnormal_list, abnormal_process.
 */
@Service
class ReceiveUseCase(
    private val receiveRepo: ReceiveRepository,
    private val receiveDiffRepo: ReceiveDiffRepository,
    private val shipmentRepo: ShipmentRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(): List<Receive> =
        receiveRepo.findAllByDeletedAtIsNullOrderByReceiveDateDesc()

    @Transactional(readOnly = true)
    fun findOne(id: Long): Receive =
        receiveRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.receiveNotFound")

    @Transactional(readOnly = true)
    fun findByShipment(shipmentId: Long): List<Receive> =
        receiveRepo.findAllByShipmentIdAndDeletedAtIsNull(shipmentId)

    @Transactional(readOnly = true)
    fun getPendingDiffs(): List<ReceiveDiff> =
        receiveDiffRepo.findAllByStatus("pending")

    @Transactional(readOnly = true)
    fun getDiffsByReceive(receiveId: Long): List<ReceiveDiff> =
        receiveDiffRepo.findAllByReceiveId(receiveId)

    // ═══════════ Submit Receive ═══════════

    /**
     * Submit receiving for a shipment.
     * Auto-detects discrepancies (sent ≠ received) and creates diff records.
     */
    @Transactional
    fun submitReceive(dto: SubmitReceiveRequest, username: String): List<Receive> {
        val shipment = shipmentRepo.findByLogisticNumAndDeletedAtIsNull(dto.logisticNum)
            ?: throw NotFoundException("purchase.errors.shipmentNotFound")

        val shipmentItems = shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipment.id)

        val receives = mutableListOf<Receive>()

        dto.items.forEach { input ->
            // Find matching shipment item
            val matchItem = shipmentItems.find {
                it.sku == input.sku.trim().uppercase() &&
                it.unitPrice.compareTo(input.unitPrice) == 0
            } ?: throw NotFoundException("purchase.errors.shipmentItemNotFound: ${input.sku}")

            val receive = Receive(
                shipmentId = shipment.id,
                logisticNum = shipment.logisticNum,
                poId = matchItem.poId,
                poNum = matchItem.poNum,
                sku = matchItem.sku,
                unitPrice = matchItem.unitPrice,
                sentQuantity = matchItem.quantity,
                receiveQuantity = input.receiveQuantity,
                receiveDate = input.receiveDate,
                etaDate = shipment.etaDate,
                note = input.note,
                createdBy = username,
                updatedBy = username,
            )
            val savedReceive = receiveRepo.save(receive)
            receives.add(savedReceive)

            // Auto-create diff if discrepancy
            val diff = matchItem.quantity - input.receiveQuantity
            if (diff != 0) {
                val receiveDiff = ReceiveDiff(
                    receiveId = savedReceive.id,
                    logisticNum = shipment.logisticNum,
                    poNum = matchItem.poNum,
                    sku = matchItem.sku,
                    poQuantity = matchItem.quantity,  // from shipment_items for now
                    sentQuantity = matchItem.quantity,
                    receiveQuantity = input.receiveQuantity,
                    diffQuantity = diff,
                    createdBy = username,
                    updatedBy = username,
                )
                receiveDiffRepo.save(receiveDiff)
            }
        }

        // Update shipment status to delivered
        shipment.status = "delivered"
        shipment.updatedAt = Instant.now()
        shipment.updatedBy = username
        shipmentRepo.save(shipment)

        return receives
    }

    // ═══════════ Diff Resolution ═══════════

    @Transactional
    fun resolveDiff(diffId: Long, dto: ResolveReceiveDiffRequest, username: String): ReceiveDiff {
        val diff = receiveDiffRepo.findById(diffId).orElseThrow {
            NotFoundException("purchase.errors.diffNotFound")
        }
        diff.status = "resolved"
        diff.resolutionNote = dto.resolutionNote
        diff.updatedAt = Instant.now()
        diff.updatedBy = username
        return receiveDiffRepo.save(diff)
    }

    // ═══════════ Delete ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val receive = findOne(id)
        receive.deletedAt = Instant.now()
        receive.updatedBy = username
        receiveRepo.save(receive)
        return true
    }
}
