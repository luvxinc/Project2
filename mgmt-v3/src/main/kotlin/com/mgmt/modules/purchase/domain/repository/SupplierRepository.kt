package com.mgmt.modules.purchase.domain.repository

import com.mgmt.modules.purchase.domain.model.Supplier
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface SupplierRepository : JpaRepository<Supplier, Long>, JpaSpecificationExecutor<Supplier> {

    fun findBySupplierCodeAndDeletedAtIsNull(supplierCode: String): Supplier?

    fun findByIdAndDeletedAtIsNull(id: Long): Supplier?

    fun findAllByDeletedAtIsNullOrderBySupplierCodeAsc(): List<Supplier>

    fun findAllByStatusAndDeletedAtIsNull(status: Boolean): List<Supplier>

    fun existsBySupplierCodeAndDeletedAtIsNull(supplierCode: String): Boolean

    fun countByDeletedAtIsNull(): Long
}
