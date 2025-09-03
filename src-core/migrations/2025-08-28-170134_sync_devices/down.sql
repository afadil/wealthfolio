-- Drop triggers first (in reverse order of creation)
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
DROP INDEX IF EXISTS idx_assets_deleted;
DROP INDEX IF EXISTS idx_assets_updated_version;
DROP INDEX IF EXISTS idx_activities_deleted;
DROP INDEX IF EXISTS idx_accounts_deleted;
DROP INDEX IF EXISTS idx_activities_updated_version;
DROP INDEX IF EXISTS idx_accounts_updated_version;

-- Remove sync metadata columns from existing tables
-- Note: SQLite doesn't support DROP COLUMN directly, but since this is a down migration
-- we assume the database can be recreated or this is handled by the migration system
ALTER TABLE assets DROP COLUMN deleted;
ALTER TABLE assets DROP COLUMN origin;
ALTER TABLE assets DROP COLUMN updated_version;

ALTER TABLE activities DROP COLUMN deleted;
ALTER TABLE activities DROP COLUMN origin;
ALTER TABLE activities DROP COLUMN updated_version;

ALTER TABLE accounts DROP COLUMN deleted;
ALTER TABLE accounts DROP COLUMN origin;
ALTER TABLE accounts DROP COLUMN updated_version;