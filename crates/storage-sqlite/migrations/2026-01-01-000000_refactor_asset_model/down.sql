-- Revert Core Schema v2 (atomic)
-- WARNING: This is a destructive migration — CASH assets and typed IDs cannot
-- be fully restored. Legacy data from metadata.legacy is used for best-effort
-- reversal.

PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 1: REVERT HOLDINGS SNAPSHOTS
-- ============================================================================

ALTER TABLE holdings_snapshots DROP COLUMN cash_total_account_currency;
ALTER TABLE holdings_snapshots DROP COLUMN cash_total_base_currency;

-- ============================================================================
-- STEP 2: REVERT ACCOUNTS
-- ============================================================================

DROP INDEX IF EXISTS ix_accounts_provider;
ALTER TABLE accounts DROP COLUMN account_number;
ALTER TABLE accounts DROP COLUMN meta;
ALTER TABLE accounts DROP COLUMN provider;
ALTER TABLE accounts DROP COLUMN provider_account_id;

-- ============================================================================
-- STEP 3: REVERT PLATFORMS
-- ============================================================================

ALTER TABLE platforms DROP COLUMN external_id;
ALTER TABLE platforms DROP COLUMN kind;
ALTER TABLE platforms DROP COLUMN website_url;
ALTER TABLE platforms DROP COLUMN logo_url;

-- ============================================================================
-- STEP 4: REVERT ACTIVITIES (with reverse asset_id mapping)
-- ============================================================================

-- Build reverse lookup: new UUID → old bare-symbol ID
CREATE TEMP TABLE asset_id_reverse_mapping AS
SELECT
    id AS new_id,
    json_extract(metadata, '$.legacy.old_id') AS old_id
FROM assets
WHERE json_extract(metadata, '$.legacy.old_id') IS NOT NULL;

CREATE INDEX idx_asset_id_reverse_new ON asset_id_reverse_mapping(new_id);

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
    a.id,
    a.account_id,
    COALESCE(m.old_id, a.asset_id, ''),
    a.activity_type,
    a.activity_date,
    COALESCE(a.quantity, '0'),
    COALESCE(a.unit_price, '0'),
    a.currency,
    COALESCE(a.fee, '0'),
    a.amount,
    0,
    a.notes,
    a.created_at,
    a.updated_at
FROM activities_new a
LEFT JOIN asset_id_reverse_mapping m ON a.asset_id = m.new_id;

DROP TABLE activities_new;
DROP TABLE asset_id_reverse_mapping;

CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- ============================================================================
-- STEP 5: DROP NEW TABLES
-- ============================================================================

DROP TABLE IF EXISTS brokers_sync_state;
DROP TABLE IF EXISTS import_runs;

-- ============================================================================
-- STEP 6: REVERT ASSETS TABLE
-- ============================================================================

DROP INDEX IF EXISTS idx_assets_instrument_key;
DROP INDEX IF EXISTS idx_assets_kind;
DROP INDEX IF EXISTS idx_assets_is_active;
DROP INDEX IF EXISTS idx_assets_display_code;

ALTER TABLE assets RENAME TO assets_v2;

CREATE TABLE assets (
    id TEXT NOT NULL PRIMARY KEY,
    isin TEXT,
    name TEXT,
    asset_type TEXT,
    symbol TEXT NOT NULL,
    symbol_mapping TEXT,
    asset_class TEXT,
    asset_sub_class TEXT,
    comment TEXT,
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

INSERT INTO assets (id, name, symbol, currency, data_source, comment, created_at, updated_at)
SELECT
    COALESCE(json_extract(metadata, '$.legacy.old_id'), id),
    name,
    COALESCE(instrument_symbol, display_code, ''),
    quote_ccy,
    COALESCE(json_extract(provider_config, '$.preferred_provider'), 'YAHOO'),
    notes,
    created_at,
    updated_at
FROM assets_v2;

DROP TABLE assets_v2;

CREATE UNIQUE INDEX assets_data_source_symbol_key ON assets(data_source, symbol);

-- ============================================================================
-- STEP 7: RESTORE PRAGMA
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
