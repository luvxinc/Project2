-- =============================================================
-- V30: Database Backup Module — Action Registry + Scheduled Task
-- =============================================================
-- Seeds action_registry entries for backup module operations.
-- V1 parity: btn_create_backup, btn_restore_db, btn_delete_backup

INSERT INTO action_registry (id, action_key, description, required_tokens, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'btn_create_backup', 'Create database backup', '["db"]', true, NOW(), NOW()),
  (gen_random_uuid(), 'btn_restore_db', 'Restore database from backup', '["system"]', true, NOW(), NOW()),
  (gen_random_uuid(), 'btn_delete_backup', 'Delete a database backup file', '["db"]', true, NOW(), NOW())
ON CONFLICT (action_key) DO NOTHING;
