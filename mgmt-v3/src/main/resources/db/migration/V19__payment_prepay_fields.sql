-- ================================================================
-- V19: Prepayment Module — Schema Extensions
-- ================================================================
-- 1. Add tran_curr_req to payments (supplier's required currency)
-- 2. Create payment_events table (domain event, append-only)
--    Consistent with purchase_order_events (V10) and shipment_events (V12)
-- ================================================================

-- 1. Extend payments table for prepay-specific field
--    V1 field: in_pmt_prepay.tran_curr_req → supplier's required settlement currency
--    Needed for balance calculation: when tran_curr_use ≠ tran_curr_req, apply exchange rate
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tran_curr_req VARCHAR(3);
COMMENT ON COLUMN payments.tran_curr_req IS 'V1: tran_curr_req — supplier required currency (USD/RMB). Only for payment_type=prepay.';

-- 2. Payment events table (append-only audit trail)
--    Mirrors purchase_order_events (V10) and shipment_events (V12) patterns.
--    V1 source: in_pmt_prepay mutation log (each row = one event)
CREATE TABLE IF NOT EXISTS payment_events (
    id            BIGSERIAL    PRIMARY KEY,
    payment_id    BIGINT       NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    payment_no    VARCHAR(100) NOT NULL,
    event_type    VARCHAR(30)  NOT NULL,     -- CREATE / DELETE / RESTORE / RATE_CHANGE / AMOUNT_CHANGE
    event_seq     INT          NOT NULL,     -- per-payment sequence (1,2,3... maps to V1 T01/T02/T03)
    changes       JSONB        NOT NULL DEFAULT '{}',  -- before/after diff or initial snapshot
    note          VARCHAR(500),              -- human-readable note
    operator      VARCHAR(50)  NOT NULL,     -- username
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(payment_id, event_seq)
);

CREATE INDEX idx_pe_payment_id ON payment_events(payment_id);
CREATE INDEX idx_pe_payment_no ON payment_events(payment_no);
CREATE INDEX idx_pe_type ON payment_events(event_type);
CREATE INDEX idx_pe_created ON payment_events(created_at);

COMMENT ON TABLE payment_events IS 'Append-only audit trail for payment changes. V1 parity with in_pmt_prepay seq chain (T01/T02...).';
COMMENT ON COLUMN payment_events.changes IS 'JSONB: initial snapshot or {before: {...}, after: {...}} field-level diffs';
COMMENT ON COLUMN payment_events.event_seq IS 'Per-payment incrementing sequence. Maps to V1 tran_seq (T01=1, T02=2, ...).';
