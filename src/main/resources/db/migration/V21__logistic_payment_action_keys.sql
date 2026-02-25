-- Seed action keys for Finance Logistics Payment module.
-- These entries register security policy matrix entries so that
-- SecurityLevelAspect enforces the correct security codes.
--
-- Token types (V1 parity):
--   "modify" -> L2 -> sec_code_l2
--   "db"     -> L3 -> sec_code_l3

INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_logistic_payment_submit',      '["modify"]'),
  ('btn_logistic_payment_delete',      '["db"]'),
  ('btn_logistic_payment_restore',     '["modify"]'),
  ('btn_logistic_payment_upload_file', '["modify"]'),
  ('btn_logistic_payment_delete_file', '["modify"]')
ON CONFLICT (action_key) DO NOTHING;
