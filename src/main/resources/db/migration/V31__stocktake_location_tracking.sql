-- ================================================================
-- V31 Flyway Migration: Stocktake Location Tracking System
-- ================================================================
-- Purpose: Add location-aware inventory tracking to stocktake system
--
-- New tables:
--   1. stocktake_location_details — per-row CSV detail (position + qty breakdown)
--   2. warehouse_location_inventory — real-time position→product mapping (latest snapshot)
--   3. stocktake_events — audit history for stocktake operations
--
-- Modified tables:
--   1. warehouse_locations — add has_inventory flag for position locking
--
-- Design for future APP extension:
--   - Shelf barcode: "location_{wh}_{aisle}_{bay}_{level}_{bin}_{slot}"
--   - Product barcode: "{sku}|{qtyPerBox}|{boxPerCtn}"
--   - APP flow: scan shelf → scan product → input box count → write
-- ================================================================

-- ==========================================
-- 1. Stocktake Location Details
-- ==========================================
-- Each row represents one CSV line from a stocktake upload.
-- Records the exact position and quantity breakdown per SKU.
-- total_qty is system-calculated (qty_per_box × num_of_box), never user-provided.

CREATE TABLE stocktake_location_details (
    id              BIGSERIAL       PRIMARY KEY,
    stocktake_id    BIGINT          NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    location_id     BIGINT          NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
    sku             VARCHAR(100)    NOT NULL,

    -- Quantity breakdown (from CSV col 3 & 4, or from barcode scan)
    qty_per_box     INT             NOT NULL DEFAULT 0,
    num_of_box      INT             NOT NULL DEFAULT 0,

    -- System-calculated total (immutable, always = qty_per_box × num_of_box)
    total_qty       INT             NOT NULL GENERATED ALWAYS AS (qty_per_box * num_of_box) STORED,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Same SKU can appear at same location with different box configs
    -- (e.g., 320/box × 8 AND 192/box × 2 at same shelf)
    -- No UNIQUE constraint — use index for query performance only
);

CREATE INDEX idx_sld_stocktake ON stocktake_location_details(stocktake_id);
CREATE INDEX idx_sld_location ON stocktake_location_details(location_id);
CREATE INDEX idx_sld_sku ON stocktake_location_details(sku);
COMMENT ON TABLE stocktake_location_details IS '盘点位置明细 — 每次盘点中每行CSV的完整记录 (位置+数量分解)';


-- ==========================================
-- 2. Warehouse Location Inventory (Real-time Snapshot)
-- ==========================================
-- Represents the CURRENT state of what's at each warehouse location.
-- Overwritten each time a stocktake is uploaded for that warehouse.
-- This powers the 3D hover display and warehouse product list.

CREATE TABLE warehouse_location_inventory (
    id                  BIGSERIAL       PRIMARY KEY,
    location_id         BIGINT          NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
    sku                 VARCHAR(100)    NOT NULL,

    -- Quantity breakdown (mirrors latest stocktake detail)
    qty_per_box         INT             NOT NULL DEFAULT 0,
    num_of_box          INT             NOT NULL DEFAULT 0,

    -- System-calculated total
    total_qty           INT             NOT NULL GENERATED ALWAYS AS (qty_per_box * num_of_box) STORED,

    -- Traceability: which stocktake produced this snapshot
    last_stocktake_id   BIGINT          REFERENCES stocktakes(id) ON DELETE SET NULL,

    -- §8.1 Audit
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(36),

    -- Same SKU can appear at same location with different box configs
    -- No UNIQUE constraint
);

CREATE INDEX idx_wli_location ON warehouse_location_inventory(location_id);
CREATE INDEX idx_wli_sku ON warehouse_location_inventory(sku);
CREATE INDEX idx_wli_stocktake ON warehouse_location_inventory(last_stocktake_id) WHERE last_stocktake_id IS NOT NULL;
COMMENT ON TABLE warehouse_location_inventory IS '仓位-产品实时映射 — 每次盘点覆写, 代表当前最新状态 (3D Hover + 货物列表数据源)';


-- ==========================================
-- 3. Stocktake Events (Audit History)
-- ==========================================
-- Tracks every operation on stocktakes: upload, update, delete.
-- old_data/new_data capture before/after snapshots for full traceability.

CREATE TABLE stocktake_events (
    id              BIGSERIAL       PRIMARY KEY,
    stocktake_id    BIGINT          NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,

    -- Event classification
    event_type      VARCHAR(20)     NOT NULL,  -- UPLOAD / UPDATE_ITEMS / UPDATE_NOTE / DELETE
    summary         TEXT,                       -- Human-readable summary (e.g., "Uploaded 45 rows, 12 SKUs")

    -- Change snapshot
    old_data        JSONB,                     -- Before state (NULL for UPLOAD)
    new_data        JSONB,                     -- After state (NULL for DELETE)

    -- §8.1 Audit
    created_by      VARCHAR(36),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_se_stocktake ON stocktake_events(stocktake_id);
CREATE INDEX idx_se_type ON stocktake_events(event_type);
CREATE INDEX idx_se_date ON stocktake_events(created_at DESC);
COMMENT ON TABLE stocktake_events IS '盘点历史事件 — 记录每次操作 (上传/修改/删除) 的变更快照';


-- ==========================================
-- 4. Warehouse Locations: Add Inventory Lock Flag
-- ==========================================
-- When has_inventory = true, the location's warehouse structure
-- cannot be modified (edit/delete blocked in WarehouseShelfUseCase).

ALTER TABLE warehouse_locations
    ADD COLUMN has_inventory BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN warehouse_locations.has_inventory IS '位置锁定 — true 表示该位置有产品放置, 不允许修改仓库结构';


-- ==========================================
-- 5. Audit Triggers for New Tables
-- ==========================================
-- Attach the existing fn_capture_changes() trigger to new tables
-- for generic change_history tracking.

CREATE TRIGGER trg_stocktake_location_details_audit
    AFTER INSERT OR UPDATE OR DELETE ON stocktake_location_details
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_warehouse_location_inventory_audit
    AFTER INSERT OR UPDATE OR DELETE ON warehouse_location_inventory
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_stocktake_events_audit
    AFTER INSERT OR UPDATE OR DELETE ON stocktake_events
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();
