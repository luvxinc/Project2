-- V34: Add 'deleted' to receive_diff_status enum
-- Required for deleteReceive() to mark diffs as deleted when rolling back a receive.
ALTER TYPE receive_diff_status ADD VALUE IF NOT EXISTS 'deleted';
