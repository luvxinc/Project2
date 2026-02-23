-- Fix logistics payment_no: V1 uses shared pmt_no across multiple shipments
-- in a batch, but the V3 unique constraint (payment_type, payment_no)
-- prevented this, so the migration script appended V1 row IDs as suffix.
--
-- This migration:
-- 1. Drops the overly strict unique constraint
-- 2. Recreates it as a partial index that allows logistics to share payment_no
-- 3. Fixes the corrupted payment_no data by stripping the trailing _ID suffix

-- Step 1: Drop the existing constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS uq_payments_type_no;

-- Step 2: For non-logistics types, payment_no is unique per type (unchanged behavior)
CREATE UNIQUE INDEX uq_payments_type_no
    ON payments (payment_type, payment_no)
    WHERE payment_type != 'logistics';

-- Step 3: For logistics, unique per (type, payment_no, logistic_num)
CREATE UNIQUE INDEX uq_payments_logistics_no
    ON payments (payment_type, payment_no, logistic_num)
    WHERE payment_type = 'logistics';

-- Step 4: Fix corrupted payment_no values — strip trailing _ID suffix
-- V1 format: "2025-10-31_S02"  V3 (broken): "2025-10-31_S02_11"
UPDATE payments
SET payment_no = regexp_replace(payment_no, '(_S\d{2})_\d+$', '\1')
WHERE payment_type = 'logistics'
  AND payment_no ~ '_S\d{2}_\d+$';
