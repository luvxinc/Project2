-- ═══════════════════════════════════════════════════════════════
-- V17: Landed prices table for Purchase→FIFO chain
--
-- V1 parity: in_dynamic_landed_price
-- Created by Purchase (receive submit), Updated by Finance (payments).
-- Separated from fifo_layers to enable Finance recalculations
-- without touching the FIFO engine directly.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS landed_prices (
    id              BIGSERIAL       PRIMARY KEY,
    fifo_tran_id    BIGINT          REFERENCES fifo_transactions(id) ON DELETE RESTRICT,
    fifo_layer_id   BIGINT          REFERENCES fifo_layers(id) ON DELETE RESTRICT,
    logistic_num    VARCHAR(50)     NOT NULL,
    po_num          VARCHAR(50)     NOT NULL,
    sku             VARCHAR(100)    NOT NULL,
    quantity        INT             NOT NULL,
    base_price_usd  NUMERIC(12,5)  NOT NULL DEFAULT 0,
    landed_price_usd NUMERIC(12,5) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE(logistic_num, po_num, sku)
);

CREATE INDEX idx_lp_logistic_num ON landed_prices(logistic_num);
CREATE INDEX idx_lp_po_num ON landed_prices(po_num);
CREATE INDEX idx_lp_sku ON landed_prices(sku);
