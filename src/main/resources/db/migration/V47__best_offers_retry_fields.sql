-- V47: Add retry tracking fields to best_offers for auto-reply retry scan.
-- auto_reply_attempts: count of auto-reply attempts (max 3)
-- last_auto_reply_attempt_at: timestamp of last attempt (throttle to 15 min)

ALTER TABLE ebay_api.best_offers
    ADD COLUMN IF NOT EXISTS auto_reply_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_auto_reply_attempt_at TIMESTAMP WITH TIME ZONE;

-- Index for the retry scan query: status + attempts + last attempt time
CREATE INDEX IF NOT EXISTS idx_best_offers_retry_scan
    ON ebay_api.best_offers(status, auto_reply_attempts, last_auto_reply_attempt_at)
    WHERE status IN ('Pending', 'Active');
