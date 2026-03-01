-- ═══════════════════════════════════════════════════
-- V39: eBay Listing Cache table
-- Caches all active listing data from eBay API.
-- Each row stores one listing item as JSONB.
-- Updated on manual refresh; serves as fast read cache.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ebay_api.listing_cache (
    item_id     VARCHAR(50)  PRIMARY KEY,
    seller      VARCHAR(100) NOT NULL,
    data        JSONB        NOT NULL,
    fetched_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_cache_seller
    ON ebay_api.listing_cache(seller);

COMMENT ON TABLE ebay_api.listing_cache IS 'Cache of eBay active listing data, refreshed via manual sync';
