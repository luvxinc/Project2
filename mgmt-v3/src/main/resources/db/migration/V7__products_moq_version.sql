-- Add MOQ (Minimum Order Quantity) field — V1 parity
ALTER TABLE products ADD COLUMN IF NOT EXISTS moq INT;

-- Add version column for optimistic locking (@Version)
ALTER TABLE products ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
