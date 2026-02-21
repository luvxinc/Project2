-- V1 parity: in_send stores price_kg and total_weight separately
-- V3 needs these for Edit modal and Export (MGMT format: J12=total_weight, C14=price_kg)
ALTER TABLE shipments ADD COLUMN total_weight DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN price_kg DECIMAL(12,5) NOT NULL DEFAULT 0;
