-- ================================================================
-- V32 Flyway Migration: Add box_per_ctn column to stocktake schema
-- ================================================================
-- Purpose: Split the old "Qty Per Box" CSV column into two:
--   1. qty_per_box  — quantity per inner box (unchanged column, new meaning)
--   2. box_per_ctn  — boxes per carton (NEW column)
--
-- Old formula:  total_qty = qty_per_box * num_of_box
-- New formula:  total_qty = qty_per_box * box_per_ctn * num_of_ctn
--
-- "num_of_box" is renamed to "num_of_ctn" (carton count).
-- The column stays as "num_of_box" in DB for backward compatibility,
-- but the API/DTO layer will use "numOfCtn".
--
-- NOTE: We rename the DB column to num_of_ctn for full clarity.
-- ================================================================

-- ==========================================
-- 1. stocktake_location_details
-- ==========================================

-- Drop the generated column first (cannot ALTER generated columns)
ALTER TABLE stocktake_location_details DROP COLUMN total_qty;

-- Add new column box_per_ctn
ALTER TABLE stocktake_location_details
    ADD COLUMN box_per_ctn INT NOT NULL DEFAULT 1;

-- Rename num_of_box → num_of_ctn
ALTER TABLE stocktake_location_details
    RENAME COLUMN num_of_box TO num_of_ctn;

-- Re-create generated column with new formula
ALTER TABLE stocktake_location_details
    ADD COLUMN total_qty INT NOT NULL GENERATED ALWAYS AS (qty_per_box * box_per_ctn * num_of_ctn) STORED;

COMMENT ON COLUMN stocktake_location_details.box_per_ctn IS '每箱几盒 (Boxes per Carton)';
COMMENT ON COLUMN stocktake_location_details.num_of_ctn IS '箱数 (Number of Cartons, renamed from num_of_box)';
COMMENT ON COLUMN stocktake_location_details.total_qty IS '总数量 = qty_per_box × box_per_ctn × num_of_ctn';


-- ==========================================
-- 2. warehouse_location_inventory
-- ==========================================

-- Drop the generated column first
ALTER TABLE warehouse_location_inventory DROP COLUMN total_qty;

-- Add new column box_per_ctn
ALTER TABLE warehouse_location_inventory
    ADD COLUMN box_per_ctn INT NOT NULL DEFAULT 1;

-- Rename num_of_box → num_of_ctn
ALTER TABLE warehouse_location_inventory
    RENAME COLUMN num_of_box TO num_of_ctn;

-- Re-create generated column with new formula
ALTER TABLE warehouse_location_inventory
    ADD COLUMN total_qty INT NOT NULL GENERATED ALWAYS AS (qty_per_box * box_per_ctn * num_of_ctn) STORED;

COMMENT ON COLUMN warehouse_location_inventory.box_per_ctn IS '每箱几盒 (Boxes per Carton)';
COMMENT ON COLUMN warehouse_location_inventory.num_of_ctn IS '箱数 (Number of Cartons, renamed from num_of_box)';
COMMENT ON COLUMN warehouse_location_inventory.total_qty IS '总数量 = qty_per_box × box_per_ctn × num_of_ctn';


-- ==========================================
-- 3. Delete stocktake record for 2026-01-31
-- ==========================================

DELETE FROM stocktakes WHERE stocktake_date = '2026-01-31';
