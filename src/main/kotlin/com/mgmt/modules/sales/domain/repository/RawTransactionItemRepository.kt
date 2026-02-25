package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.RawTransactionItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

/**
 * V3: normalized 子表, 通过 transaction_id FK 关联
 */
@Repository
interface RawTransactionItemRepository : JpaRepository<RawTransactionItem, Long> {

    fun findAllByTransactionId(transactionId: Long): List<RawTransactionItem>
}
