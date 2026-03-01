package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFinTransaction
import org.springframework.data.jpa.repository.JpaRepository

interface EbayFinTransactionRepository : JpaRepository<EbayFinTransaction, Long> {
    fun findByTransactionId(transactionId: String): EbayFinTransaction?
    fun existsByTransactionId(transactionId: String): Boolean
    fun findAllByOrderId(orderId: String): List<EbayFinTransaction>
    fun findAllBySellerUsername(sellerUsername: String): List<EbayFinTransaction>
    fun findAllByOrderIdIn(orderIds: List<String>): List<EbayFinTransaction>
}
