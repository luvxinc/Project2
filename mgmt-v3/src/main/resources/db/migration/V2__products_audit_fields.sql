-- V2: Add audit fields to products table (v3-architecture.md §8.1 compliance)
-- Every table must have: created_by, updated_by

ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36);

-- Backfill existing records with 'system' as creator
UPDATE products SET created_by = 'system' WHERE created_by IS NULL;
UPDATE products SET updated_by = 'system' WHERE updated_by IS NULL;
