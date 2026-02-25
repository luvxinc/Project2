-- =============================================================================
-- V27: Sales ETL Schema — new tables + column additions for ETL pipeline
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. raw_earnings (V1: Data_Order_Earning)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_earnings (
    id                BIGSERIAL       PRIMARY KEY,
    upload_batch_id   VARCHAR(50),
    seller            VARCHAR(100),
    order_number      VARCHAR(100),
    item_id           VARCHAR(100),
    order_date        TIMESTAMPTZ,
    buyer_name        VARCHAR(200),
    custom_label      VARCHAR(500),
    item_title        VARCHAR(500),
    shipping_labels   DECIMAL(12,2)   NOT NULL DEFAULT 0,
    row_hash          VARCHAR(64)     UNIQUE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_batch   ON raw_earnings(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_re_order   ON raw_earnings(order_number);
CREATE INDEX IF NOT EXISTS idx_re_seller  ON raw_earnings(seller);

-- ---------------------------------------------------------------------------
-- 2. sku_corrections (V1: sku_correction_memory.csv)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sku_corrections (
    id              BIGSERIAL       PRIMARY KEY,
    custom_label    VARCHAR(500)    NOT NULL,
    bad_sku         VARCHAR(100)    NOT NULL,
    bad_qty         VARCHAR(20),
    correct_sku     VARCHAR(100)    NOT NULL,
    correct_qty     VARCHAR(20),
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(custom_label, bad_sku)
);

-- ---------------------------------------------------------------------------
-- 3. etl_batches (V1: _etl_tasks in-memory dict + session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etl_batches (
    id              BIGSERIAL       PRIMARY KEY,
    batch_id        VARCHAR(50)     NOT NULL UNIQUE,
    status          VARCHAR(20)     NOT NULL DEFAULT 'uploading',
    seller          VARCHAR(100),
    date_min        DATE,
    date_max        DATE,
    fifo_ratio_re   INT             NOT NULL DEFAULT 60,
    fifo_ratio_cr   INT             NOT NULL DEFAULT 50,
    fifo_ratio_cc   INT             NOT NULL DEFAULT 30,
    progress        INT             NOT NULL DEFAULT 0,
    stage_message   TEXT,
    stats           JSONB,
    error_message   TEXT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. raw_transactions: add ETL-required columns
-- ---------------------------------------------------------------------------
ALTER TABLE raw_transactions
    ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS reference_id     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS custom_label     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS item_title       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS quantity         INT             NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description      TEXT,
    ADD COLUMN IF NOT EXISTS ship_to_city     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS ship_to_country  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS refund_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. cleaned_transactions: add fee breakdown + display columns
-- ---------------------------------------------------------------------------
ALTER TABLE cleaned_transactions
    ADD COLUMN IF NOT EXISTS quantity         INT             NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS item_title       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS full_sku         VARCHAR(500),
    ADD COLUMN IF NOT EXISTS buyer_username   VARCHAR(200),
    ADD COLUMN IF NOT EXISTS ship_to_city     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS ship_to_country  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fvf_fee          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS intl_fee         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promo_fee        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS regulatory_fee   DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispute_fee      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_cost       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_return     DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_underpay   DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_overpay    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_regular    DECIMAL(12,2)   NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 6. Deduplicate cleaned_transactions before adding unique constraint
-- ---------------------------------------------------------------------------
DELETE FROM cleaned_transactions
WHERE id NOT IN (
    SELECT MIN(id)
    FROM cleaned_transactions
    GROUP BY order_number, COALESCE(seller, ''), COALESCE(item_id, ''), action
);

-- 4D unique constraint on cleaned_transactions (core dedup)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ct_4d ON cleaned_transactions(
    order_number, COALESCE(seller, ''), COALESCE(item_id, ''), action
);
