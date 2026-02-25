-- V1 parity: in_send.mode CHAR(1) DEFAULT 'M' COMMENT '汇率模式 A/M'
-- A = Auto (fetched from API), M = Manual (user-entered)
ALTER TABLE shipments ADD COLUMN rate_mode CHAR(1) NOT NULL DEFAULT 'M';
