-- V38: Add source tracking and FIFO watermark for API-driven FIFO switchover
--
-- 1. Add 'source' column to fifo_transactions (csv/api)
-- 2. Backfill existing records as 'csv'
-- 3. Add FIFO sync watermark to track API FIFO progress

-- Source tracking
ALTER TABLE fifo_transactions ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'csv';
UPDATE fifo_transactions SET source = 'csv' WHERE source IS NULL;

-- FIFO watermark (separate from API sync watermark)
CREATE TABLE IF NOT EXISTS ebay_api.fifo_watermarks (
    id SERIAL PRIMARY KEY,
    watermark_date DATE NOT NULL DEFAULT '2024-12-31',
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    rows_processed INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, synced, blocked
    blocked_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial watermark (FIFO starts 2025-01-01, watermark at 2024-12-31 = not yet synced)
INSERT INTO ebay_api.fifo_watermarks (watermark_date, status)
VALUES ('2024-12-31', 'pending')
ON CONFLICT DO NOTHING;
