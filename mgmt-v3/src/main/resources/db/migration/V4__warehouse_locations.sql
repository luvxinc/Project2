-- ================================================================
-- V4 Flyway Migration: Warehouse Location (Barcode System)
-- ================================================================
-- Source: V1 in_mgmt_barcode (220 rows, 8 cols, 6-column composite PK)
-- V3: Single BIGSERIAL PK + generated barcode column
-- ================================================================

CREATE TABLE warehouse_locations (
    id          BIGSERIAL PRIMARY KEY,
    warehouse   VARCHAR(20) NOT NULL,
    aisle       VARCHAR(10) NOT NULL,
    bay         INT NOT NULL,
    level       VARCHAR(10) NOT NULL,
    bin         VARCHAR(10) NOT NULL DEFAULT '',
    slot        VARCHAR(10) NOT NULL DEFAULT '',
    barcode     VARCHAR(50) GENERATED ALWAYS AS (
        warehouse || '-' || aisle || '-' || bay::TEXT || '-' || level ||
        CASE WHEN bin != '' THEN '-' || bin ELSE '' END ||
        CASE WHEN slot != '' THEN '-' || slot ELSE '' END
    ) STORED,

    -- §8.1 Audit
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(36),
    updated_by  VARCHAR(36),
    version     INT NOT NULL DEFAULT 0,

    UNIQUE(warehouse, aisle, bay, level, bin, slot)
);

CREATE INDEX idx_wl_barcode ON warehouse_locations(barcode);
CREATE INDEX idx_wl_warehouse ON warehouse_locations(warehouse);
COMMENT ON TABLE warehouse_locations IS 'V1: in_mgmt_barcode → 仓位管理 (6列复合PK → BIGSERIAL + 生成列barcode)';
