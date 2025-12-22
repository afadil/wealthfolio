-- Remove indexes
DROP INDEX IF EXISTS idx_accounts_external_id;
DROP INDEX IF EXISTS idx_platforms_external_id;

-- Remove columns from accounts
ALTER TABLE accounts DROP COLUMN external_id;
ALTER TABLE accounts DROP COLUMN account_number;
ALTER TABLE accounts DROP COLUMN meta;

-- Remove column from platforms
ALTER TABLE platforms DROP COLUMN external_id;

-- Remove columns from activities
ALTER TABLE activities DROP COLUMN fx_rate;
ALTER TABLE activities DROP COLUMN provider_type;
ALTER TABLE activities DROP COLUMN external_provider_id;
ALTER TABLE activities DROP COLUMN external_broker_id;

DROP INDEX IF EXISTS "idx_brokers_sync_state_provider";
DROP TABLE IF EXISTS "brokers_sync_state";
