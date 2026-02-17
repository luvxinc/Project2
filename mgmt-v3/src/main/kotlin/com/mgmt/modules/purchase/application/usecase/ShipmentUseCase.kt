package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.model.ShipmentItem
import com.mgmt.modules.purchase.domain.repository.*
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * ShipmentUseCase — logistics shipment management.
 *
 * V1 parity: send_submit, send_list, send_detail, send_modify, send_delete/undelete.
 */
@Service
class ShipmentUseCase(
    private val shipmentRepo: ShipmentRepository,
    private val shipmentItemRepo: ShipmentItemRepository,
    private val poRepo: PurchaseOrderRepository,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(params: ShipmentQueryParams): Pair<List<Shipment>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("sentDate").descending())
        val result = shipmentRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): Shipment =
        shipmentRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.shipmentNotFound")

    @Transactional(readOnly = true)
    fun getItems(shipmentId: Long): List<ShipmentItem> =
        shipmentItemRepo.findAllByShipmentIdAndDeletedAtIsNullOrderBySkuAsc(shipmentId)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreateShipmentRequest, username: String): Shipment {
        if (shipmentRepo.existsByLogisticNumAndDeletedAtIsNull(dto.logisticNum)) {
            throw ConflictException("Logistic number '${dto.logisticNum}' already exists")
        }

        val shipment = Shipment(
            logisticNum = dto.logisticNum.trim(),
            sentDate = dto.sentDate,
            etaDate = dto.etaDate,
            pallets = dto.pallets,
            logisticsCost = dto.logisticsCost,
            exchangeRate = dto.exchangeRate,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        val saved = shipmentRepo.save(shipment)

        dto.items.forEach { itemDto ->
            val po = poRepo.findByPoNumAndDeletedAtIsNull(itemDto.poNum)
                ?: throw NotFoundException("purchase.errors.poNotFound: ${itemDto.poNum}")

            val item = ShipmentItem(
                shipmentId = saved.id,
                logisticNum = saved.logisticNum,
                poId = po.id,
                poNum = po.poNum,
                sku = itemDto.sku.trim().uppercase(),
                quantity = itemDto.quantity,
                unitPrice = itemDto.unitPrice,
                poChange = itemDto.poChange,
                note = itemDto.note,
                createdBy = username,
                updatedBy = username,
            )
            shipmentItemRepo.save(item)
        }

        return saved
    }

    // ═══════════ Delete / Restore ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val shipment = findOne(id)
        shipment.deletedAt = Instant.now()
        shipment.status = "cancelled"
        shipment.updatedBy = username
        shipmentRepo.save(shipment)
        return true
    }

    @Transactional
    fun restore(id: Long, username: String): Shipment {
        val shipment = shipmentRepo.findById(id).orElseThrow { NotFoundException("purchase.errors.shipmentNotFound") }
        shipment.deletedAt = null
        shipment.status = "pending"
        shipment.updatedAt = Instant.now()
        shipment.updatedBy = username
        return shipmentRepo.save(shipment)
    }

    // ═══════════ Helpers ═══════════

    private fun buildSpec(params: ShipmentQueryParams): Specification<Shipment> {
        @Suppress("DEPRECATION")
        return Specification.where<Shipment> { root, _, cb ->
            cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (params.search != null) {
                spec.and { root, _, cb ->
                    cb.like(cb.lower(root.get("logisticNum")), "%${params.search.lowercase()}%")
                }
            } else spec
        }.let { spec ->
            if (params.status != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("status"), params.status) }
            } else spec
        }
    }
}
