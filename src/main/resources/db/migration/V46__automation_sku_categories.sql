-- V46: SKU prefix → category group mapping for offer auto-reply
-- Used by AutoOpsService to determine which decision tree to traverse
-- when processing incoming best offers.
-- Query: SELECT category_group FROM automation_sku_categories
--        WHERE ? LIKE sku_prefix || '%' ORDER BY LENGTH(sku_prefix) DESC LIMIT 1

CREATE TABLE IF NOT EXISTS automation_sku_categories (
    id              SERIAL          PRIMARY KEY,
    sku_prefix      VARCHAR(50)     NOT NULL,
    category_group  VARCHAR(30)     NOT NULL,   -- WHEEL_ADAPTER / WHEEL_SPACER / OTHER
    UNIQUE(sku_prefix)
);

-- Seed with common SKU prefixes
-- Wheel Adapters: typically start with digit patterns like 5100, 5112, etc.
-- Wheel Spacers: typically start with WS or spacer-related prefixes
-- These can be managed via the UI; this is the initial baseline.
INSERT INTO automation_sku_categories (sku_prefix, category_group) VALUES
    ('5100', 'WHEEL_ADAPTER'),
    ('5108', 'WHEEL_ADAPTER'),
    ('5110', 'WHEEL_ADAPTER'),
    ('5112', 'WHEEL_ADAPTER'),
    ('5114', 'WHEEL_ADAPTER'),
    ('5120', 'WHEEL_ADAPTER'),
    ('5127', 'WHEEL_ADAPTER'),
    ('5130', 'WHEEL_ADAPTER'),
    ('5135', 'WHEEL_ADAPTER'),
    ('6061', 'WHEEL_SPACER'),
    ('7075', 'WHEEL_SPACER')
ON CONFLICT (sku_prefix) DO NOTHING;
