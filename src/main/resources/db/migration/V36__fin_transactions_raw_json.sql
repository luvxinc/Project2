-- V36: Add raw_json to ebay_api.fin_transactions for complete API response archival
-- Matches ful_orders and fin_payouts which already have raw_json
ALTER TABLE ebay_api.fin_transactions ADD COLUMN IF NOT EXISTS raw_json text;
