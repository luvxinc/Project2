-- V41: Update Ads rules to use offset model instead of weight model
-- Conservative offset = suggestedRate - X%
-- Aggressive offset = suggestedRate + X%

DELETE FROM automation_rules WHERE module = 'ADS' AND rule_key IN ('conservative_weight', 'aggressive_weight');

INSERT INTO automation_rules (module, rule_key, rule_value) VALUES
    ('ADS', 'conservative_offset', '3.0'),
    ('ADS', 'aggressive_offset', '3.0')
ON CONFLICT (module, rule_key) DO NOTHING;
