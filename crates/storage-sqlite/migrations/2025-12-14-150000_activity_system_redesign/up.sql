-- Activity System Redesign Migration
-- Transforms the activities system to support new types, sync, and provider integration

-- ============================================================================
-- STEP 0: CLEAN UP ORPHANED DATA
-- Remove activities referencing non-existent accounts or assets to prevent FK issues
-- ============================================================================

-- Delete activities with non-existent accounts (orphaned due to account deletion)
DELETE FROM activities
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = activities.account_id);

-- Nullify asset references for activities pointing to non-existent assets
UPDATE activities
SET asset_id = NULL
WHERE asset_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM assets WHERE id = activities.asset_id);

-- ============================================================================
-- STEP 1: CREATE IMPORT_RUNS TABLE
-- ============================================================================

CREATE TABLE import_runs (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    run_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    review_mode TEXT NOT NULL,
    applied_at TEXT,
    checkpoint_in TEXT,
    checkpoint_out TEXT,
    summary TEXT,
    warnings TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX ix_import_runs_account_id ON import_runs(account_id);
CREATE INDEX ix_import_runs_status ON import_runs(status);

-- ============================================================================
-- STEP 2: CREATE BROKERS_SYNC_STATE WITH COMPOSITE PRIMARY KEY
-- ============================================================================

CREATE TABLE brokers_sync_state (
    account_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    checkpoint_json TEXT,
    last_attempted_at TEXT,
    last_successful_at TEXT,
    last_error TEXT,
    last_run_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'IDLE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (account_id, provider),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (last_run_id) REFERENCES import_runs(id) ON DELETE SET NULL
);

CREATE INDEX ix_brokers_sync_state_provider ON brokers_sync_state(provider);

-- ============================================================================
-- STEP 3: RECREATE ACTIVITIES TABLE WITH NEW SCHEMA
-- ============================================================================

ALTER TABLE activities RENAME TO activities_old;

CREATE TABLE activities (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    asset_id TEXT,

    -- Classification
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'BUY', 'SELL', 'SPLIT',
        'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL',
        'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'TAX',
        'CREDIT', 'ADJUSTMENT', 'UNKNOWN'
    )),
    activity_type_override TEXT,
    source_type TEXT,
    subtype TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED',

    -- Timing
    activity_date TEXT NOT NULL,
    settlement_date TEXT,

    -- Quantities
    quantity TEXT,
    unit_price TEXT,
    amount TEXT,
    fee TEXT,
    currency TEXT NOT NULL,
    fx_rate TEXT,

    -- Metadata
    notes TEXT,
    metadata TEXT,

    -- Source identity
    source_system TEXT,
    source_record_id TEXT,
    source_group_id TEXT,
    idempotency_key TEXT,
    import_run_id TEXT,

    -- Sync flags
    is_user_modified INTEGER NOT NULL DEFAULT 0,
    needs_review INTEGER NOT NULL DEFAULT 0,

    -- Audit
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
    FOREIGN KEY (import_run_id) REFERENCES import_runs(id) ON DELETE SET NULL
);

-- Copy data from old table (original schema without sync columns)
INSERT INTO activities (
    id, account_id, asset_id, activity_type, status,
    activity_date, quantity, unit_price, amount, fee, currency,
    notes, is_user_modified, needs_review, created_at, updated_at
)
SELECT
    id,
    account_id,
    asset_id,  -- Keep $CASH-* asset_ids for cash transfers
    CASE
        -- Convert ADD_HOLDING to TRANSFER_IN (will be marked external below)
        WHEN activity_type = 'ADD_HOLDING' THEN 'TRANSFER_IN'
        -- Convert REMOVE_HOLDING to TRANSFER_OUT (will be marked external below)
        WHEN activity_type = 'REMOVE_HOLDING' THEN 'TRANSFER_OUT'
        WHEN activity_type IN ('BUY', 'SELL', 'SPLIT',
                               'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL',
                               'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'TAX', 'CREDIT')
        THEN activity_type
        ELSE 'UNKNOWN'
    END,
    'POSTED',  -- All activities are posted (is_draft column dropped)
    activity_date,
    quantity,
    unit_price,
    amount,
    fee,
    currency,
    comment,
    0,
    0,
    created_at,
    updated_at
FROM activities_old;

DROP TABLE activities_old;

-- Indexes for activities
CREATE INDEX ix_activities_account_id ON activities(account_id);
CREATE INDEX ix_activities_asset_id ON activities(asset_id);
CREATE INDEX ix_activities_activity_date ON activities(activity_date);
CREATE INDEX ix_activities_status ON activities(status);
CREATE UNIQUE INDEX ux_activities_idempotency_key ON activities(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- STEP 3.5: MIGRATE EXISTING TRANSFER_IN/OUT TO PRESERVE BEHAVIOR
-- Mark existing transfers as external (affecting net_contribution) to maintain
-- backward compatibility. This includes:
-- 1. Original TRANSFER_IN/TRANSFER_OUT activities
-- 2. Converted ADD_HOLDING -> TRANSFER_IN (from step 3 above)
-- 3. Converted REMOVE_HOLDING -> TRANSFER_OUT (from step 3 above)
-- New transfers will default to internal (is_external = false).
-- ============================================================================

UPDATE activities
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.flow',
    json_object('is_external', json('true'))
)
WHERE activity_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
  AND status = 'POSTED';

-- ============================================================================
-- STEP 4: UPDATE ASSETS TABLE
-- Replaces symbol_mapping with quote_symbol for pricing lookups
-- ============================================================================

-- Rename old table
ALTER TABLE assets RENAME TO assets_old;

-- Create new table without symbol_mapping, with new columns
CREATE TABLE assets (
    id TEXT NOT NULL PRIMARY KEY,
    isin TEXT,
    name TEXT,
    asset_type TEXT,
    symbol TEXT NOT NULL,
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
    url TEXT,
    -- New columns
    kind TEXT,
    quote_symbol TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata TEXT
);

-- Copy data, migrating symbol_mapping to quote_symbol
-- Priority: symbol_mapping (if set and non-empty) > symbol (for YAHOO) > NULL
INSERT INTO assets (
    id, isin, name, asset_type, symbol, asset_class, asset_sub_class,
    notes, countries, categories, classes, attributes, created_at, updated_at,
    currency, data_source, sectors, url, kind, quote_symbol, is_active, metadata
)
SELECT
    id, isin, name, asset_type, symbol, asset_class, asset_sub_class,
    notes, countries, categories, classes, attributes, created_at, updated_at,
    currency, data_source, sectors, url,
    -- kind: derive from asset_type
    CASE
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund') THEN 'SECURITY'
        WHEN asset_type IN ('Cryptocurrency', 'Crypto') THEN 'CRYPTO'
        WHEN asset_type = 'Cash' THEN 'CASH'
        WHEN asset_type IN ('Forex', 'Currency') THEN 'FX_RATE'
        ELSE 'SECURITY'
    END,
    -- quote_symbol: migrate from symbol_mapping if set, otherwise use symbol for YAHOO
    CASE
        WHEN symbol_mapping IS NOT NULL AND symbol_mapping != '' THEN symbol_mapping
        WHEN data_source = 'YAHOO' THEN symbol
        ELSE NULL
    END,
    1, -- is_active
    NULL -- metadata
FROM assets_old;

-- Drop old table
DROP TABLE assets_old;

-- Recreate indexes
CREATE UNIQUE INDEX assets_data_source_symbol_key ON assets(data_source, symbol);
CREATE INDEX ix_assets_kind ON assets(kind);

-- ============================================================================
-- STEP 5: UPDATE PLATFORMS TABLE
-- ============================================================================

ALTER TABLE platforms ADD COLUMN external_id TEXT;
ALTER TABLE platforms ADD COLUMN kind TEXT NOT NULL DEFAULT 'BROKERAGE';
ALTER TABLE platforms ADD COLUMN website_url TEXT;
ALTER TABLE platforms ADD COLUMN logo_url TEXT;

-- ============================================================================
-- STEP 6: UPDATE ACCOUNTS TABLE
-- ============================================================================

ALTER TABLE accounts ADD COLUMN account_number TEXT;
ALTER TABLE accounts ADD COLUMN meta TEXT;
ALTER TABLE accounts ADD COLUMN provider TEXT;
ALTER TABLE accounts ADD COLUMN provider_account_id TEXT;

CREATE INDEX ix_accounts_provider ON accounts(provider, provider_account_id) WHERE provider IS NOT NULL;




-- Add cached cash total fields to holdings_snapshots
-- These columns cache the sum of all cash balances to avoid JSON parsing on read

ALTER TABLE holdings_snapshots ADD COLUMN cash_total_account_currency TEXT NOT NULL DEFAULT '0';
ALTER TABLE holdings_snapshots ADD COLUMN cash_total_base_currency TEXT NOT NULL DEFAULT '0';

-- Clear existing snapshots to force recalculation with new columns populated
DELETE FROM holdings_snapshots;
DELETE FROM daily_account_valuation;
