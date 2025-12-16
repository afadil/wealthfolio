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
