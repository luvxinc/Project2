package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFulOrder
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface EbayFulOrderRepository : JpaRepository<EbayFulOrder, Long> {
    fun findByOrderId(orderId: String): EbayFulOrder?
    fun existsByOrderId(orderId: String): Boolean
    fun findAllBySellerUsername(sellerUsername: String): List<EbayFulOrder>
    fun findAllByOrderIdIn(orderIds: List<String>): List<EbayFulOrder>

    @Query("""
        SELECT o FROM EbayFulOrder o
        WHERE (:seller = 'all' OR o.sellerUsername = :seller)
          AND (:status = 'all' OR o.orderFulfillmentStatus = :status)
        ORDER BY o.creationDate DESC
    """)
    fun findFiltered(seller: String, status: String, pageable: Pageable): Page<EbayFulOrder>

    @Query("""
        SELECT DISTINCT o FROM EbayFulOrder o LEFT JOIN o.items i
        WHERE (:seller = 'all' OR o.sellerUsername = :seller)
          AND (:status = 'all' OR o.orderFulfillmentStatus = :status)
          AND o.creationDate >= :dateFrom
          AND o.creationDate <= :dateTo
          AND (:search = ''
               OR LOWER(o.orderId) LIKE CONCAT('%', :search, '%')
               OR LOWER(o.buyerUsername) LIKE CONCAT('%', :search, '%')
               OR LOWER(o.buyerFullName) LIKE CONCAT('%', :search, '%')
               OR LOWER(i.sku) LIKE CONCAT('%', :search, '%'))
        ORDER BY o.creationDate DESC
    """)
    fun findFilteredAdvanced(
        seller: String,
        status: String,
        dateFrom: java.time.Instant,
        dateTo: java.time.Instant,
        search: String,
        pageable: Pageable,
    ): Page<EbayFulOrder>
}
