package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFinTransactionFee
import org.springframework.data.jpa.repository.JpaRepository

interface EbayFinTransactionFeeRepository : JpaRepository<EbayFinTransactionFee, Long> {
    fun findAllByTransactionId(transactionId: String): List<EbayFinTransactionFee>
    fun deleteAllByTransactionId(transactionId: String)
}
