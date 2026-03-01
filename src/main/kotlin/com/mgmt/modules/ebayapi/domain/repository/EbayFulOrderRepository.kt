package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFulOrder
import org.springframework.data.jpa.repository.JpaRepository

interface EbayFulOrderRepository : JpaRepository<EbayFulOrder, Long> {
    fun findByOrderId(orderId: String): EbayFulOrder?
    fun existsByOrderId(orderId: String): Boolean
    fun findAllBySellerUsername(sellerUsername: String): List<EbayFulOrder>
    fun findAllByOrderIdIn(orderIds: List<String>): List<EbayFulOrder>
}
