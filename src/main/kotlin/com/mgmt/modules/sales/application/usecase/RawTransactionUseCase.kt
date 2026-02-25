package com.mgmt.modules.sales.application.usecase

import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.sales.application.dto.*
import com.mgmt.modules.sales.domain.model.RawTransaction
import com.mgmt.modules.sales.domain.repository.RawTransactionRepository
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * RawTransactionUseCase — 读取原始交易数据。
 *
 *   - views.py tab_transaction → 读 Data_Transaction, 显示统计
 *   - ETLRepository.get_raw_transaction_data() → SELECT * FROM Data_Transaction
 *
 * 注: ETL 写入操作 (Upload/Parse/Transform) 属于后续块, 本块只做读取。
 */
@Service
class RawTransactionUseCase(
    private val repo: RawTransactionRepository,
) {

    @Transactional(readOnly = true)
    fun findAll(params: RawTransactionQueryParams): Pair<List<RawTransaction>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 200))
        val spec = buildSpec(params)
        val pageable = PageRequest.of(page - 1, limit, Sort.by(Sort.Direction.DESC, "createdAt"))
        val result = repo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    @Transactional(readOnly = true)
    fun findOne(id: Long): RawTransaction =
        repo.findById(id).orElseThrow {
            NotFoundException("sales.errors.rawTransactionNotFound")
        }

    @Transactional(readOnly = true)
    fun findByOrderNumber(orderNumber: String): List<RawTransaction> =
        repo.findAllByOrderNumberOrderByCreatedAtDesc(orderNumber)

    private fun buildSpec(params: RawTransactionQueryParams): Specification<RawTransaction> {
        @Suppress("DEPRECATION")
        var spec = Specification.where<RawTransaction>(null)

        params.source?.let { s ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("source"), s) }
        }
        params.seller?.let { s ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("seller"), s) }
        }
        params.orderNumber?.let { o ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("orderNumber"), o) }
        }
        params.uploadBatchId?.let { b ->
            spec = spec.and { root, _, cb -> cb.equal(root.get<String>("uploadBatchId"), b) }
        }

        return spec
    }
}
