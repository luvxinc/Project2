-- V37: Sync watermarks table for incremental API data sync
CREATE TABLE IF NOT EXISTS ebay_api.sync_watermarks (
    id BIGSERIAL PRIMARY KEY,
    seller_username VARCHAR(100) NOT NULL,
    api_endpoint VARCHAR(50) NOT NULL,
    last_sync_date DATE NOT NULL,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    record_count INT DEFAULT 0,
    UNIQUE(seller_username, api_endpoint)
);
