-- Add external_id to platforms table for storing broker UUID from API
ALTER TABLE platforms ADD COLUMN external_id TEXT;

-- Add sync-related fields to accounts table
ALTER TABLE accounts ADD COLUMN external_id TEXT;
ALTER TABLE accounts ADD COLUMN account_number TEXT;
ALTER TABLE accounts ADD COLUMN meta TEXT;

-- Create index on external_id for faster sync lookups
CREATE INDEX idx_accounts_external_id ON accounts(external_id);
CREATE INDEX idx_platforms_external_id ON platforms(external_id);
