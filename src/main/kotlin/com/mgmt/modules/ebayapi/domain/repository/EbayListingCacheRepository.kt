package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayListingCache
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface EbayListingCacheRepository : JpaRepository<EbayListingCache, String> {
    fun findAllBySeller(seller: String): List<EbayListingCache>
    fun findByItemIdAndSeller(itemId: String, seller: String): EbayListingCache?

    @Modifying
    @Query("DELETE FROM EbayListingCache e WHERE e.seller = :seller")
    fun deleteBySeller(seller: String)

    @Modifying
    @Query("DELETE FROM EbayListingCache e WHERE e.itemId = :itemId AND e.seller = :seller")
    fun deleteByItemIdAndSeller(itemId: String, seller: String)
}
