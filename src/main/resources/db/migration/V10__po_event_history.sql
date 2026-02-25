-- V1 parity + compliance: append-only PO event history table.
-- Records every change to a purchase order with before/after diff.
-- Maps to V1's in_po audit trail pattern (L01→L02→L03 seq chain).
-- This table is APPEND-ONLY: no UPDATE or DELETE allowed in application code.

CREATE TABLE IF NOT EXISTS purchase_order_events (
    id          BIGSERIAL PRIMARY KEY,
    po_id       BIGINT NOT NULL REFERENCES purchase_orders(id),
    po_num      VARCHAR(50) NOT NULL,
    event_type  VARCHAR(30) NOT NULL,  -- CREATE, UPDATE_ITEMS, UPDATE_STRATEGY, DELETE, RESTORE
    event_seq   INT NOT NULL,          -- per-PO sequence (1,2,3... maps to V1 L01/L02/L03)
    changes     JSONB NOT NULL DEFAULT '{}',  -- before/after diff
    note        VARCHAR(500),          -- human-readable note (V1: "原始订单", "删除订单_xxx")
    operator    VARCHAR(50) NOT NULL,  -- username
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_poe_po_id ON purchase_order_events(po_id);
CREATE INDEX idx_poe_po_num ON purchase_order_events(po_num);
CREATE INDEX idx_poe_type ON purchase_order_events(event_type);
CREATE INDEX idx_poe_created ON purchase_order_events(created_at);

-- Unique constraint: one seq per PO (prevents duplicate events)
CREATE UNIQUE INDEX idx_poe_po_seq ON purchase_order_events(po_id, event_seq);

COMMENT ON TABLE purchase_order_events IS 'Append-only audit trail for PO changes. V1 parity with in_po seq chain.';
COMMENT ON COLUMN purchase_order_events.changes IS 'JSONB: {before: {...}, after: {...}} recording field-level diffs';
COMMENT ON COLUMN purchase_order_events.event_seq IS 'Per-PO incrementing sequence. Maps to V1 detail seq (L01=1, L02=2, ...)';
