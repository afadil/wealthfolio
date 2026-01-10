-- Revert Core Schema Redesign
-- WARNING: This will lose data that doesn't fit in the old schema

PRAGMA legacy_alter_table = ON;

-- Remove holdings_snapshots columns
ALTER TABLE holdings_snapshots DROP COLUMN cash_total_account_currency;
ALTER TABLE holdings_snapshots DROP COLUMN cash_total_base_currency;

-- Remove accounts columns
DROP INDEX IF EXISTS ix_accounts_provider;
ALTER TABLE accounts DROP COLUMN account_number;
ALTER TABLE accounts DROP COLUMN meta;
ALTER TABLE accounts DROP COLUMN provider;
ALTER TABLE accounts DROP COLUMN provider_account_id;

-- Remove platforms columns
ALTER TABLE platforms DROP COLUMN external_id;
ALTER TABLE platforms DROP COLUMN kind;
ALTER TABLE platforms DROP COLUMN website_url;
ALTER TABLE platforms DROP COLUMN logo_url;

-- Revert activities table
DROP INDEX IF EXISTS ix_activities_account_id;
DROP INDEX IF EXISTS ix_activities_asset_id;
DROP INDEX IF EXISTS ix_activities_activity_date;
DROP INDEX IF EXISTS ix_activities_status;
DROP INDEX IF EXISTS ux_activities_idempotency_key;

ALTER TABLE activities RENAME TO activities_new;

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
    is_draft BOOLEAN NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO activities (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
)
SELECT
    id, account_id, COALESCE(asset_id, ''), activity_type, activity_date,
    COALESCE(quantity, '0'), COALESCE(unit_price, '0'), currency, COALESCE(fee, '0'), amount,
    0, notes, created_at, updated_at
FROM activities_new;

DROP TABLE activities_new;

CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- Revert assets table
DROP INDEX IF EXISTS idx_assets_kind_active;
DROP INDEX IF EXISTS idx_assets_symbol;
DROP INDEX IF EXISTS idx_assets_exchange_mic;
DROP INDEX IF EXISTS uq_assets_security;
DROP INDEX IF EXISTS uq_assets_fx_pair;
DROP INDEX IF EXISTS uq_assets_crypto_pair;
DROP INDEX IF EXISTS uq_assets_cash_currency;

ALTER TABLE assets RENAME TO assets_new;

CREATE TABLE assets (
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    currency TEXT NOT NULL,
    data_source TEXT NOT NULL,
    sectors TEXT,
    url TEXT
);

INSERT INTO assets (
    id, name, symbol, currency, data_source, notes, created_at, updated_at
)
SELECT
    id, name, symbol, currency,
    COALESCE(preferred_provider, 'YAHOO'),
    notes, created_at, updated_at
FROM assets_new;

DROP TABLE assets_new;

CREATE UNIQUE INDEX assets_data_source_symbol_key ON assets(data_source, symbol);

-- Drop new tables
DROP TABLE IF EXISTS brokers_sync_state;
DROP TABLE IF EXISTS import_runs;

PRAGMA legacy_alter_table = OFF;
