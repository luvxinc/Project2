package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.RawTransaction
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

/**
 * V1 对应: ETLRepository.get_raw_transaction_data()
 *   → SELECT * FROM Data_Transaction
 *
 * V1 查询模式:
 *   - 按 row_hash 去重 (ingest.py)
 *   - 按 upload_batch_id 查批次
 *   - 按 order_number 查关联 (views.py tab_transaction)
 */
@Repository
interface RawTransactionRepository : JpaRepository<RawTransaction, Long>, JpaSpecificationExecutor<RawTransaction> {

    fun findByRowHash(rowHash: String): RawTransaction?

    fun existsByRowHash(rowHash: String): Boolean

    fun findAllByUploadBatchId(batchId: String): List<RawTransaction>

    fun countByUploadBatchId(batchId: String): Long

    fun findAllByOrderNumberOrderByCreatedAtDesc(orderNumber: String): List<RawTransaction>
}
