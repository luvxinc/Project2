package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository
import java.time.Instant

/**
 * V1 对应: ETLRepository.get_transactions_by_date()
 *   → SELECT * FROM Data_Clean_Log WHERE `order date` BETWEEN :start AND :end
 *
 * V1 查询模式:
 *   - 按日期范围查 (报表生成器)
 *   - 按 action 统计 (dashboard stats — _get_db_stats_before)
 *   - 按 order_number 查关联
 *   - 按 row_hash 去重 (transformer.py 四维去重)
 *   - MIN/MAX order_date (dashboard — _get_data_cutoff_date)
 */
@Repository
interface CleanedTransactionRepository : JpaRepository<CleanedTransaction, Long>, JpaSpecificationExecutor<CleanedTransaction> {

    fun findByRowHash(rowHash: String): CleanedTransaction?

    fun existsByRowHash(rowHash: String): Boolean

    fun countByAction(action: SalesAction): Long

    fun findAllByOrderNumberOrderByOrderDateDesc(orderNumber: String): List<CleanedTransaction>

    /** V1: _get_data_cutoff_date() → SELECT MAX(`order date`) FROM Data_Clean_Log */
    @Query("SELECT MIN(c.orderDate) FROM CleanedTransaction c")
    fun findMinOrderDate(): Instant?

    @Query("SELECT MAX(c.orderDate) FROM CleanedTransaction c")
    fun findMaxOrderDate(): Instant?
}
