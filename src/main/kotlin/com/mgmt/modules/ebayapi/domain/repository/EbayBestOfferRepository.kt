package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayBestOffer
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.time.Instant

interface EbayBestOfferRepository : JpaRepository<EbayBestOffer, Long> {
    fun findByBestOfferId(bestOfferId: String): EbayBestOffer?
    fun findByStatusInOrderByCreatedAtDesc(statuses: List<String>): List<EbayBestOffer>
    fun findBySellerAndStatusInOrderByCreatedAtDesc(seller: String, statuses: List<String>): List<EbayBestOffer>
    fun findAllByOrderByCreatedAtDesc(): List<EbayBestOffer>
    fun findByItemIdAndStatusIn(itemId: String, statuses: List<String>): List<EbayBestOffer>

    /**
     * Find offers eligible for auto-reply retry:
     * - status IN ('Pending', 'Active')
     * - not expired (created within 48 hours)
     * - not recently attempted (last attempt > 15 min ago, or never attempted)
     * - attempts < max retries
     */
    @Query("""
        SELECT o FROM EbayBestOffer o
        WHERE o.status IN ('Pending', 'Active')
          AND o.createdAt > :cutoff48h
          AND o.autoReplyAttempts < :maxAttempts
          AND (o.lastAutoReplyAttemptAt IS NULL OR o.lastAutoReplyAttemptAt < :cooldownCutoff)
        ORDER BY o.createdAt ASC
    """)
    fun findRetryEligibleOffers(
        cutoff48h: Instant,
        cooldownCutoff: Instant,
        maxAttempts: Int,
    ): List<EbayBestOffer>
}
