package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayBestOffer
import org.springframework.data.jpa.repository.JpaRepository

interface EbayBestOfferRepository : JpaRepository<EbayBestOffer, Long> {
    fun findByBestOfferId(bestOfferId: String): EbayBestOffer?
    fun findByStatusInOrderByCreatedAtDesc(statuses: List<String>): List<EbayBestOffer>
    fun findBySellerAndStatusInOrderByCreatedAtDesc(seller: String, statuses: List<String>): List<EbayBestOffer>
    fun findAllByOrderByCreatedAtDesc(): List<EbayBestOffer>
    fun findByItemIdAndStatusIn(itemId: String, statuses: List<String>): List<EbayBestOffer>
}
