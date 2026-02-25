package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.EtlBatch
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface EtlBatchRepository : JpaRepository<EtlBatch, Long> {
    fun findByBatchId(batchId: String): EtlBatch?
}
