-- Remove indexes
DROP INDEX IF EXISTS idx_accounts_external_id;
DROP INDEX IF EXISTS idx_platforms_external_id;

-- Remove columns from accounts
ALTER TABLE accounts DROP COLUMN external_id;
ALTER TABLE accounts DROP COLUMN account_number;
ALTER TABLE accounts DROP COLUMN meta;

-- Remove column from platforms
ALTER TABLE platforms DROP COLUMN external_id;
