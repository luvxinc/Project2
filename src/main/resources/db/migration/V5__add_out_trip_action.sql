-- V5: Add OUT_TRIP and RETURN_DEMO to vma_inventory_action enum for Clinical Trip feature
-- OUT_TRIP: When multiple cases share products via a Trip, transactions use OUT_TRIP instead of OUT_CASE
-- RETURN_DEMO: When demo products are returned to inventory

ALTER TYPE vma_inventory_action ADD VALUE IF NOT EXISTS 'OUT_TRIP';
ALTER TYPE vma_inventory_action ADD VALUE IF NOT EXISTS 'RETURN_DEMO';
