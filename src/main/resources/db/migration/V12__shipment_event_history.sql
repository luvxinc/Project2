CREATE TABLE IF NOT EXISTS shipment_events (
    id            BIGSERIAL    PRIMARY KEY,
    shipment_id   BIGINT       NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    logistic_num  VARCHAR(50)  NOT NULL,
    event_type    VARCHAR(30)  NOT NULL,
    event_seq     INT          NOT NULL,
    changes       JSONB        NOT NULL DEFAULT '{}',
    note          VARCHAR(500),
    operator      VARCHAR(50)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(shipment_id, event_seq)
);
CREATE INDEX idx_se_shipment_id ON shipment_events(shipment_id);
CREATE INDEX idx_se_logistic_num ON shipment_events(logistic_num);
