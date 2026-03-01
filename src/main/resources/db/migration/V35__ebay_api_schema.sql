-- ═══════════════════════════════════════════════════════════════
-- V35: eBay API 原生数据 Schema (沙盒验证系统)
-- ═══════════════════════════════════════════════════════════════
-- 🔴 所有表在独立 schema `ebay_api` 中，与 public 物理隔离
-- 🔴 不触碰 public.* 任何表
-- ═══════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS ebay_api;

-- ─────────────────────────────────────────────────────────────
-- 1. Finances API — getTransactions 主表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.fin_transactions (
    id                          BIGSERIAL       PRIMARY KEY,

    -- API 原生字段 (100% 保留 getTransactions 返回)
    transaction_id              VARCHAR(100)    NOT NULL,
    transaction_type            VARCHAR(50)     NOT NULL,       -- SALE/REFUND/CREDIT/NON_SALE_CHARGE/SHIPPING_LABEL/TRANSFER/DISPUTE
    transaction_status          VARCHAR(50),                    -- PAYOUT/FUNDS_ON_HOLD/FAILED
    transaction_date            TIMESTAMPTZ     NOT NULL,
    transaction_memo            TEXT,                           -- description / reason

    -- Order / Payout reference
    order_id                    VARCHAR(100),
    payout_id                   VARCHAR(100),

    -- Buyer
    buyer_username              VARCHAR(200),

    -- Amounts
    amount_value                DECIMAL(12,2),                  -- net to seller (after fees)
    amount_currency             VARCHAR(10),

    total_fee_basis_amount      DECIMAL(12,2),                  -- gross (before fees)
    total_fee_basis_currency    VARCHAR(10),

    total_fee_amount            DECIMAL(12,2),                  -- total fees deducted
    total_fee_currency          VARCHAR(10),

    -- Tax
    ebay_collected_tax_amount   DECIMAL(12,2)   DEFAULT 0,
    ebay_collected_tax_currency VARCHAR(10),

    -- Booking direction
    booking_entry               VARCHAR(10),                    -- CREDIT / DEBIT

    -- Transfer (for TRANSFER type)
    transfer_id                 VARCHAR(100),

    -- Nested structures preserved as JSONB
    references_json             JSONB,                          -- references[] array
    order_line_items_json       JSONB,                          -- orderLineItems[] with feeBasisAmount etc.

    -- Sync metadata
    api_fetched_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    sync_batch_id               VARCHAR(50),
    seller_username             VARCHAR(100),                   -- which seller account this belongs to

    CONSTRAINT uq_fin_txn_id UNIQUE(transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_txn_order   ON ebay_api.fin_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_type    ON ebay_api.fin_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_fin_txn_date    ON ebay_api.fin_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_fin_txn_payout  ON ebay_api.fin_transactions(payout_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_seller  ON ebay_api.fin_transactions(seller_username);

COMMENT ON TABLE  ebay_api.fin_transactions IS 'eBay Finances API getTransactions — 完整保留 API 返回';
COMMENT ON COLUMN ebay_api.fin_transactions.amount_value IS 'API: amount.value — 卖家净收入 (扣费后)';
COMMENT ON COLUMN ebay_api.fin_transactions.total_fee_basis_amount IS 'API: totalFeeBasisAmount.value — 交易总额 (扣费前)';
COMMENT ON COLUMN ebay_api.fin_transactions.order_line_items_json IS 'API: orderLineItems[] — 保留完整嵌套结构含 marketplaceFees[]';


-- ─────────────────────────────────────────────────────────────
-- 2. Finances API — 费用明细子表 (从 orderLineItems[].marketplaceFees[] 拆出)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.fin_transaction_fees (
    id                          BIGSERIAL       PRIMARY KEY,
    transaction_id              VARCHAR(100)    NOT NULL,
    line_item_id                VARCHAR(100),

    fee_type                    VARCHAR(100)    NOT NULL,       -- FINAL_VALUE_FEE / FINAL_VALUE_FEE_FIXED_PER_ORDER / AD_FEE / etc.
    fee_amount                  DECIMAL(12,2)   NOT NULL,
    fee_currency                VARCHAR(10),

    fee_basis_amount            DECIMAL(12,2),                  -- feeBasisAmount.value (fee calculated on this)
    fee_basis_currency          VARCHAR(10),

    CONSTRAINT fk_fee_txn FOREIGN KEY (transaction_id)
        REFERENCES ebay_api.fin_transactions(transaction_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fin_fee_txn  ON ebay_api.fin_transaction_fees(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fin_fee_type ON ebay_api.fin_transaction_fees(fee_type);

COMMENT ON TABLE ebay_api.fin_transaction_fees IS '费用明细 — 每个 feeType 一行, 从 API marketplaceFees[] 拆出';


-- ─────────────────────────────────────────────────────────────
-- 3. Fulfillment API — getOrders 主表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.ful_orders (
    id                          BIGSERIAL       PRIMARY KEY,

    -- Order identification
    order_id                    VARCHAR(100)    NOT NULL,
    legacy_order_id             VARCHAR(100),
    creation_date               TIMESTAMPTZ     NOT NULL,
    last_modified_date          TIMESTAMPTZ,

    -- Status
    order_fulfillment_status    VARCHAR(50),                    -- FULFILLED / NOT_STARTED / IN_PROGRESS
    order_payment_status        VARCHAR(50),                    -- PAID / FULLY_REFUNDED / PARTIALLY_REFUNDED
    cancel_status               VARCHAR(50),

    -- Buyer
    buyer_username              VARCHAR(200),
    buyer_full_name             VARCHAR(300),

    -- Ship To (from fulfillmentStartInstructions[0].shippingStep.shipTo)
    ship_to_name                VARCHAR(300),
    ship_to_address_line1       TEXT,
    ship_to_address_line2       TEXT,
    ship_to_city                VARCHAR(200),
    ship_to_state               VARCHAR(100),
    ship_to_postal_code         VARCHAR(50),
    ship_to_country_code        VARCHAR(10),
    ship_to_phone               VARCHAR(50),

    -- Pricing summary
    price_subtotal              DECIMAL(12,2)   DEFAULT 0,
    price_discount              DECIMAL(12,2)   DEFAULT 0,
    delivery_cost               DECIMAL(12,2)   DEFAULT 0,
    delivery_discount           DECIMAL(12,2)   DEFAULT 0,
    tax                         DECIMAL(12,2)   DEFAULT 0,
    total                       DECIMAL(12,2)   DEFAULT 0,
    price_currency              VARCHAR(10),

    -- Payment summary
    total_due_seller            DECIMAL(12,2)   DEFAULT 0,
    total_marketplace_fee       DECIMAL(12,2)   DEFAULT 0,

    -- Complex nested data preserved as JSONB
    refunds_json                JSONB,                          -- paymentSummary.refunds[]
    payments_json               JSONB,                          -- paymentSummary.payments[]
    fulfillment_hrefs_json      JSONB,                          -- fulfillmentHrefs[]

    -- Sales record
    sales_record_ref            VARCHAR(50),
    seller_id                   VARCHAR(100),

    -- Full raw JSON (保险 — 保留 API 返回的 100%)
    raw_json                    JSONB,

    -- Sync metadata
    api_fetched_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    sync_batch_id               VARCHAR(50),
    seller_username             VARCHAR(100),

    CONSTRAINT uq_ful_order_id UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_ful_ord_date   ON ebay_api.ful_orders(creation_date);
CREATE INDEX IF NOT EXISTS idx_ful_ord_buyer  ON ebay_api.ful_orders(buyer_username);
CREATE INDEX IF NOT EXISTS idx_ful_ord_status ON ebay_api.ful_orders(order_fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_ful_ord_seller ON ebay_api.ful_orders(seller_username);

COMMENT ON TABLE  ebay_api.ful_orders IS 'eBay Fulfillment API getOrders — 完整保留 API 返回';
COMMENT ON COLUMN ebay_api.ful_orders.raw_json IS '完整 API 响应 JSON, 作为数据完整性保险';


-- ─────────────────────────────────────────────────────────────
-- 4. Fulfillment API — 订单行项目子表 (从 lineItems[] 拆出)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.ful_order_items (
    id                          BIGSERIAL       PRIMARY KEY,
    order_id                    VARCHAR(100)    NOT NULL,

    -- Line item identification
    line_item_id                VARCHAR(100)    NOT NULL,
    legacy_item_id              VARCHAR(100),
    legacy_variation_id         VARCHAR(100),

    -- Item details
    title                       VARCHAR(500),
    sku                         VARCHAR(500),                   -- Custom Label (最关键!)
    quantity                    INT             NOT NULL DEFAULT 0,

    -- Pricing
    line_item_cost              DECIMAL(12,2)   DEFAULT 0,
    discounted_line_item_cost   DECIMAL(12,2)   DEFAULT 0,
    line_item_currency          VARCHAR(10),

    -- Tax on this item
    ebay_collect_and_remit_tax  DECIMAL(12,2)   DEFAULT 0,

    -- Properties
    sold_via_ad_campaign        BOOLEAN         DEFAULT FALSE,

    -- Condition
    condition_id                VARCHAR(50),
    condition_description       VARCHAR(200),

    -- Marketplace
    listing_marketplace_id      VARCHAR(50),
    purchase_marketplace_id     VARCHAR(50),
    sold_format                 VARCHAR(50),                    -- FIXED_PRICE / AUCTION

    -- Complex nested (promotions, taxes detail)
    applied_promotions_json     JSONB,
    taxes_json                  JSONB,
    delivery_cost_json          JSONB,                          -- per-item delivery cost if present

    CONSTRAINT fk_item_order FOREIGN KEY (order_id)
        REFERENCES ebay_api.ful_orders(order_id) ON DELETE CASCADE,
    CONSTRAINT uq_ful_item UNIQUE(order_id, line_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ful_item_order  ON ebay_api.ful_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ful_item_sku    ON ebay_api.ful_order_items(sku);
CREATE INDEX IF NOT EXISTS idx_ful_item_legacy ON ebay_api.ful_order_items(legacy_item_id);

COMMENT ON TABLE  ebay_api.ful_order_items IS '订单行项目 — 每个 lineItem 一行';
COMMENT ON COLUMN ebay_api.ful_order_items.sku IS 'API: lineItems[].sku — 对应 CSV 的 Custom Label';


-- ─────────────────────────────────────────────────────────────
-- 5. Finances API — getPayouts 打款记录
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.fin_payouts (
    id                          BIGSERIAL       PRIMARY KEY,
    payout_id                   VARCHAR(100)    NOT NULL,
    payout_status               VARCHAR(50),                    -- SUCCEEDED / INITIATED / REVERSED / RETRYABLE_FAILURE
    payout_date                 TIMESTAMPTZ,

    amount_value                DECIMAL(12,2),
    amount_currency             VARCHAR(10),

    payout_instrument_type      VARCHAR(50),                    -- BANK
    payout_memo                 TEXT,

    bank_name                   VARCHAR(200),                   -- payoutInstrument.bankName (if available)
    last4_digits                VARCHAR(4),                     -- payoutInstrument.last4Digits

    raw_json                    JSONB,

    api_fetched_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    seller_username             VARCHAR(100),

    CONSTRAINT uq_fin_payout_id UNIQUE(payout_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pay_date   ON ebay_api.fin_payouts(payout_date);
CREATE INDEX IF NOT EXISTS idx_fin_pay_seller ON ebay_api.fin_payouts(seller_username);


-- ─────────────────────────────────────────────────────────────
-- 6. 沙盒影子表 — 结构克隆自 public.cleaned_transactions
--    🔴 仅用于验证对比, 不接入 FIFO
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.cleaned_transactions (
    id                  BIGSERIAL       PRIMARY KEY,
    seller              VARCHAR(100),
    order_number        VARCHAR(100),
    item_id             VARCHAR(100),
    order_date          TIMESTAMPTZ     NOT NULL,
    action              VARCHAR(10)     NOT NULL,               -- NN/CA/RE/CR/CC/PD (text, not enum)
    quantity            INT             NOT NULL DEFAULT 0,
    item_title          VARCHAR(500),
    full_sku            VARCHAR(500),
    buyer_username      VARCHAR(200),
    ship_to_city        VARCHAR(200),
    ship_to_country     VARCHAR(100),
    sale_amount         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    shipping_fee        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    tax_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    seller_tax          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ebay_tax            DECIMAL(12,2)   NOT NULL DEFAULT 0,
    net_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    ad_fee              DECIMAL(12,2)   NOT NULL DEFAULT 0,
    other_fee           DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fvf_fee             DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fvf_fee_fixed       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fvf_fee_variable    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    intl_fee            DECIMAL(12,2)   NOT NULL DEFAULT 0,
    promo_fee           DECIMAL(12,2)   NOT NULL DEFAULT 0,
    regulatory_fee      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    dispute_fee         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    refund_amount       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    label_cost          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    label_return        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    label_underpay      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    label_overpay       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    label_regular       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    -- SKU slots (match public.cleaned_transactions 1:1)
    sku1                VARCHAR(100),
    quantity1           INT DEFAULT 0,
    qtyp1               INT DEFAULT 0,
    sku2                VARCHAR(100),
    quantity2           INT DEFAULT 0,
    qtyp2               INT DEFAULT 0,
    sku3                VARCHAR(100),
    quantity3           INT DEFAULT 0,
    qtyp3               INT DEFAULT 0,
    sku4                VARCHAR(100),
    quantity4           INT DEFAULT 0,
    qtyp4               INT DEFAULT 0,
    sku5                VARCHAR(100),
    quantity5           INT DEFAULT 0,
    qtyp5               INT DEFAULT 0,
    sku6                VARCHAR(100),
    quantity6           INT DEFAULT 0,
    qtyp6               INT DEFAULT 0,
    sku7                VARCHAR(100),
    quantity7           INT DEFAULT 0,
    qtyp7               INT DEFAULT 0,
    sku8                VARCHAR(100),
    quantity8           INT DEFAULT 0,
    qtyp8               INT DEFAULT 0,
    sku9                VARCHAR(100),
    quantity9           INT DEFAULT 0,
    qtyp9               INT DEFAULT 0,
    sku10               VARCHAR(100),
    quantity10          INT DEFAULT 0,
    qtyp10              INT DEFAULT 0,
    row_hash            VARCHAR(64),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- 4D 唯一约束 (和 public.cleaned_transactions 一致)
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_cleaned_4d ON ebay_api.cleaned_transactions(
    order_number, COALESCE(seller, ''), COALESCE(item_id, ''), action
);

CREATE INDEX IF NOT EXISTS idx_api_cleaned_date   ON ebay_api.cleaned_transactions(order_date);
CREATE INDEX IF NOT EXISTS idx_api_cleaned_seller ON ebay_api.cleaned_transactions(seller);
CREATE INDEX IF NOT EXISTS idx_api_cleaned_action ON ebay_api.cleaned_transactions(action);

COMMENT ON TABLE ebay_api.cleaned_transactions IS '沙盒影子表 — 从 API Transform 输出, 仅用于与 public.cleaned_transactions 对比验证';


-- ─────────────────────────────────────────────────────────────
-- 7. API 同步批次追踪表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.sync_batches (
    id                  BIGSERIAL       PRIMARY KEY,
    batch_id            VARCHAR(50)     NOT NULL UNIQUE,
    status              VARCHAR(30)     NOT NULL DEFAULT 'started',  -- started/fetching/transforming/validating/done/failed
    seller_username     VARCHAR(100),
    date_from           TIMESTAMPTZ,
    date_to             TIMESTAMPTZ,
    transactions_fetched INT DEFAULT 0,
    orders_fetched      INT DEFAULT 0,
    cleaned_produced    INT DEFAULT 0,
    validation_match_pct DECIMAL(5,2),                         -- 对比匹配率
    error_message       TEXT,
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    progress            INT             DEFAULT 0,
    stage_message       TEXT
);


-- ─────────────────────────────────────────────────────────────
-- 8. OAuth 卖家账户管理表
--    🔴 优先级最高 — 必须先认证才能拉取数据
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ebay_api.seller_accounts (
    id                  BIGSERIAL       PRIMARY KEY,
    seller_username     VARCHAR(100)    NOT NULL UNIQUE,        -- eBay 用户名 (espartsplus / esparts88)
    display_name        VARCHAR(200),                           -- 显示名称 (Eaglestar Store etc.)
    
    -- OAuth Application Credentials (from eBay Developer Program)
    client_id           VARCHAR(200)    NOT NULL,               -- eBay App ID
    client_secret       VARCHAR(200)    NOT NULL,               -- eBay Cert ID (应加密存储)
    redirect_uri        VARCHAR(500),                           -- RuName for OAuth redirect
    
    -- OAuth User Token (per-seller authorization)
    refresh_token       TEXT,                                   -- 长期 Refresh Token (18 months)
    access_token        TEXT,                                   -- 短期 Access Token (2 hours)
    token_expiry        TIMESTAMPTZ,                            -- Access Token 过期时间
    token_scopes        TEXT,                                   -- 授权的 scope 列表 (空格分隔)
    
    -- Status
    status              VARCHAR(30)     NOT NULL DEFAULT 'pending',  -- pending/authorized/expired/revoked
    last_sync_at        TIMESTAMPTZ,                            -- 最后一次数据同步时间
    
    -- Environment
    environment         VARCHAR(20)     NOT NULL DEFAULT 'PRODUCTION', -- PRODUCTION / SANDBOX
    
    -- Audit
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100)
);

COMMENT ON TABLE ebay_api.seller_accounts IS 'eBay OAuth 卖家账户 — 每个 seller 独立认证, 支持多店铺';
COMMENT ON COLUMN ebay_api.seller_accounts.refresh_token IS 'eBay Refresh Token (18个月有效期), 生产环境应加密存储';
COMMENT ON COLUMN ebay_api.seller_accounts.client_secret IS 'eBay Cert ID — 敏感凭证, 生产环境应加密存储';

