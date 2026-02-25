-- PO Payment action_registry seeds
INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_po_payment_submit',      '["modify"]'),
  ('btn_po_payment_delete',      '["db"]'),
  ('btn_po_payment_upload_file', '["modify"]'),
  ('btn_po_payment_delete_file', '["modify"]')
ON CONFLICT (action_key) DO NOTHING;
