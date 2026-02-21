-- V14: Remove type column from supplier_strategies
-- Business decision: the A/B/C type classification (E-commerce goods, Goods dependencies, Consumables)
-- is no longer needed for supplier management.
ALTER TABLE supplier_strategies DROP COLUMN IF EXISTS type;
