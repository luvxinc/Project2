package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.Payment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface PaymentRepository : JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {

    fun findByPaymentTypeAndPaymentNoAndDeletedAtIsNull(paymentType: String, paymentNo: String): Payment?

    fun findByIdAndDeletedAtIsNull(id: Long): Payment?

    fun findAllByPaymentTypeAndDeletedAtIsNullOrderByPaymentDateDesc(paymentType: String): List<Payment>

    fun findAllByPoIdAndDeletedAtIsNull(poId: Long): List<Payment>

    fun findAllBySupplierIdAndDeletedAtIsNull(supplierId: Long): List<Payment>

    fun findAllByShipmentIdAndDeletedAtIsNull(shipmentId: Long): List<Payment>

    fun countByDeletedAtIsNull(): Long
}
