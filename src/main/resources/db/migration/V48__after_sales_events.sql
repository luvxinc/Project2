CREATE TABLE IF NOT EXISTS ebay_api.after_sales_events (
  id             BIGSERIAL PRIMARY KEY,
  event_type     VARCHAR(50) NOT NULL,      -- CANCELLATION, RETURN, CASE, INQUIRY
  event_id       VARCHAR(100) NOT NULL,
  order_id       VARCHAR(100),
  legacy_order_id VARCHAR(100),
  seller_username VARCHAR(100),
  buyer_username  VARCHAR(200),
  item_id        VARCHAR(100),
  sku            VARCHAR(500),
  title          VARCHAR(500),
  quantity       INT,
  reason         TEXT,
  status         VARCHAR(50),
  amount         DECIMAL(12,2),
  currency       VARCHAR(10) DEFAULT 'USD',
  raw_json       JSONB,
  webhook_source VARCHAR(20) DEFAULT 'API',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_type, event_id)
);
CREATE INDEX idx_after_sales_seller ON ebay_api.after_sales_events(seller_username);
CREATE INDEX idx_after_sales_type ON ebay_api.after_sales_events(event_type);
CREATE INDEX idx_after_sales_order ON ebay_api.after_sales_events(order_id);
CREATE INDEX idx_after_sales_created ON ebay_api.after_sales_events(created_at DESC);
