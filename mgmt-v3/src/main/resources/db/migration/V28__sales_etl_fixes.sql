-- =============================================================================
-- V28: Sales ETL Fixes — add missing dispute_fee column to raw_transactions
-- =============================================================================

-- raw_transactions: add dispute_fee for Payments dispute fee CSV column
ALTER TABLE raw_transactions
    ADD COLUMN IF NOT EXISTS dispute_fee TEXT;
