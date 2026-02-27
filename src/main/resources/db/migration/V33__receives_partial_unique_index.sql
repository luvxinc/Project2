-- ================================================================
-- V33: Fix receives unique constraint for soft-delete compatibility
-- ================================================================
-- Problem:
--   V3 uses soft-delete (deleted_at IS NOT NULL) for Receive records.
--   V1 used hard DELETE — old rows are gone, re-submit = fresh INSERT.
--   The original UNIQUE(shipment_id, po_id, sku, unit_price) blocks
--   re-submission after soft-delete because the old row still exists.
--
-- Fix:
--   Replace the absolute unique constraint with a PARTIAL unique index
--   that only enforces uniqueness among ACTIVE (non-deleted) rows.
--   This is the standard PostgreSQL pattern for soft-delete + unique.
-- ================================================================

-- Step 1: Drop the existing absolute unique constraint
ALTER TABLE receives
    DROP CONSTRAINT receives_shipment_id_po_id_sku_unit_price_key;

-- Step 2: Create a partial unique index (only active records)
CREATE UNIQUE INDEX uq_receives_active_shipment_po_sku_price
    ON receives (shipment_id, po_id, sku, unit_price)
    WHERE deleted_at IS NULL;
