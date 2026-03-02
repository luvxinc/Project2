package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayMessage
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface EbayMessageRepository : JpaRepository<EbayMessage, Long> {
    fun findByMessageId(messageId: String): EbayMessage?
    fun findAllBySellerUsernameOrderByReceivedAtDesc(sellerUsername: String): List<EbayMessage>
    fun findByParentMessageId(parentId: String): List<EbayMessage>

    @Query("SELECT e FROM EbayMessage e WHERE (:seller = 'all' OR e.sellerUsername = :seller) ORDER BY e.receivedAt DESC")
    fun findFiltered(seller: String, pageable: Pageable): Page<EbayMessage>

    @Query("""
        SELECT AVG(e.responseTimeSeconds), MAX(e.responseTimeSeconds), COUNT(e)
        FROM EbayMessage e
        WHERE e.sender = 'SELLER' AND e.responseTimeSeconds IS NOT NULL
          AND (:seller = 'all' OR e.sellerUsername = :seller)
    """)
    fun getResponseTimeStats(seller: String): Array<Any?>
}
