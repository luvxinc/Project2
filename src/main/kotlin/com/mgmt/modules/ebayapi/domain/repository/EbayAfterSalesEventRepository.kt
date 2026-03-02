package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayAfterSalesEvent
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface EbayAfterSalesEventRepository : JpaRepository<EbayAfterSalesEvent, Long> {
    fun findByEventTypeAndEventId(eventType: String, eventId: String): EbayAfterSalesEvent?
    fun findAllBySellerUsernameOrderByCreatedAtDesc(sellerUsername: String): List<EbayAfterSalesEvent>

    @Query("""
        SELECT e FROM EbayAfterSalesEvent e
        WHERE (:seller = 'all' OR e.sellerUsername = :seller)
          AND (:type = 'all' OR e.eventType = :type)
        ORDER BY e.createdAt DESC
    """)
    fun findFiltered(seller: String, type: String, pageable: Pageable): Page<EbayAfterSalesEvent>

    fun findByOrderIdIn(orderIds: List<String>): List<EbayAfterSalesEvent>
}
