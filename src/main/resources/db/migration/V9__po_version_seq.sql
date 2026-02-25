-- V1 parity: add version sequence tracking for PO detail and strategy
-- V1 uses L01/L02/L03... for item changes, V01/V02/V03... for strategy changes

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS detail_seq INT NOT NULL DEFAULT 1;

ALTER TABLE purchase_order_strategies
    ADD COLUMN IF NOT EXISTS strategy_seq INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN purchase_orders.detail_seq IS 'V1 parity: item edit version counter, displayed as L01/L02/...';
COMMENT ON COLUMN purchase_order_strategies.strategy_seq IS 'V1 parity: strategy edit version counter, displayed as V01/V02/...';
