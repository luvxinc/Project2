-- V43: Sales module action log + auto-ops toggle
-- Unified logging for all eBay API operations across the system.

-- ═══════════════════════════════════════════════════
-- 1. Action log table
-- ═══════════════════════════════════════════════════
CREATE TABLE ebay_api.sales_action_log (
    id              BIGSERIAL       PRIMARY KEY,

    -- Classification
    module          VARCHAR(30)     NOT NULL,
        -- LISTING / OFFER / DATA_SYNC / TRANSFORM / FIFO / SYSTEM
    action_type     VARCHAR(50)     NOT NULL,
        -- RESTOCK / REPRICE / PROMOTE / SKU_UPDATE / REFRESH_LISTINGS / PARTIAL_REFRESH / AD_RATE_REFRESH
        -- OFFER_REPLY / REFRESH_OFFERS / ELIGIBLE_QUERY
        -- DAILY_SYNC / MANUAL_SYNC / WEBHOOK_ORDER / WEBHOOK_SHIPPED
        -- TRANSFORM / SKU_FIX
        -- FIFO_SYNC / FIFO_UNDO
        -- WEBHOOK_RECEIVED / TOKEN_REFRESH
    trigger_type    VARCHAR(15)     NOT NULL,
        -- AUTO / MANUAL / SCHEDULED / WEBHOOK

    -- Context
    seller          VARCHAR(100),

    -- Summary (always present, human-readable)
    summary         TEXT            NOT NULL,

    -- Batch statistics (for bulk operations)
    total_count     INT,
    success_count   INT,
    failed_count    INT,

    -- Flexible detail (JSONB, structure varies by action_type)
    detail          JSONB,

    -- Result
    success         BOOLEAN         NOT NULL DEFAULT true,
    error_message   TEXT,
    duration_ms     BIGINT,

    -- Timestamp
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for frontend queries
CREATE INDEX idx_sal_module_time   ON ebay_api.sales_action_log(module, created_at DESC);
CREATE INDEX idx_sal_action_type   ON ebay_api.sales_action_log(action_type, created_at DESC);
CREATE INDEX idx_sal_trigger       ON ebay_api.sales_action_log(trigger_type, created_at DESC);

-- ═══════════════════════════════════════════════════
-- 2. Auto-ops toggle (in existing automation_rules table)
-- ═══════════════════════════════════════════════════
INSERT INTO automation_rules (module, rule_key, rule_value) VALUES
    ('SYSTEM', 'auto_ops_enabled', 'false')
ON CONFLICT (module, rule_key) DO NOTHING;
