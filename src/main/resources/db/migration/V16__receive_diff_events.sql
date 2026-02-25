-- ═══════════════════════════════════════════════════════════════
-- V16: Append-only audit trail for receive_diffs (abnormal handling)
--
-- Mirrors shipment_events pattern exactly.
-- Records: CREATED, PROCESS_M1..M4, DELETED events.
-- NEVER updated or deleted — append only.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS receive_diff_events (
    id            BIGSERIAL    PRIMARY KEY,
    diff_id       BIGINT       NOT NULL REFERENCES receive_diffs(id) ON DELETE RESTRICT,
    logistic_num  VARCHAR(50)  NOT NULL,
    event_type    VARCHAR(30)  NOT NULL,
    event_seq     INT          NOT NULL,
    changes       JSONB        NOT NULL DEFAULT '{}',
    note          VARCHAR(500),
    operator      VARCHAR(50)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(diff_id, event_seq)
);

CREATE INDEX idx_rde_diff_id ON receive_diff_events(diff_id);
CREATE INDEX idx_rde_logistic_num ON receive_diff_events(logistic_num);
CREATE INDEX idx_rde_event_type ON receive_diff_events(event_type);
