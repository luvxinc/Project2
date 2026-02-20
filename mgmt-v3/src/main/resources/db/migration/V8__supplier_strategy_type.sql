-- V8: Add type column to supplier_strategies
ALTER TABLE supplier_strategies ADD COLUMN type VARCHAR(1);
COMMENT ON COLUMN supplier_strategies.type IS 'Supplier type: A=E-commerce goods, B=Goods dependencies, C=Consumables and others';

-- Backfill existing data (V1 all had type=A)
UPDATE supplier_strategies SET type = 'A' WHERE type IS NULL;
