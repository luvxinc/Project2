CREATE TABLE IF NOT EXISTS ebay_api.messages (
  id               BIGSERIAL PRIMARY KEY,
  message_id       VARCHAR(100) NOT NULL UNIQUE,
  sender           VARCHAR(20) NOT NULL,
  sender_username  VARCHAR(200),
  recipient_username VARCHAR(200),
  seller_username  VARCHAR(100),
  item_id          VARCHAR(100),
  item_title       VARCHAR(500),
  subject          TEXT,
  body             TEXT,
  message_type     VARCHAR(50),
  folder_id        VARCHAR(20),
  is_read          BOOLEAN DEFAULT false,
  flagged          BOOLEAN DEFAULT false,
  replied          BOOLEAN DEFAULT false,
  parent_message_id VARCHAR(100),
  response_time_seconds BIGINT,
  received_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_seller ON ebay_api.messages(seller_username);
CREATE INDEX idx_messages_item ON ebay_api.messages(item_id);
CREATE INDEX idx_messages_sender ON ebay_api.messages(sender);
CREATE INDEX idx_messages_received ON ebay_api.messages(received_at DESC);
CREATE INDEX idx_messages_parent ON ebay_api.messages(parent_message_id);
