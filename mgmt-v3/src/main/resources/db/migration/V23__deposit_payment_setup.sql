-- Seed action keys for Finance Deposit Payment module.
-- These entries register security policy matrix entries so that
-- SecurityLevelAspect enforces the correct security codes.
--
-- Token types (V1 parity):
--   "modify" -> L2 -> sec_code_l2
--   "db"     -> L3 -> sec_code_l3
--
-- Note: deposit_override column already exists in payments table (created in V15).

INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_deposit_payment_submit',  '["modify"]'),
  ('btn_deposit_payment_delete',  '["db"]'),
  ('btn_deposit_upload_file',     '["modify"]'),
  ('btn_deposit_delete_file',     '["modify"]')
ON CONFLICT (action_key) DO NOTHING;
