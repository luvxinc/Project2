-- ================================================================
-- V3 Flyway Migration: Inventory Module (Complete Schema)
-- ================================================================
-- Source: V1 MySQL 30+ tables → V3 PostgreSQL 17 normalized tables
-- Architecture: v3-architecture.md §8.1 compliance
-- Audit: V1 deep-dive audit 2026-02-17
--
-- Design Decisions:
--   1. History+Final dual tables → single table + @Version + audit_log
--   2. Data_Inventory wide table (columns=dates) → row-based stocktakes
--   3. in_dynamic_landed_price → merged into fifo_layers.landed_cost
--   4. P_SKU1~10 flat columns → normalized order_items child table
--   5. VARCHAR actions/status → PostgreSQL ENUMs
--   6. No FK in V1 → Full FK constraints with ON DELETE RESTRICT
-- ================================================================

-- ==========================================
-- 0. Custom ENUM Types
-- ==========================================

CREATE TYPE purchase_action AS ENUM ('new', 'adjust', 'add', 'delete', 'restore');
CREATE TYPE shipment_status AS ENUM ('pending', 'in_transit', 'delivered', 'cancelled');
CREATE TYPE receive_diff_status AS ENUM ('pending', 'resolved');
CREATE TYPE payment_type AS ENUM ('po', 'deposit', 'logistics', 'prepay');
CREATE TYPE payment_ops AS ENUM ('new', 'adjust', 'delete');
CREATE TYPE currency_code AS ENUM ('USD', 'RMB');
CREATE TYPE exchange_rate_mode AS ENUM ('auto', 'manual');
CREATE TYPE fifo_action AS ENUM ('in', 'out');
CREATE TYPE fifo_tran_type AS ENUM ('purchase', 'sale', 'return', 'adjust', 'cancel', 'inventory');
CREATE TYPE sales_action AS ENUM ('NN', 'CA', 'RE', 'CR', 'CC', 'PD');
CREATE TYPE prepay_tran_type AS ENUM ('deposit', 'withdraw', 'usage', 'refund', 'rate');

-- ==========================================
-- 1. SUPPLIER DOMAIN (2 tables)
-- V1: in_supplier + in_supplier_strategy → V3: suppliers + supplier_strategies
-- ==========================================

CREATE TABLE suppliers (
    id              BIGSERIAL       PRIMARY KEY,
    supplier_code   VARCHAR(2)      NOT NULL UNIQUE,  -- 2-letter code, globally unique
    supplier_name   VARCHAR(100)    NOT NULL,
    status          BOOLEAN         NOT NULL DEFAULT TRUE,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,

    -- Optimistic locking (replaces V1 seq versioning)
    version         INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_suppliers_code ON suppliers(supplier_code);
COMMENT ON TABLE suppliers IS 'V1: in_supplier → 供应商主表';

-- ---

CREATE TABLE supplier_strategies (
    id                  BIGSERIAL       PRIMARY KEY,
    supplier_id         BIGINT          NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_code       VARCHAR(2)      NOT NULL,  -- denormalized for query convenience

    category            CHAR(1)         NOT NULL DEFAULT 'E',  -- E=汽配, A=亚马逊
    currency            currency_code   NOT NULL DEFAULT 'USD',
    float_currency      BOOLEAN         NOT NULL DEFAULT FALSE,
    float_threshold     DECIMAL(5,2)    NOT NULL DEFAULT 0,  -- 0-100%
    require_deposit     BOOLEAN         NOT NULL DEFAULT FALSE,
    deposit_ratio       DECIMAL(5,2)    NOT NULL DEFAULT 0,  -- 0-100%
    effective_date      DATE            NOT NULL,
    note                TEXT,
    contract_file       VARCHAR(500),

    -- §8.1 Audit
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(36),
    updated_by          VARCHAR(36),
    deleted_at          TIMESTAMPTZ,
    version             INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_supplier_strategies_supplier ON supplier_strategies(supplier_id);
CREATE INDEX idx_supplier_strategies_effective ON supplier_strategies(supplier_code, effective_date DESC);
COMMENT ON TABLE supplier_strategies IS 'V1: in_supplier_strategy → 供应商策略配置 (多版本)';


-- ==========================================
-- 2. PURCHASE ORDER DOMAIN (3 tables)
-- V1: in_po + in_po_final + in_po_strategy → V3: purchase_orders + purchase_order_items + purchase_order_strategies
--
-- KEY CHANGE: V1 used "dual table" (history + final). 
-- V3 uses single table with @Version optimistic locking.
-- History tracking via JPA Envers or application-level audit_logs.
-- ==========================================

CREATE TABLE purchase_orders (
    id              BIGSERIAL       PRIMARY KEY,
    po_num          VARCHAR(50)     NOT NULL UNIQUE,  -- e.g. XX20260103-S01
    supplier_id     BIGINT          NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_code   VARCHAR(2)      NOT NULL,          -- denormalized

    po_date         DATE            NOT NULL,           -- order date (extracted from po_num)
    status          VARCHAR(20)     NOT NULL DEFAULT 'active',  -- active / cancelled / completed

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,
    version         INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_date ON purchase_orders(po_date);
COMMENT ON TABLE purchase_orders IS 'V1: in_po + in_po_final merged → 采购订单主表';

-- ---

CREATE TABLE purchase_order_items (
    id              BIGSERIAL       PRIMARY KEY,
    po_id           BIGINT          NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    po_num          VARCHAR(50)     NOT NULL,  -- denormalized for query

    sku             VARCHAR(100)    NOT NULL,
    quantity        INT             NOT NULL DEFAULT 0,
    unit_price      DECIMAL(12,5)   NOT NULL DEFAULT 0,  -- §8.1 cost precision
    currency        currency_code   NOT NULL DEFAULT 'RMB',
    exchange_rate   DECIMAL(10,4)   NOT NULL DEFAULT 7.0,
    note            VARCHAR(500),

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,
    version         INT             NOT NULL DEFAULT 0,

    -- V1: (po_num, po_sku, po_price) was unique
    UNIQUE(po_id, sku, unit_price)
);

CREATE INDEX idx_poi_po ON purchase_order_items(po_id);
CREATE INDEX idx_poi_sku ON purchase_order_items(sku);
COMMENT ON TABLE purchase_order_items IS 'V1: in_po_final per-SKU rows → 订单明细 (每行一个SKU)';

-- ---

CREATE TABLE purchase_order_strategies (
    id              BIGSERIAL       PRIMARY KEY,
    po_id           BIGINT          NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    po_num          VARCHAR(50)     NOT NULL,

    strategy_date   DATE            NOT NULL,
    currency        currency_code   NOT NULL DEFAULT 'USD',
    exchange_rate   DECIMAL(10,4)   NOT NULL DEFAULT 7.0,
    rate_mode       exchange_rate_mode NOT NULL DEFAULT 'auto',
    float_enabled   BOOLEAN         NOT NULL DEFAULT FALSE,
    float_threshold DECIMAL(5,2)    NOT NULL DEFAULT 0,
    require_deposit BOOLEAN         NOT NULL DEFAULT FALSE,
    deposit_ratio   DECIMAL(5,2)    NOT NULL DEFAULT 0,
    note            VARCHAR(500),

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    version         INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_pos_po ON purchase_order_strategies(po_id);
COMMENT ON TABLE purchase_order_strategies IS 'V1: in_po_strategy → 订单策略 (货币/定金/汇率)';


-- ==========================================
-- 3. SHIPMENT DOMAIN (2 tables)
-- V1: in_send + in_send_list + in_send_final → V3: shipments + shipment_items
--
-- KEY CHANGE: V1 had 3 tables (send header + send_list details + send_final snapshot).
-- V3 merges to 2 tables: shipments (header) + shipment_items (details).
-- ==========================================

CREATE TABLE shipments (
    id              BIGSERIAL       PRIMARY KEY,
    logistic_num    VARCHAR(50)     NOT NULL UNIQUE,  -- 物流单号
    sent_date       DATE            NOT NULL,
    eta_date        DATE,
    pallets         INT             NOT NULL DEFAULT 0,
    logistics_cost  DECIMAL(12,2)   NOT NULL DEFAULT 0,  -- 物流费用 (RMB)
    exchange_rate   DECIMAL(10,4)   NOT NULL DEFAULT 7.0,
    status          shipment_status NOT NULL DEFAULT 'pending',
    note            VARCHAR(500),

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,
    version         INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_shipments_date ON shipments(sent_date);
COMMENT ON TABLE shipments IS 'V1: in_send → 发货单 (物流信息)';

-- ---

CREATE TABLE shipment_items (
    id              BIGSERIAL       PRIMARY KEY,
    shipment_id     BIGINT          NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    logistic_num    VARCHAR(50)     NOT NULL,          -- denormalized
    po_id           BIGINT          NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    po_num          VARCHAR(50)     NOT NULL,           -- denormalized

    sku             VARCHAR(100)    NOT NULL,
    quantity        INT             NOT NULL DEFAULT 0,
    unit_price      DECIMAL(12,5)   NOT NULL DEFAULT 0,
    po_change       BOOLEAN         NOT NULL DEFAULT FALSE,  -- V1: po_change='Y'/'N' → 是否同步修改了PO
    note            VARCHAR(500),

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,
    version         INT             NOT NULL DEFAULT 0,

    -- V1: (sent_logistic_num, po_num, po_sku, po_price) was unique
    UNIQUE(shipment_id, po_id, sku, unit_price)
);

CREATE INDEX idx_si_shipment ON shipment_items(shipment_id);
CREATE INDEX idx_si_po ON shipment_items(po_id);
CREATE INDEX idx_si_sku ON shipment_items(sku);
COMMENT ON TABLE shipment_items IS 'V1: in_send_list + in_send_final merged → 发货明细';


-- ==========================================
-- 4. RECEIVING DOMAIN (2 tables)
-- V1: in_receive + in_receive_final + in_diff + in_diff_final → V3: receives + receive_diffs
--
-- KEY CHANGE: V1 had 4 tables (receive + receive_final + diff + diff_final).
-- V3 merges to 2 tables. Diff is a child of receive.
-- ==========================================

CREATE TABLE receives (
    id              BIGSERIAL       PRIMARY KEY,
    shipment_id     BIGINT          NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    logistic_num    VARCHAR(50)     NOT NULL,          -- denormalized
    po_id           BIGINT          NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    po_num          VARCHAR(50)     NOT NULL,           -- denormalized

    sku             VARCHAR(100)    NOT NULL,
    unit_price      DECIMAL(12,5)   NOT NULL DEFAULT 0,
    sent_quantity   INT             NOT NULL DEFAULT 0,     -- from shipment
    receive_quantity INT            NOT NULL DEFAULT 0,     -- actual received
    receive_date    DATE            NOT NULL,
    eta_date        DATE,
    note            VARCHAR(500),

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    deleted_at      TIMESTAMPTZ,
    version         INT             NOT NULL DEFAULT 0,

    UNIQUE(shipment_id, po_id, sku, unit_price)
);

CREATE INDEX idx_receives_shipment ON receives(shipment_id);
CREATE INDEX idx_receives_po ON receives(po_id);
CREATE INDEX idx_receives_date ON receives(receive_date);
CREATE INDEX idx_receives_sku ON receives(sku);
COMMENT ON TABLE receives IS 'V1: in_receive + in_receive_final merged → 入库记录';

-- ---

CREATE TABLE receive_diffs (
    id              BIGSERIAL       PRIMARY KEY,
    receive_id      BIGINT          NOT NULL REFERENCES receives(id) ON DELETE RESTRICT,
    logistic_num    VARCHAR(50)     NOT NULL,          -- denormalized
    po_num          VARCHAR(50)     NOT NULL,           -- denormalized

    sku             VARCHAR(100)    NOT NULL,
    po_quantity     INT             NOT NULL DEFAULT 0,
    sent_quantity   INT             NOT NULL DEFAULT 0,
    receive_quantity INT            NOT NULL DEFAULT 0,
    diff_quantity   INT             NOT NULL DEFAULT 0,  -- sent - received
    status          receive_diff_status NOT NULL DEFAULT 'pending',
    resolution_note TEXT,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36),
    version         INT             NOT NULL DEFAULT 0
);

CREATE INDEX idx_diffs_receive ON receive_diffs(receive_id);
CREATE INDEX idx_diffs_status ON receive_diffs(status) WHERE status = 'pending';  -- partial index: only care about unresolved
COMMENT ON TABLE receive_diffs IS 'V1: in_diff + in_diff_final merged → 入库差异';


-- ==========================================
-- 5. PAYMENT DOMAIN (1 unified table)
-- V1: 8 tables (in_pmt_po/_final + in_pmt_deposit/_final + in_pmt_logistic/_final + in_pmt_prepay/_final)
-- V3: 1 unified payments table + type discriminator
--
-- KEY CHANGE: V1 had 4 payment types × 2 (history+final) = 8 tables.
-- V3 uses a single polymorphic payments table with `payment_type` discriminator.
-- ==========================================

CREATE TABLE payments (
    id                  BIGSERIAL           PRIMARY KEY,
    payment_type        payment_type        NOT NULL,  -- po / deposit / logistics / prepay
    payment_no          VARCHAR(100)        NOT NULL,  -- 付款单号

    -- Reference keys (nullable based on payment_type)
    po_id               BIGINT              REFERENCES purchase_orders(id),
    po_num              VARCHAR(50),
    shipment_id         BIGINT              REFERENCES shipments(id),
    logistic_num        VARCHAR(50),
    supplier_id         BIGINT              REFERENCES suppliers(id),
    supplier_code       VARCHAR(2),

    -- Amount fields
    payment_date        DATE                NOT NULL,
    currency            currency_code       NOT NULL DEFAULT 'USD',
    cash_amount         DECIMAL(12,2)       NOT NULL DEFAULT 0,
    prepay_amount       DECIMAL(12,2)       NOT NULL DEFAULT 0,   -- 预付款抵扣
    exchange_rate       DECIMAL(10,4)       NOT NULL DEFAULT 7.0,
    rate_mode           exchange_rate_mode  NOT NULL DEFAULT 'auto',

    -- Extra fees
    extra_amount        DECIMAL(12,2)       NOT NULL DEFAULT 0,
    extra_currency      currency_code,
    extra_note          VARCHAR(255),

    -- Prepay specific
    prepay_tran_type    prepay_tran_type,  -- only for payment_type='prepay': deposit/withdraw/usage/refund/rate

    -- Deposit specific
    deposit_override    BOOLEAN             DEFAULT FALSE,  -- 是否覆盖原策略定金

    note                TEXT,

    -- §8.1 Audit
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(36),
    updated_by          VARCHAR(36),
    deleted_at          TIMESTAMPTZ,
    version             INT                 NOT NULL DEFAULT 0,

    UNIQUE(payment_type, payment_no)
);

CREATE INDEX idx_payments_type ON payments(payment_type);
CREATE INDEX idx_payments_po ON payments(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX idx_payments_shipment ON payments(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX idx_payments_supplier ON payments(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_payments_date ON payments(payment_date);
COMMENT ON TABLE payments IS 'V1: 8 payment tables merged → 统一付款表 (type区分)';


-- ==========================================
-- 6. INVENTORY / FIFO DOMAIN (4 tables)
-- V1: Data_Inventory (wide!) + in_dynamic_tran + in_dynamic_fifo_layers + in_dynamic_fifo_alloc + in_dynamic_landed_price
-- V3: stocktakes/stocktake_items (row-based!) + fifo_transactions + fifo_layers + fifo_allocations
--
-- KEY CHANGES:
--   a) Data_Inventory wide table (columns=dates) → row-based stocktakes + stocktake_items
--   b) in_dynamic_landed_price merged INTO fifo_layers.landed_cost
--   c) Full FK constraints + partial indexes
-- ==========================================

-- 6a. Stocktakes: Row-based inventory snapshots
--     V1: Data_Inventory had `SKU | 2025-01-15 | 2025-02-15 | ...` (columns!)
--     V3: Each stocktake is a row in stocktakes, items in stocktake_items

CREATE TABLE stocktakes (
    id              BIGSERIAL       PRIMARY KEY,
    stocktake_date  DATE            NOT NULL UNIQUE,    -- one stocktake per date
    note            TEXT,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(36),
    updated_by      VARCHAR(36)
);

CREATE INDEX idx_stocktakes_date ON stocktakes(stocktake_date DESC);
COMMENT ON TABLE stocktakes IS 'V1: Data_Inventory wide table → 盘点主表 (每次盘点一行)';

-- ---

CREATE TABLE stocktake_items (
    id              BIGSERIAL       PRIMARY KEY,
    stocktake_id    BIGINT          NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    sku             VARCHAR(100)    NOT NULL,
    counted_qty     INT             NOT NULL DEFAULT 0,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE(stocktake_id, sku)  -- one entry per SKU per stocktake
);

CREATE INDEX idx_sti_stocktake ON stocktake_items(stocktake_id);
CREATE INDEX idx_sti_sku ON stocktake_items(sku);
COMMENT ON TABLE stocktake_items IS 'V1: Data_Inventory columns → 盘点明细 (每SKU一行)';

-- 6b. FIFO Transaction Ledger

CREATE TABLE fifo_transactions (
    id              BIGSERIAL       PRIMARY KEY,
    transaction_date TIMESTAMPTZ    NOT NULL,
    sku             VARCHAR(100)    NOT NULL,
    po_num          VARCHAR(50),               -- NULL for sales/adjustments
    unit_price      DECIMAL(12,5)   NOT NULL DEFAULT 0,
    quantity        INT             NOT NULL DEFAULT 0,
    action          fifo_action     NOT NULL,  -- 'in' / 'out'
    tran_type       fifo_tran_type  NOT NULL DEFAULT 'purchase',  -- purchase/sale/return/adjust/cancel/inventory
    ref_key         TEXT,                      -- idempotency key (e.g. SALES:seller:order:item:action)
    note            TEXT,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ft_sku ON fifo_transactions(sku);
CREATE INDEX idx_ft_date ON fifo_transactions(transaction_date);
CREATE INDEX idx_ft_action ON fifo_transactions(action, tran_type);
CREATE INDEX idx_ft_ref ON fifo_transactions(ref_key) WHERE ref_key IS NOT NULL;  -- idempotency check
CREATE INDEX idx_ft_po ON fifo_transactions(po_num) WHERE po_num IS NOT NULL;
COMMENT ON TABLE fifo_transactions IS 'V1: in_dynamic_tran → FIFO 库存流水';

-- 6c. FIFO Layers
--     KEY CHANGE: landed_cost merged from V1 in_dynamic_landed_price table

CREATE TABLE fifo_layers (
    id              BIGSERIAL       PRIMARY KEY,
    sku             VARCHAR(100)    NOT NULL,
    in_tran_id      BIGINT          NOT NULL REFERENCES fifo_transactions(id) ON DELETE RESTRICT,
    in_date         TIMESTAMPTZ     NOT NULL,
    po_num          VARCHAR(50),

    unit_cost       DECIMAL(12,5)   NOT NULL,          -- 采购单价
    landed_cost     DECIMAL(12,5),                     -- V1: was in separate in_dynamic_landed_price table → 含运费完整成本 (USD)
    qty_in          INT             NOT NULL,           -- 初始入库量
    qty_remaining   INT             NOT NULL,           -- 剩余可用量

    closed_at       TIMESTAMPTZ,                       -- qty_remaining = 0 时设置

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- 🔴 CRITICAL: Partial index — only index active (non-exhausted) layers
-- This is the most frequently queried path: "find available layers for FIFO allocation"
CREATE INDEX idx_fl_sku_active ON fifo_layers(sku, in_date ASC) WHERE qty_remaining > 0;
CREATE INDEX idx_fl_sku ON fifo_layers(sku);
CREATE INDEX idx_fl_po ON fifo_layers(po_num) WHERE po_num IS NOT NULL;
COMMENT ON TABLE fifo_layers IS 'V1: in_dynamic_fifo_layers + in_dynamic_landed_price merged → FIFO 库存层';

-- 6d. FIFO Allocations

CREATE TABLE fifo_allocations (
    id              BIGSERIAL       PRIMARY KEY,
    out_tran_id     BIGINT          NOT NULL REFERENCES fifo_transactions(id) ON DELETE RESTRICT,
    layer_id        BIGINT          NOT NULL REFERENCES fifo_layers(id) ON DELETE RESTRICT,
    sku             VARCHAR(100)    NOT NULL,
    out_date        TIMESTAMPTZ     NOT NULL,

    qty_alloc       INT             NOT NULL,           -- 从该层扣除的数量
    unit_cost       DECIMAL(12,5)   NOT NULL,           -- 该层成本单价
    cost_alloc      DECIMAL(12,5)   NOT NULL,           -- 分摊成本 (qty × unit_cost)

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fa_out ON fifo_allocations(out_tran_id);
CREATE INDEX idx_fa_layer ON fifo_allocations(layer_id);
CREATE INDEX idx_fa_sku ON fifo_allocations(sku);
COMMENT ON TABLE fifo_allocations IS 'V1: in_dynamic_fifo_alloc → FIFO 分摊明细';


-- ==========================================
-- 7. SALES / ETL DOMAIN (3 tables)
-- V1: Data_Transaction + Data_Order_Earning + Data_Clean_Log → V3: raw_transactions + raw_transaction_items + cleaned_transactions
--
-- KEY CHANGE: V1 Data_Transaction had P_SKU1~10, P_Quantity1~10 flat columns.
-- V3: normalized into raw_transactions (header) + raw_transaction_items (details).
-- ==========================================

CREATE TABLE raw_transactions (
    id              BIGSERIAL       PRIMARY KEY,
    source          VARCHAR(20)     NOT NULL DEFAULT 'ebay',  -- ebay / amazon / manual
    upload_batch_id VARCHAR(50),                              -- ETL batch tracking

    -- Order header
    seller          VARCHAR(100),
    order_number    VARCHAR(100),
    item_id         VARCHAR(100),
    order_date      TIMESTAMPTZ,
    buyer           VARCHAR(200),

    -- Financial
    sale_amount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
    shipping_fee    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    total_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,

    -- Raw eBay fields (preserve original data)
    net_amount      TEXT,
    ad_fee          TEXT,
    promo_listing   TEXT,
    listing_fee     TEXT,
    intl_fee        TEXT,
    other_fee       TEXT,

    -- Dedup
    row_hash        VARCHAR(64)     UNIQUE,  -- V1: _row_hash → PG native UNIQUE constraint

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rt_order ON raw_transactions(order_number);
CREATE INDEX idx_rt_batch ON raw_transactions(upload_batch_id) WHERE upload_batch_id IS NOT NULL;
COMMENT ON TABLE raw_transactions IS 'V1: Data_Transaction → eBay 交易原始数据 (header)';

-- ---

CREATE TABLE raw_transaction_items (
    id              BIGSERIAL       PRIMARY KEY,
    transaction_id  BIGINT          NOT NULL REFERENCES raw_transactions(id) ON DELETE CASCADE,

    sku             VARCHAR(100)    NOT NULL,
    quantity        INT             NOT NULL DEFAULT 0,
    unit_price      DECIMAL(12,5)   NOT NULL DEFAULT 0,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rti_txn ON raw_transaction_items(transaction_id);
CREATE INDEX idx_rti_sku ON raw_transaction_items(sku);
COMMENT ON TABLE raw_transaction_items IS 'V1: P_SKU1~10 flat columns → 交易明细 (正规化)';

-- ---

CREATE TABLE cleaned_transactions (
    id              BIGSERIAL       PRIMARY KEY,

    -- Order identification
    seller          VARCHAR(100),
    order_number    VARCHAR(100),
    item_id         VARCHAR(100),
    order_date      TIMESTAMPTZ     NOT NULL,
    action          sales_action    NOT NULL,  -- NN/CA/RE/CR/CC/PD (V1: VARCHAR → PG ENUM)

    -- SKU breakdown (up to 10, now properly typed)
    sku1            VARCHAR(100),
    quantity1       INT             DEFAULT 0,
    qtyp1           INT             DEFAULT 0,
    sku2            VARCHAR(100),
    quantity2       INT             DEFAULT 0,
    qtyp2           INT             DEFAULT 0,
    sku3            VARCHAR(100),
    quantity3       INT             DEFAULT 0,
    qtyp3           INT             DEFAULT 0,
    sku4            VARCHAR(100),
    quantity4       INT             DEFAULT 0,
    qtyp4           INT             DEFAULT 0,
    sku5            VARCHAR(100),
    quantity5       INT             DEFAULT 0,
    qtyp5           INT             DEFAULT 0,
    sku6            VARCHAR(100),
    quantity6       INT             DEFAULT 0,
    qtyp6           INT             DEFAULT 0,
    sku7            VARCHAR(100),
    quantity7       INT             DEFAULT 0,
    qtyp7           INT             DEFAULT 0,
    sku8            VARCHAR(100),
    quantity8       INT             DEFAULT 0,
    qtyp8           INT             DEFAULT 0,
    sku9            VARCHAR(100),
    quantity9       INT             DEFAULT 0,
    qtyp9           INT             DEFAULT 0,
    sku10           VARCHAR(100),
    quantity10      INT             DEFAULT 0,
    qtyp10          INT             DEFAULT 0,

    -- Financial (all DECIMAL, never TEXT!)
    sale_amount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
    shipping_fee    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    net_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ad_fee          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    other_fee       DECIMAL(12,2)   NOT NULL DEFAULT 0,

    -- Dedup
    row_hash        VARCHAR(64)     UNIQUE,

    -- §8.1 Audit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ct_date ON cleaned_transactions(order_date);
CREATE INDEX idx_ct_action ON cleaned_transactions(action);
CREATE INDEX idx_ct_seller ON cleaned_transactions(seller);
CREATE INDEX idx_ct_order ON cleaned_transactions(order_number);
CREATE INDEX idx_ct_sku1 ON cleaned_transactions(sku1) WHERE sku1 IS NOT NULL;
COMMENT ON TABLE cleaned_transactions IS 'V1: Data_Clean_Log → 清洗后交易明细';


-- ==========================================
-- 8. MATERIALIZED VIEW: Dynamic Inventory
-- Replaces V1 dynamic_inv.py's 300-line query assembly with a precomputed view
-- ==========================================

CREATE MATERIALIZED VIEW mv_dynamic_inventory AS
SELECT
    p.sku,

    -- Theory qty: sum of remaining FIFO layers
    COALESCE(fl.theory_qty, 0) AS theory_qty,

    -- Avg cost: weighted average of remaining layers
    COALESCE(fl.avg_cost, 0) AS avg_cost,

    -- Current cost: oldest active layer cost (FIFO front)
    COALESCE(fl.current_cost, 0) AS current_cost,

    -- Inventory value: sum(qty_remaining × COALESCE(landed_cost, unit_cost))
    COALESCE(fl.inv_value, 0) AS inv_value,

    -- Order qty: PO qty - shipped qty
    GREATEST(0, COALESCE(po_agg.po_qty, 0) - COALESCE(ship_agg.shipped_qty, 0)) AS order_qty,

    -- Transit qty: shipped qty - received qty
    GREATEST(0, COALESCE(ship_agg.shipped_qty, 0) - COALESCE(recv_agg.received_qty, 0)) AS transit_qty

FROM public.products p  -- product master table (SKU authority, from V1__baseline)

LEFT JOIN LATERAL (
    SELECT
        SUM(qty_remaining) AS theory_qty,
        CASE WHEN SUM(qty_remaining) > 0
             THEN SUM(qty_remaining * COALESCE(landed_cost, unit_cost)) / SUM(qty_remaining)
             ELSE 0 END AS avg_cost,
        (SELECT COALESCE(landed_cost, unit_cost) FROM fifo_layers
         WHERE sku = p.sku AND qty_remaining > 0
         ORDER BY in_date ASC LIMIT 1) AS current_cost,
        SUM(qty_remaining * COALESCE(landed_cost, unit_cost)) AS inv_value
    FROM fifo_layers WHERE sku = p.sku AND qty_remaining > 0
) fl ON TRUE

LEFT JOIN LATERAL (
    SELECT SUM(poi.quantity) AS po_qty
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.po_id = po.id
    WHERE poi.sku = p.sku AND po.deleted_at IS NULL
) po_agg ON TRUE

LEFT JOIN LATERAL (
    SELECT SUM(si.quantity) AS shipped_qty
    FROM shipment_items si
    JOIN shipments s ON si.shipment_id = s.id
    WHERE si.sku = p.sku AND s.deleted_at IS NULL
) ship_agg ON TRUE

LEFT JOIN LATERAL (
    SELECT SUM(r.receive_quantity) AS received_qty
    FROM receives r
    WHERE r.sku = p.sku AND r.deleted_at IS NULL
) recv_agg ON TRUE

WHERE p.deleted_at IS NULL;

CREATE UNIQUE INDEX idx_mv_di_sku ON mv_dynamic_inventory(sku);
COMMENT ON MATERIALIZED VIEW mv_dynamic_inventory IS 'Precomputed dynamic inventory — refresh periodically or after FIFO mutations';


-- ==========================================
-- 9. AUDIT: Change History Trigger (Optional — alternative to JPA Envers)
-- Generic trigger that logs all INSERT/UPDATE/DELETE on key tables
-- ==========================================

CREATE TABLE change_history (
    id              BIGSERIAL       PRIMARY KEY,
    table_name      VARCHAR(63)     NOT NULL,
    record_id       BIGINT          NOT NULL,
    operation       CHAR(1)         NOT NULL,  -- I=insert, U=update, D=delete
    old_data        JSONB,
    new_data        JSONB,
    changed_by      VARCHAR(36),
    changed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ch_table ON change_history(table_name, record_id);
CREATE INDEX idx_ch_date ON change_history(changed_at);
COMMENT ON TABLE change_history IS 'V1: History tables (in_po etc.) replaced by generic audit log';

-- Trigger function for auto-capturing changes
CREATE OR REPLACE FUNCTION fn_capture_changes() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_history(table_name, record_id, operation, new_data, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id, 'I', to_jsonb(NEW), NOW());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_history(table_name, record_id, operation, old_data, new_data, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id, 'U', to_jsonb(OLD), to_jsonb(NEW), NOW());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_history(table_name, record_id, operation, old_data, changed_at)
        VALUES (TG_TABLE_NAME, OLD.id, 'D', to_jsonb(OLD), NOW());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to critical tables (the ones that replaced V1 dual-table pattern)
CREATE TRIGGER trg_purchase_orders_audit AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_purchase_order_items_audit AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_shipment_items_audit AFTER INSERT OR UPDATE OR DELETE ON shipment_items
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_receives_audit AFTER INSERT OR UPDATE OR DELETE ON receives
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_payments_audit AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();

CREATE TRIGGER trg_fifo_layers_audit AFTER INSERT OR UPDATE OR DELETE ON fifo_layers
    FOR EACH ROW EXECUTE FUNCTION fn_capture_changes();
