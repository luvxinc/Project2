package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbaySyncBatch
import org.springframework.data.jpa.repository.JpaRepository

interface EbaySyncBatchRepository : JpaRepository<EbaySyncBatch, Long> {
    fun findByBatchId(batchId: String): EbaySyncBatch?
}
