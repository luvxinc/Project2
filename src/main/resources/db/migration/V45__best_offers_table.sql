-- V45: Best Offers table for persisting eBay buyer-initiated offers
-- Stores webhook-received offers so they can be displayed in the UI
-- even after the SSE event has been consumed.

CREATE TABLE IF NOT EXISTS ebay_api.best_offers (
    id                  BIGSERIAL       PRIMARY KEY,
    best_offer_id       VARCHAR(64)     NOT NULL UNIQUE,
    item_id             VARCHAR(64)     NOT NULL,
    seller              VARCHAR(64),
    buyer_user_id       VARCHAR(128),
    buyer_email         VARCHAR(256),
    offer_price         NUMERIC(12,2),
    offer_currency      VARCHAR(8)      NOT NULL DEFAULT 'USD',
    buy_it_now_price    NUMERIC(12,2),
    quantity            INT             NOT NULL DEFAULT 1,
    status              VARCHAR(32)     NOT NULL DEFAULT 'Pending',
    buyer_message       TEXT,
    item_title          TEXT,
    expiration_time     TIMESTAMP WITH TIME ZONE,
    event_name          VARCHAR(64),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_best_offers_offer_id ON ebay_api.best_offers(best_offer_id);
CREATE INDEX IF NOT EXISTS idx_best_offers_seller_status ON ebay_api.best_offers(seller, status);
CREATE INDEX IF NOT EXISTS idx_best_offers_status ON ebay_api.best_offers(status);
