-- Drop triggers first (in reverse order of creation)
DROP TRIGGER IF EXISTS goals_allocation_bd;
DROP TRIGGER IF EXISTS goals_allocation_au;
DROP TRIGGER IF EXISTS goals_allocation_ai;

DROP TRIGGER IF EXISTS goals_tombstone_allocations;
DROP TRIGGER IF EXISTS goals_bd;
DROP TRIGGER IF EXISTS goals_au;
DROP TRIGGER IF EXISTS goals_ai;

DROP TRIGGER IF EXISTS contribution_limits_bd;
DROP TRIGGER IF EXISTS contribution_limits_au;
DROP TRIGGER IF EXISTS contribution_limits_ai;

DROP TRIGGER IF EXISTS app_settings_bd;
DROP TRIGGER IF EXISTS app_settings_au;
DROP TRIGGER IF EXISTS app_settings_ai;

DROP TRIGGER IF EXISTS activity_import_profiles_bd;
DROP TRIGGER IF EXISTS activity_import_profiles_au;
DROP TRIGGER IF EXISTS activity_import_profiles_ai;

DROP TRIGGER IF EXISTS assets_tombstone_activities;
DROP TRIGGER IF EXISTS assets_bd;
DROP TRIGGER IF EXISTS assets_au;
DROP TRIGGER IF EXISTS assets_ai;

DROP TRIGGER IF EXISTS activities_bd;
DROP TRIGGER IF EXISTS activities_au;
DROP TRIGGER IF EXISTS activities_ai;

DROP TRIGGER IF EXISTS accounts_tombstone_activities;
DROP TRIGGER IF EXISTS accounts_bd;
DROP TRIGGER IF EXISTS accounts_au;
DROP TRIGGER IF EXISTS accounts_ai;

-- Drop tables (in reverse order of creation)
DROP TABLE IF EXISTS sync_peers;
DROP TABLE IF EXISTS sync_peer_checkpoint;
DROP TABLE IF EXISTS sync_device;
DROP TABLE IF EXISTS sync_sequence;

-- Drop indexes
DROP INDEX IF EXISTS idx_goals_allocation_deleted;
DROP INDEX IF EXISTS idx_goals_allocation_updated_version;
DROP INDEX IF EXISTS idx_goals_deleted;
DROP INDEX IF EXISTS idx_goals_updated_version;
DROP INDEX IF EXISTS idx_contribution_limits_deleted;
DROP INDEX IF EXISTS idx_contribution_limits_updated_version;
DROP INDEX IF EXISTS idx_app_settings_deleted;
DROP INDEX IF EXISTS idx_app_settings_updated_version;
DROP INDEX IF EXISTS idx_activity_import_profiles_deleted;
DROP INDEX IF EXISTS idx_activity_import_profiles_updated_version;
DROP INDEX IF EXISTS idx_assets_deleted;
DROP INDEX IF EXISTS idx_assets_updated_version;
DROP INDEX IF EXISTS idx_activities_deleted;
DROP INDEX IF EXISTS idx_accounts_deleted;
DROP INDEX IF EXISTS idx_activities_updated_version;
DROP INDEX IF EXISTS idx_accounts_updated_version;
DROP INDEX IF EXISTS idx_sync_peers_failure_count;
DROP INDEX IF EXISTS idx_sync_peers_state;

-- Remove sync metadata columns from existing tables
-- Note: SQLite doesn't support DROP COLUMN directly, but since this is a down migration
-- we assume the database can be recreated or this is handled by the migration system
ALTER TABLE goals_allocation DROP COLUMN deleted;
ALTER TABLE goals_allocation DROP COLUMN origin;
ALTER TABLE goals_allocation DROP COLUMN updated_version;

ALTER TABLE goals DROP COLUMN deleted;
ALTER TABLE goals DROP COLUMN origin;
ALTER TABLE goals DROP COLUMN updated_version;

ALTER TABLE contribution_limits DROP COLUMN deleted;
ALTER TABLE contribution_limits DROP COLUMN origin;
ALTER TABLE contribution_limits DROP COLUMN updated_version;

ALTER TABLE app_settings DROP COLUMN deleted;
ALTER TABLE app_settings DROP COLUMN origin;
ALTER TABLE app_settings DROP COLUMN updated_version;

ALTER TABLE activity_import_profiles DROP COLUMN deleted;
ALTER TABLE activity_import_profiles DROP COLUMN origin;
ALTER TABLE activity_import_profiles DROP COLUMN updated_version;

ALTER TABLE assets DROP COLUMN deleted;
ALTER TABLE assets DROP COLUMN origin;
ALTER TABLE assets DROP COLUMN updated_version;

ALTER TABLE activities DROP COLUMN deleted;
ALTER TABLE activities DROP COLUMN origin;
ALTER TABLE activities DROP COLUMN updated_version;

ALTER TABLE accounts DROP COLUMN deleted;
ALTER TABLE accounts DROP COLUMN origin;
ALTER TABLE accounts DROP COLUMN updated_version;
