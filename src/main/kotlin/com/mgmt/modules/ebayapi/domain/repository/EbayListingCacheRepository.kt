package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayListingCache
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface EbayListingCacheRepository : JpaRepository<EbayListingCache, String> {
    fun findAllBySeller(seller: String): List<EbayListingCache>
    fun findByItemIdAndSeller(itemId: String, seller: String): EbayListingCache?
    fun findByItemId(itemId: String): List<EbayListingCache>

    @Modifying
    @Query("DELETE FROM EbayListingCache e WHERE e.seller = :seller")
    fun deleteBySeller(seller: String)

    @Modifying
    @Query("DELETE FROM EbayListingCache e WHERE e.itemId = :itemId AND e.seller = :seller")
    fun deleteByItemIdAndSeller(itemId: String, seller: String)

    @Modifying
    @Query(
        value = """INSERT INTO ebay_api.listing_cache (item_id, seller, data, fetched_at)
                   VALUES (:itemId, :seller, CAST(:data AS jsonb), :fetchedAt)
                   ON CONFLICT (item_id) DO UPDATE SET
                       seller = EXCLUDED.seller,
                       data = EXCLUDED.data,
                       fetched_at = EXCLUDED.fetched_at""",
        nativeQuery = true
    )
    fun upsert(itemId: String, seller: String, data: String, fetchedAt: java.time.Instant)

    @Modifying
    @Query(
        value = """DELETE FROM ebay_api.listing_cache
                   WHERE seller = :seller AND item_id NOT IN (:itemIds)""",
        nativeQuery = true
    )
    fun deleteBySellerAndItemIdNotIn(seller: String, itemIds: List<String>)
}
