-- Rollback Activity System Redesign Migration
-- This migration restores the previous database schema

-- ============================================================================
-- STEP 1: RESTORE ACCOUNTS TABLE
-- ============================================================================

-- Drop new indexes
DROP INDEX IF EXISTS ix_accounts_provider;

-- Remove new columns from accounts (SQLite doesn't support DROP COLUMN before 3.35)
-- We need to use the rename-and-copy pattern
CREATE TABLE accounts_backup (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'SECURITIES',
    "group" TEXT,
    currency TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platform_id TEXT,
    CONSTRAINT account_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO accounts_backup (id, name, account_type, "group", currency, is_default, is_active, created_at, updated_at, platform_id)
SELECT id, name, account_type, "group", currency, is_default, is_active, created_at, updated_at, platform_id
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_backup RENAME TO accounts;

-- ============================================================================
-- STEP 2: RESTORE PLATFORMS TABLE
-- ============================================================================

-- Drop new indexes
DROP INDEX IF EXISTS ix_platforms_external_id;

-- Remove new columns from platforms
CREATE TABLE platforms_backup (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT,
    url TEXT NOT NULL
);

INSERT INTO platforms_backup (id, name, url)
SELECT id, name, url
FROM platforms;

DROP TABLE platforms;
ALTER TABLE platforms_backup RENAME TO platforms;

-- ============================================================================
-- STEP 3: RESTORE ASSETS TABLE
-- ============================================================================

-- Drop new indexes
DROP INDEX IF EXISTS ix_assets_kind;
DROP INDEX IF EXISTS ix_assets_is_active;
DROP INDEX IF EXISTS ux_assets_data_source_quote_symbol;

-- Remove new columns from assets
CREATE TABLE assets_backup (
    id TEXT NOT NULL PRIMARY KEY,
    isin TEXT,
    name TEXT,
    asset_type TEXT,
    symbol TEXT NOT NULL,
    symbol_mapping TEXT,
    asset_class TEXT,
    asset_sub_class TEXT,
    notes TEXT,
    countries TEXT,
    categories TEXT,
    classes TEXT,
    attributes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    currency TEXT NOT NULL,
    data_source TEXT NOT NULL,
    sectors TEXT,
    url TEXT
);

INSERT INTO assets_backup (id, isin, name, asset_type, symbol, symbol_mapping, asset_class, asset_sub_class, notes, countries, categories, classes, attributes, created_at, updated_at, currency, data_source, sectors, url)
SELECT id, isin, name, asset_type, symbol, symbol_mapping, asset_class, asset_sub_class, notes, countries, categories, classes, attributes, created_at, updated_at, currency, data_source, sectors, url
FROM assets;

DROP TABLE assets;
ALTER TABLE assets_backup RENAME TO assets;

-- Recreate original asset index
CREATE UNIQUE INDEX assets_data_source_symbol_key ON assets(data_source, symbol);

-- ============================================================================
-- STEP 4: RESTORE ACTIVITIES TABLE
-- ============================================================================

-- Drop new indexes
DROP INDEX IF EXISTS ix_activities_account_id;
DROP INDEX IF EXISTS ix_activities_asset_id;
DROP INDEX IF EXISTS ix_activities_activity_type;
DROP INDEX IF EXISTS ix_activities_activity_date;
DROP INDEX IF EXISTS ix_activities_status;
DROP INDEX IF EXISTS ix_activities_source_system;
DROP INDEX IF EXISTS ix_activities_import_run_id;
DROP INDEX IF EXISTS ix_activities_needs_review;
DROP INDEX IF EXISTS ux_activities_idempotency_key;
DROP INDEX IF EXISTS ix_activities_effective_type;
DROP INDEX IF EXISTS ix_activities_source_lookup;

-- Rename new table
ALTER TABLE activities RENAME TO activities_new;

-- Recreate old activities table
CREATE TABLE activities (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity TEXT NOT NULL,
    unit_price TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee TEXT NOT NULL,
    amount TEXT,
    is_draft BOOLEAN NOT NULL DEFAULT false,
    comment TEXT,
    fx_rate TEXT,
    provider_type TEXT,
    external_provider_id TEXT,
    external_broker_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data back with reverse mapping
INSERT INTO activities (
    id,
    account_id,
    asset_id,
    activity_type,
    activity_date,
    quantity,
    unit_price,
    currency,
    fee,
    amount,
    is_draft,
    comment,
    fx_rate,
    provider_type,
    external_provider_id,
    external_broker_id,
    created_at,
    updated_at
)
SELECT
    id,
    account_id,
    COALESCE(asset_id, '$CASH-' || currency),  -- Restore $CASH- asset_id for null values
    CASE
        WHEN activity_type = 'UNKNOWN' THEN 'UNKNOWN'
        ELSE activity_type
    END,
    activity_date,
    COALESCE(quantity, '0'),
    COALESCE(unit_price, '0'),
    currency,
    COALESCE(fee, '0'),
    amount,
    0,  -- is_draft always false (status column no longer uses DRAFT)
    notes,  -- notes -> comment
    fx_rate,
    source_system,  -- source_system -> provider_type
    source_record_id,  -- source_record_id -> external_provider_id
    source_group_id,   -- source_group_id -> external_broker_id
    created_at,
    updated_at
FROM activities_new;

-- Drop new table
DROP TABLE activities_new;

-- Recreate original indexes
CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- ============================================================================
-- STEP 5: DROP BROKERS_SYNC_STATE AND RECREATE OLD VERSION
-- ============================================================================

DROP INDEX IF EXISTS ix_brokers_sync_state_provider;
DROP INDEX IF EXISTS ix_brokers_sync_state_sync_status;
DROP INDEX IF EXISTS ix_brokers_sync_state_last_run_id;
DROP TABLE IF EXISTS brokers_sync_state;

CREATE TABLE brokers_sync_state (
    account_id TEXT NOT NULL PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'snaptrade',
    last_synced_date TEXT,
    last_attempted_at TEXT,
    last_successful_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT brokers_sync_state_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_brokers_sync_state_provider ON brokers_sync_state(provider);

-- ============================================================================
-- STEP 6: DROP IMPORT_RUNS TABLE
-- ============================================================================

DROP INDEX IF EXISTS ix_import_runs_account_id;
DROP INDEX IF EXISTS ix_import_runs_source_system;
DROP INDEX IF EXISTS ix_import_runs_status;
DROP INDEX IF EXISTS ix_import_runs_started_at;
DROP TABLE IF EXISTS import_runs;


-- Remove cached cash total fields to holdings_snapshots
ALTER TABLE holdings_snapshots DROP COLUMN cash_total_account_currency;
ALTER TABLE holdings_snapshots DROP COLUMN cash_total_base_currency;
