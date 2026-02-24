-- Shelf management action_registry seeds
INSERT INTO action_registry (action_key, tokens) VALUES
  ('btn_create_warehouse', '["modify"]'),
  ('btn_delete_warehouse', '["db"]')
ON CONFLICT (action_key) DO NOTHING;
