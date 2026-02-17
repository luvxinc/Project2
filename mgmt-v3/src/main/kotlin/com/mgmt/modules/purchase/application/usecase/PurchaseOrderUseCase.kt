package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderItemRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderRepository
import com.mgmt.modules.purchase.domain.repository.PurchaseOrderStrategyRepository
import com.mgmt.modules.purchase.domain.repository.SupplierRepository
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * PurchaseOrderUseCase — PO lifecycle management.
 *
 * V1 parity: po_submit, po_list, po_detail, po_modify, po_delete/undelete.
 * V3: auto-generates po_num from supplier_code + date + sequence.
 */
@Service
class PurchaseOrderUseCase(
    private val poRepo: PurchaseOrderRepository,
    private val itemRepo: PurchaseOrderItemRepository,
    private val strategyRepo: PurchaseOrderStrategyRepository,
    private val supplierRepo: SupplierRepository,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(params: PurchaseOrderQueryParams): Pair<List<PurchaseOrder>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("poDate").descending())
        val result = poRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): PurchaseOrder =
        poRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.poNotFound")

    @Transactional(readOnly = true)
    fun findByPoNum(poNum: String): PurchaseOrder =
        poRepo.findByPoNumAndDeletedAtIsNull(poNum)
            ?: throw NotFoundException("purchase.errors.poNotFound")

    @Transactional(readOnly = true)
    fun getItems(poId: Long): List<PurchaseOrderItem> =
        itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(poId)

    @Transactional(readOnly = true)
    fun getStrategy(poId: Long): PurchaseOrderStrategy? =
        strategyRepo.findByPoId(poId)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreatePurchaseOrderRequest, username: String): PurchaseOrder {
        // Resolve supplier
        val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(dto.supplierCode.uppercase())
            ?: throw NotFoundException("purchase.errors.supplierNotFound")

        // Generate PO number: XX20260103-S01
        val poNum = generatePoNum(dto.supplierCode.uppercase(), dto.poDate)

        // Create PO header
        val po = PurchaseOrder(
            poNum = poNum,
            supplierId = supplier.id,
            supplierCode = supplier.supplierCode,
            poDate = dto.poDate,
            createdBy = username,
            updatedBy = username,
        )
        val savedPo = poRepo.save(po)

        // Create items
        dto.items.forEach { itemDto ->
            val item = PurchaseOrderItem(
                poId = savedPo.id,
                poNum = poNum,
                sku = itemDto.sku.trim().uppercase(),
                quantity = itemDto.quantity,
                unitPrice = itemDto.unitPrice,
                currency = itemDto.currency,
                exchangeRate = itemDto.exchangeRate,
                note = itemDto.note,
                createdBy = username,
                updatedBy = username,
            )
            itemRepo.save(item)
        }

        // Create strategy snapshot
        val strat = dto.strategy
        val strategy = PurchaseOrderStrategy(
            poId = savedPo.id,
            poNum = poNum,
            strategyDate = strat.strategyDate,
            currency = strat.currency,
            exchangeRate = strat.exchangeRate,
            rateMode = strat.rateMode,
            floatEnabled = strat.floatEnabled,
            floatThreshold = strat.floatThreshold,
            requireDeposit = strat.requireDeposit,
            depositRatio = strat.depositRatio,
            note = strat.note,
            createdBy = username,
            updatedBy = username,
        )
        strategyRepo.save(strategy)

        return savedPo
    }

    // ═══════════ Update ═══════════

    @Transactional
    fun update(id: Long, dto: UpdatePurchaseOrderRequest, username: String): PurchaseOrder {
        val po = findOne(id)
        dto.status?.let { po.status = it }
        po.updatedAt = Instant.now()
        po.updatedBy = username

        // If items provided, replace all items
        dto.items?.let { newItems ->
            // Soft-delete old items
            val oldItems = itemRepo.findAllByPoIdAndDeletedAtIsNullOrderBySkuAsc(id)
            oldItems.forEach {
                it.deletedAt = Instant.now()
                it.updatedBy = username
                itemRepo.save(it)
            }

            // Create new items
            newItems.forEach { itemDto ->
                val item = PurchaseOrderItem(
                    poId = po.id,
                    poNum = po.poNum,
                    sku = itemDto.sku.trim().uppercase(),
                    quantity = itemDto.quantity,
                    unitPrice = itemDto.unitPrice,
                    currency = itemDto.currency,
                    exchangeRate = itemDto.exchangeRate,
                    note = itemDto.note,
                    createdBy = username,
                    updatedBy = username,
                )
                itemRepo.save(item)
            }
        }

        return poRepo.save(po)
    }

    // ═══════════ Delete / Restore ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val po = findOne(id)
        po.deletedAt = Instant.now()
        po.status = "cancelled"
        po.updatedBy = username
        poRepo.save(po)
        return true
    }

    @Transactional
    fun restore(id: Long, username: String): PurchaseOrder {
        val po = poRepo.findById(id).orElseThrow { NotFoundException("purchase.errors.poNotFound") }
        po.deletedAt = null
        po.status = "active"
        po.updatedAt = Instant.now()
        po.updatedBy = username
        return poRepo.save(po)
    }

    // ═══════════ Helpers ═══════════

    /** V1 pattern: XX20260103-S01 (supplier_code + date + seq) */
    private fun generatePoNum(supplierCode: String, poDate: LocalDate): String {
        val dateStr = poDate.format(DateTimeFormatter.BASIC_ISO_DATE)  // 20260103
        val prefix = "${supplierCode}${dateStr}-S"
        // Find existing POs with same prefix to determine sequence
        val existingPos = poRepo.findAllByDeletedAtIsNullOrderByPoDateDesc()
            .filter { it.poNum.startsWith(prefix) }
        val seq = existingPos.size + 1
        return "$prefix${String.format("%02d", seq)}"
    }

    private fun buildSpec(params: PurchaseOrderQueryParams): Specification<PurchaseOrder> {
        @Suppress("DEPRECATION")
        return Specification.where<PurchaseOrder> { root, _, cb ->
            cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (params.search != null) {
                spec.and { root, _, cb ->
                    val pattern = "%${params.search.lowercase()}%"
                    cb.or(
                        cb.like(cb.lower(root.get("poNum")), pattern),
                        cb.like(cb.lower(root.get("supplierCode")), pattern),
                    )
                }
            } else spec
        }.let { spec ->
            if (params.supplierCode != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("supplierCode"), params.supplierCode.uppercase()) }
            } else spec
        }.let { spec ->
            if (params.status != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("status"), params.status) }
            } else spec
        }.let { spec ->
            if (params.dateFrom != null) {
                spec.and { root, _, cb -> cb.greaterThanOrEqualTo(root.get("poDate"), params.dateFrom) }
            } else spec
        }.let { spec ->
            if (params.dateTo != null) {
                spec.and { root, _, cb -> cb.lessThanOrEqualTo(root.get("poDate"), params.dateTo) }
            } else spec
        }
    }
}
