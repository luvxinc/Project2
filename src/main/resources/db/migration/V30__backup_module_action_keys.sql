-- =============================================================
-- V30: Database Backup Module — Action Registry Seeds
-- =============================================================
-- Seeds action_registry entries for backup module operations.

INSERT INTO action_registry (id, action_key, tokens, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'btn_create_backup', '["db"]', NOW(), NOW()),
  (gen_random_uuid()::text, 'btn_restore_db', '["system"]', NOW(), NOW()),
  (gen_random_uuid()::text, 'btn_delete_backup', '["db"]', NOW(), NOW())
ON CONFLICT (action_key) DO NOTHING;
