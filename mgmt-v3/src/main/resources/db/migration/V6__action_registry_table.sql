-- Action Registry persistence table (V1 parity: data/security_overrides.json)
-- Stores security policy matrix: which actions require which security codes.
CREATE TABLE IF NOT EXISTS action_registry (
    id          VARCHAR(36)    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    action_key  VARCHAR(128)   NOT NULL UNIQUE,
    tokens      TEXT           NOT NULL DEFAULT '[]',  -- JSON array of token types, e.g. '["user","modify"]'
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_registry_key ON action_registry(action_key);
