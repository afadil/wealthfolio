-- Per-account broker sync state (currently used for activity sync).
-- This migration is also responsible for cleaning up a legacy table name if present.

CREATE TABLE IF NOT EXISTS "brokers_sync_state" (
    "account_id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'snaptrade',
    -- Stored as YYYY-MM-DD (UTC) to match the broker API query params.
    "last_synced_date" TEXT,
    "last_attempted_at" TEXT,
    "last_successful_at" TEXT,
    "last_error" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brokers_sync_state_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_brokers_sync_state_provider" ON "brokers_sync_state" ("provider");




-- Add external_id to platforms table for storing broker UUID from API
ALTER TABLE platforms ADD COLUMN external_id TEXT;

-- Add sync-related fields to accounts table
ALTER TABLE accounts ADD COLUMN external_id TEXT;
ALTER TABLE accounts ADD COLUMN account_number TEXT;
ALTER TABLE accounts ADD COLUMN meta TEXT;

-- Create index on external_id for faster sync lookups
CREATE INDEX idx_accounts_external_id ON accounts(external_id);
CREATE INDEX idx_platforms_external_id ON platforms(external_id);

-- Add broker-provided metadata to activities (optional).
ALTER TABLE activities ADD COLUMN fx_rate TEXT;
ALTER TABLE activities ADD COLUMN provider_type TEXT;
ALTER TABLE activities ADD COLUMN external_provider_id TEXT;
ALTER TABLE activities ADD COLUMN external_broker_id TEXT;
