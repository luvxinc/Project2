-- V29: Sales ETL V1 Parity Fixes
-- P8: Split FVF into fixed + variable (V1 keeps both columns separately)
-- P9: Split Tax into seller_tax + ebay_tax (V1 keeps both)
-- P12: Per-row seller support (raw_transactions already has seller column)
-- P13: Working Set synced flag for cross-batch reconciliation
-- P16: Date validation (code-level, no schema change needed)

-- ═══════════════════════════════════════════════════
-- 1. raw_transactions: split listing_fee → fvf_fee_fixed + fvf_fee_variable
--    split tax_amount → seller_tax + ebay_tax
--    add synced flag
-- ═══════════════════════════════════════════════════

ALTER TABLE raw_transactions
    ADD COLUMN IF NOT EXISTS fvf_fee_fixed text,
    ADD COLUMN IF NOT EXISTS fvf_fee_variable text,
    ADD COLUMN IF NOT EXISTS seller_tax numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ebay_tax numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS synced boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN raw_transactions.fvf_fee_fixed IS 'V1: Final Value Fee - fixed (raw CSV text)';
COMMENT ON COLUMN raw_transactions.fvf_fee_variable IS 'V1: Final Value Fee - variable (raw CSV text)';
COMMENT ON COLUMN raw_transactions.seller_tax IS 'V1: Seller collected tax (split from tax_amount)';
COMMENT ON COLUMN raw_transactions.ebay_tax IS 'V1: eBay collected tax (split from tax_amount)';
COMMENT ON COLUMN raw_transactions.synced IS 'V1 parity: Processed_T equivalent — false = pending transform';

CREATE INDEX IF NOT EXISTS idx_rt_synced ON raw_transactions(synced) WHERE synced = false;

-- ═══════════════════════════════════════════════════
-- 2. raw_earnings: add synced flag
-- ═══════════════════════════════════════════════════

ALTER TABLE raw_earnings
    ADD COLUMN IF NOT EXISTS synced boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN raw_earnings.synced IS 'V1 parity: Processed_E equivalent — false = pending transform';

CREATE INDEX IF NOT EXISTS idx_re_synced ON raw_earnings(synced) WHERE synced = false;

-- ═══════════════════════════════════════════════════
-- 3. cleaned_transactions: add split fee/tax columns
-- ═══════════════════════════════════════════════════

ALTER TABLE cleaned_transactions
    ADD COLUMN IF NOT EXISTS fvf_fee_fixed numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fvf_fee_variable numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS seller_tax numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ebay_tax numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN cleaned_transactions.fvf_fee_fixed IS 'V1: Final Value Fee - fixed';
COMMENT ON COLUMN cleaned_transactions.fvf_fee_variable IS 'V1: Final Value Fee - variable';
COMMENT ON COLUMN cleaned_transactions.seller_tax IS 'V1: Seller collected tax';
COMMENT ON COLUMN cleaned_transactions.ebay_tax IS 'V1: eBay collected tax';
