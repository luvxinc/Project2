package com.mgmt.modules.purchase.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.purchase.application.dto.*
import com.mgmt.modules.purchase.domain.model.Payment
import com.mgmt.modules.purchase.domain.repository.*
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * PaymentUseCase — unified payment management.
 *
 * V1 parity: 4 payment types (PO / deposit / logistic / prepay)
 * V3: unified into single table with type discriminator.
 */
@Service
class PaymentUseCase(
    private val paymentRepo: PaymentRepository,
    private val poRepo: PurchaseOrderRepository,
    private val shipmentRepo: ShipmentRepository,
    private val supplierRepo: SupplierRepository,
) {

    // ═══════════ Query ═══════════

    @Transactional(readOnly = true)
    fun findAll(params: PaymentQueryParams): Pair<List<Payment>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("paymentDate").descending())
        val result = paymentRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): Payment =
        paymentRepo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("purchase.errors.paymentNotFound")

    @Transactional(readOnly = true)
    fun findByType(paymentType: String): List<Payment> =
        paymentRepo.findAllByPaymentTypeAndDeletedAtIsNullOrderByPaymentDateDesc(paymentType)

    // ═══════════ Create ═══════════

    @Transactional
    fun create(dto: CreatePaymentRequest, username: String): Payment {
        // Resolve FK references: prefer direct IDs, fallback to code-based lookup
        val resolvedPoId = dto.poId ?: dto.poNum?.let { poNum ->
            val po = poRepo.findByPoNumAndDeletedAtIsNull(poNum)
                ?: throw NotFoundException("purchase.errors.poNotFound: $poNum")
            po.id
        }

        val resolvedShipmentId = dto.shipmentId ?: dto.logisticNum?.let { logNum ->
            val shipment = shipmentRepo.findByLogisticNumAndDeletedAtIsNull(logNum)
                ?: throw NotFoundException("purchase.errors.shipmentNotFound: $logNum")
            shipment.id
        }

        val resolvedSupplierId = dto.supplierId ?: dto.supplierCode?.let { code ->
            val supplier = supplierRepo.findBySupplierCodeAndDeletedAtIsNull(code.uppercase())
                ?: throw NotFoundException("purchase.errors.supplierNotFound: $code")
            supplier.id
        }

        val payment = Payment(
            paymentType = dto.paymentType,
            paymentNo = dto.paymentNo.trim(),
            poId = resolvedPoId,
            poNum = dto.poNum,
            shipmentId = resolvedShipmentId,
            logisticNum = dto.logisticNum,
            supplierId = resolvedSupplierId,
            supplierCode = dto.supplierCode,
            paymentDate = dto.paymentDate,
            currency = dto.currency,
            cashAmount = dto.cashAmount,
            prepayAmount = dto.prepayAmount,
            exchangeRate = dto.exchangeRate,
            rateMode = dto.rateMode,
            extraAmount = dto.extraAmount,
            extraCurrency = dto.extraCurrency,
            extraNote = dto.extraNote,
            prepayTranType = dto.prepayTranType,
            depositOverride = dto.depositOverride,
            note = dto.note,
            createdBy = username,
            updatedBy = username,
        )
        return paymentRepo.save(payment)
    }

    // ═══════════ Delete ═══════════

    @Transactional
    fun softDelete(id: Long, username: String): Boolean {
        val payment = findOne(id)
        payment.deletedAt = Instant.now()
        payment.updatedBy = username
        paymentRepo.save(payment)
        return true
    }

    // ═══════════ Helpers ═══════════

    private fun buildSpec(params: PaymentQueryParams): Specification<Payment> {
        @Suppress("DEPRECATION")
        return Specification.where<Payment> { root, _, cb ->
            cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (params.paymentType != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("paymentType"), params.paymentType) }
            } else spec
        }.let { spec ->
            if (params.poId != null) {
                spec.and { root, _, cb -> cb.equal(root.get<Long>("poId"), params.poId) }
            } else spec
        }.let { spec ->
            if (params.poNum != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("poNum"), params.poNum) }
            } else spec
        }.let { spec ->
            if (params.supplierCode != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("supplierCode"), params.supplierCode.uppercase()) }
            } else spec
        }
    }
}
