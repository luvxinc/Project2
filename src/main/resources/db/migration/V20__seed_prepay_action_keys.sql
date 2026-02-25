-- Seed action keys for Finance Prepayment module.
-- These entries register security policy matrix entries so that
-- SecurityLevelAspect enforces the correct security codes.
--
-- Token types (V1 parity):
--   "modify" → L2 → sec_code_l2
--   "db"     → L3 → sec_code_l3

INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_prepay_submit',      '["modify"]'),
  ('btn_prepay_delete',      '["db"]'),
  ('btn_prepay_undelete',    '["modify"]'),
  ('btn_prepay_upload_file', '["modify"]'),
  ('btn_prepay_delete_file', '["modify"]')
ON CONFLICT (action_key) DO NOTHING;
