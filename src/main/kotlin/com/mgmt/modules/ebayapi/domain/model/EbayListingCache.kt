package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.time.Instant

/**
 * EbayListingCache — Cached eBay listing data.
 *
 * Stores the full enriched listing item as JSONB so the frontend can
 * load cached data instantly without hitting the eBay API.
 */
@Entity
@Table(name = "listing_cache", schema = "ebay_api")
class EbayListingCache(
    @Id
    @Column(name = "item_id", length = 50)
    var itemId: String = "",

    @Column(name = "seller", nullable = false, length = 100)
    var seller: String = "",

    @Column(name = "data", columnDefinition = "jsonb", nullable = false)
    var data: String = "{}",

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.now(),
)
