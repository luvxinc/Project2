-- V44: Seed global default offer reply strategy
-- Ensures ALL offers get a response even if no specific SKU category rule matches.
-- Global fallback: 5% discount (Counter at 5% below BuyItNowPrice)

INSERT INTO offer_reply_strategy (category_group, path_key, qty_min, qty_max, discount_type, discount_value, enabled)
VALUES ('*', '*', 1, NULL, 'PERCENT', 5.00, true)
ON CONFLICT DO NOTHING;

-- Also seed an OTHER category wildcard as secondary fallback
INSERT INTO offer_reply_strategy (category_group, path_key, qty_min, qty_max, discount_type, discount_value, enabled)
VALUES ('OTHER', '*', 1, NULL, 'PERCENT', 5.00, true)
ON CONFLICT DO NOTHING;
