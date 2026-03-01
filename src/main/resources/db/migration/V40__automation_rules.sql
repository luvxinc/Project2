-- V40: Automation rules schema for Sales module
-- Covers: Restock, Reprice, Ads, Offer Auto-Reply decision tree

-- ═══════════════════════════════════════════════════
-- 1. Generic automation rules (key-value per module)
-- ═══════════════════════════════════════════════════
CREATE TABLE automation_rules (
    id              BIGSERIAL       PRIMARY KEY,
    module          VARCHAR(30)     NOT NULL,       -- RESTOCK / REPRICE / ADS / OFFER_REPLY
    rule_key        VARCHAR(100)    NOT NULL,       -- parameter name
    rule_value      TEXT            NOT NULL,       -- value (scalar or JSON)
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(36),
    UNIQUE(module, rule_key)
);

-- Seed default values for Restock
INSERT INTO automation_rules (module, rule_key, rule_value) VALUES
    ('RESTOCK', 'min_stock', '5'),
    ('RESTOCK', 'max_stock', '50'),
    ('RESTOCK', 'sold_divisor', '30');

-- Seed default values for Ads
INSERT INTO automation_rules (module, rule_key, rule_value) VALUES
    ('ADS', 'conservative_weight', '70'),
    ('ADS', 'aggressive_weight', '30'),
    ('ADS', 'ad_rate_max', '8.0'),
    ('ADS', 'ad_rate_min', '2.0');

-- ═══════════════════════════════════════════════════
-- 2. Offer reply decision tree nodes
--    Each row = one decision level for a category group
-- ═══════════════════════════════════════════════════
CREATE TABLE offer_reply_tree (
    id              BIGSERIAL       PRIMARY KEY,
    category_group  VARCHAR(30)     NOT NULL,       -- WHEEL_ADAPTER / WHEEL_SPACER / OTHER
    level           INT             NOT NULL,       -- Depth in tree (1 = root decision)
    decision_key    VARCHAR(50)     NOT NULL,       -- by_lug / by_thickness / by_piece_count / by_quantity / by_price_range
    enabled         BOOLEAN         NOT NULL DEFAULT false,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(36),
    UNIQUE(category_group, level, decision_key)
);

-- Seed tree structure (all disabled by default)
-- Wheel Adapter: L1=by_lug, L2=by_thickness, L3=by_piece_count, L4=by_quantity
INSERT INTO offer_reply_tree (category_group, level, decision_key, enabled) VALUES
    ('WHEEL_ADAPTER', 1, 'by_lug',          false),
    ('WHEEL_ADAPTER', 2, 'by_thickness',    false),
    ('WHEEL_ADAPTER', 3, 'by_piece_count',  false),
    ('WHEEL_ADAPTER', 4, 'by_quantity',     false);

-- Wheel Spacer: L1=by_thickness, L2=by_piece_count, L3=by_quantity
INSERT INTO offer_reply_tree (category_group, level, decision_key, enabled) VALUES
    ('WHEEL_SPACER', 1, 'by_thickness',    false),
    ('WHEEL_SPACER', 2, 'by_piece_count',  false),
    ('WHEEL_SPACER', 3, 'by_quantity',     false);

-- Other: L1=by_price_range, L2=by_piece_count, L3=by_quantity
INSERT INTO offer_reply_tree (category_group, level, decision_key, enabled) VALUES
    ('OTHER', 1, 'by_price_range',  false),
    ('OTHER', 2, 'by_piece_count',  false),
    ('OTHER', 3, 'by_quantity',     false);

-- ═══════════════════════════════════════════════════
-- 3. Offer reply strategy (leaf nodes)
--    Each row = a pricing strategy for a specific path
-- ═══════════════════════════════════════════════════
CREATE TABLE offer_reply_strategy (
    id              BIGSERIAL       PRIMARY KEY,
    category_group  VARCHAR(30)     NOT NULL,       -- WHEEL_ADAPTER / WHEEL_SPACER / OTHER
    path_key        VARCHAR(200)    NOT NULL,       -- Decision path, e.g. "lug:5|thick:32|piece:4|qty:1-2"
    qty_min         INT             NOT NULL DEFAULT 1,  -- Buyer quantity range lower bound (套数下限)
    qty_max         INT,                            -- Upper bound (null = unlimited)
    discount_type   VARCHAR(10)     NOT NULL,       -- AMOUNT / PERCENT
    discount_value  NUMERIC(10,2)   NOT NULL,       -- Discount amount or percentage
    enabled         BOOLEAN         NOT NULL DEFAULT true,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(36)
);

-- Index for fast path lookup
CREATE INDEX idx_offer_reply_strategy_path ON offer_reply_strategy(category_group, path_key);

-- ═══════════════════════════════════════════════════
-- 4. User-defined range configurations
--    For price ranges, piece count ranges, quantity tiers
-- ═══════════════════════════════════════════════════
CREATE TABLE offer_reply_ranges (
    id              BIGSERIAL       PRIMARY KEY,
    category_group  VARCHAR(30)     NOT NULL,       -- WHEEL_ADAPTER / WHEEL_SPACER / OTHER
    range_type      VARCHAR(30)     NOT NULL,       -- PRICE_RANGE / PIECE_COUNT / QUANTITY_TIER
    range_min       NUMERIC(10,2)   NOT NULL,       -- Lower bound
    range_max       NUMERIC(10,2),                  -- Upper bound (null = unlimited)
    label           VARCHAR(50),                    -- Display label, e.g. "$0-20" or "2 pcs"
    sort_order      INT             NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(36),
    UNIQUE(category_group, range_type, range_min)
);
