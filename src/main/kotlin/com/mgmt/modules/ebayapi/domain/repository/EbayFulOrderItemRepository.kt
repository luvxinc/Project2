package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFulOrderItem
import org.springframework.data.jpa.repository.JpaRepository

interface EbayFulOrderItemRepository : JpaRepository<EbayFulOrderItem, Long> {
    fun findAllByOrderId(orderId: String): List<EbayFulOrderItem>
    fun findByOrderIdAndLineItemId(orderId: String, lineItemId: String): EbayFulOrderItem?
}
