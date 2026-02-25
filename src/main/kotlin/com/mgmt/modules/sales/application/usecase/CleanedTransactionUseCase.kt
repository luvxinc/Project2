package com.mgmt.modules.sales.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import com.mgmt.modules.sales.domain.repository.CleanedTransactionRepository
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.ZoneId

/**
 * CleanedTransactionUseCase — 读取清洗后的交易数据 + 仪表板统计。
 *
 * V1 对应:
 *   - ETLRepository.get_transactions_by_date() → SELECT * FROM Data_Clean_Log WHERE order_date BETWEEN
 *   - views.py _get_data_cutoff_date() → SELECT MAX(order_date)
 *   - views.py _get_db_stats_before() → count/min_date/max_date
 *   - views.py tab_transaction → 显示各 action 类型的统计
 */
@Service
class CleanedTransactionUseCase(
    private val cleanedRepo: CleanedTransactionRepository,
    private val rawRepo: RawTransactionRepository,
) {

    @Transactional(readOnly = true)
    fun findAll(params: CleanedTransactionQueryParams): Pair<List<CleanedTransaction>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 200))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by(Sort.Direction.DESC, "orderDate"))
        val result = cleanedRepo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): CleanedTransaction =
        cleanedRepo.findById(id).orElseThrow {
            NotFoundException("sales.errors.cleanedTransactionNotFound")
        }

    @Transactional(readOnly = true)
    fun findByOrderNumber(orderNumber: String): List<CleanedTransaction> =
        cleanedRepo.findAllByOrderNumberOrderByOrderDateDesc(orderNumber)

    /**
     * Dashboard 统计 — V1 views.py _get_db_stats_before + _get_data_cutoff_date
     *
     * V1 返回: count, min_date, max_date, action breakdown
     */
    @Transactional(readOnly = true)
    fun getStats(): SalesStatsResponse {
        val actionCounts = SalesAction.entries.associate { action ->
            action.name to cleanedRepo.countByAction(action)
        }
        return SalesStatsResponse(
            rawCount = rawRepo.count(),
            cleanedCount = cleanedRepo.count(),
            minDate = cleanedRepo.findMinOrderDate(),
            maxDate = cleanedRepo.findMaxOrderDate(),
            actionCounts = actionCounts,
        )
    }

    private fun buildSpec(params: CleanedTransactionQueryParams): Specification<CleanedTransaction> {
        @Suppress("DEPRECATION")
        var spec = Specification.where<CleanedTransaction>(null)

        params.seller?.let { s ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("seller"), s) }
        }
        params.orderNumber?.let { o ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("orderNumber"), o) }
        }
        params.action?.let { a ->
            val action = try { SalesAction.valueOf(a.uppercase()) } catch (_: Exception) { null }
            action?.let { act ->
                spec = spec.and { root, _, cb -> cb.equal(root.get<SalesAction>("action"), act) }
            }
        }
        // V1: date range filter (R1 铁律: America/Los_Angeles)
        params.dateFrom?.let { d ->
            val from = LocalDate.parse(d).atStartOfDay(ZoneId.of("America/Los_Angeles")).toInstant()
            spec = spec.and { root, _, cb -> cb.greaterThanOrEqualTo(root.get("orderDate"), from) }
        }
        params.dateTo?.let { d ->
            val to = LocalDate.parse(d).plusDays(1).atStartOfDay(ZoneId.of("America/Los_Angeles")).toInstant()
            spec = spec.and { root, _, cb -> cb.lessThan(root.get("orderDate"), to) }
        }

        return spec
    }
}
