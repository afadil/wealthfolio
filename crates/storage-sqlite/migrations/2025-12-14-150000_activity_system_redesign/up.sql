-- Activity System Redesign Migration
-- Transforms the activities system to support new types, sync, and provider integration
--
-- IMPORTANT: We use PRAGMA legacy_alter_table=ON to prevent SQLite from automatically
-- updating foreign key references when tables are renamed. Without this, renaming
-- "assets" to "assets_old" would update FK references in "quotes" and "activities"
-- to point to "assets_old", causing errors after "assets_old" is dropped.
-- See: https://www.sqlite.org/lang_altertable.html

-- Prevent SQLite from auto-updating FK references during table renames
PRAGMA legacy_alter_table = ON;

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
-- STEP 3: UPDATE ASSETS TABLE (MUST BE DONE BEFORE ACTIVITIES!)
-- Provider-agnostic asset model per spec:
-- - Removes data_source (source belongs on quotes)
-- - Removes quote_symbol (replaced by provider_overrides)
-- - Makes kind NOT NULL
-- - Adds JSON validity checks
-- ============================================================================

-- Rename old table
ALTER TABLE assets RENAME TO assets_old;

-- Create new clean table (no legacy columns)
CREATE TABLE assets (
    id TEXT NOT NULL PRIMARY KEY,

    -- Identity
    kind TEXT NOT NULL,                  -- AssetKind enum (SCREAMING_SNAKE_CASE)
    name TEXT,                           -- Display name
    symbol TEXT NOT NULL,                -- Canonical ticker/label (no provider suffix)

    -- Market Identity (for SECURITY)
    exchange_mic TEXT,                   -- ISO 10383 MIC (XTSE, XNAS, XLON)

    -- Currency
    currency TEXT NOT NULL,              -- Native/valuation currency
                                         -- For FX/CRYPTO: quote currency (USD in EUR/USD)

    -- Pricing Configuration
    pricing_mode TEXT NOT NULL DEFAULT 'MARKET',  -- MARKET, MANUAL, DERIVED, NONE
    preferred_provider TEXT,                       -- Optional hint (YAHOO, ALPHA_VANTAGE)
    provider_overrides TEXT,                       -- JSON: provider_id -> ProviderInstrument params

    -- Classification
    isin TEXT,
    asset_class TEXT,                    -- Equity, Fixed Income, etc.
    asset_sub_class TEXT,                -- Stock, ETF, Bond, etc.

    -- Metadata
    notes TEXT,
    profile TEXT,                        -- JSON: sectors, countries, website, description, etc.
    metadata TEXT,                       -- Kind-specific extensions (OptionSpec, property terms)

    -- Status
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

    -- Constraints
    CHECK (kind IN ('SECURITY', 'CRYPTO', 'CASH', 'FX_RATE', 'OPTION', 'COMMODITY',
                    'PRIVATE_EQUITY', 'PROPERTY', 'VEHICLE', 'COLLECTIBLE',
                    'PHYSICAL_PRECIOUS', 'LIABILITY', 'OTHER')),
    CHECK (pricing_mode IN ('MARKET', 'MANUAL', 'DERIVED', 'NONE')),
    CHECK (is_active IN (0, 1)),
    CHECK (provider_overrides IS NULL OR json_valid(provider_overrides)),
    CHECK (profile IS NULL OR json_valid(profile)),
    CHECK (metadata IS NULL OR json_valid(metadata))
);

-- Copy data with proper migration
-- Converts old schema to provider-agnostic model
-- Migrates legacy columns (countries, sectors, url) into profile JSON
-- FX assets are converted to canonical format: id="EUR/USD", symbol="EUR", currency="USD"
INSERT INTO assets (
    id, kind, name, symbol, exchange_mic, currency,
    pricing_mode, preferred_provider, provider_overrides,
    isin, asset_class, asset_sub_class, notes, profile, metadata,
    is_active, created_at, updated_at
)
SELECT
    -- id: for FX assets, convert to canonical format (EUR/USD)
    CASE
        WHEN asset_type IN ('Forex', 'Currency') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3) || '/' || substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency') AND length(symbol) = 6 THEN
            substr(symbol, 1, 3) || '/' || substr(symbol, 4, 3)
        ELSE id
    END,
    -- kind: derive from asset_type (NOT NULL)
    CASE
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund') THEN 'SECURITY'
        WHEN asset_type IN ('Cryptocurrency', 'Crypto') THEN 'CRYPTO'
        WHEN asset_type = 'Cash' THEN 'CASH'
        WHEN asset_type IN ('Forex', 'Currency') THEN 'FX_RATE'
        WHEN asset_type = 'Option' THEN 'OPTION'
        WHEN asset_type = 'Commodity' THEN 'COMMODITY'
        WHEN asset_type IN ('Property', 'Real Estate') THEN 'PROPERTY'
        WHEN asset_type = 'Vehicle' THEN 'VEHICLE'
        WHEN asset_type = 'Liability' THEN 'LIABILITY'
        ELSE 'SECURITY'
    END,
    name,
    -- symbol: for FX assets, use base currency only; for securities, strip provider suffix
    CASE
        -- FX assets: extract base currency (first 3 chars)
        WHEN asset_type IN ('Forex', 'Currency') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3)
        WHEN asset_type IN ('Forex', 'Currency') AND length(symbol) = 6 THEN
            substr(symbol, 1, 3)
        -- For YAHOO symbols with .XX suffix, strip the suffix
        WHEN symbol LIKE '%.TO' OR symbol LIKE '%.V' OR symbol LIKE '%.CN'
             OR symbol LIKE '%.L' OR symbol LIKE '%.DE' OR symbol LIKE '%.PA'
             OR symbol LIKE '%.AS' OR symbol LIKE '%.MI' OR symbol LIKE '%.MC'
             OR symbol LIKE '%.ST' OR symbol LIKE '%.HE' OR symbol LIKE '%.CO'
             OR symbol LIKE '%.OL' OR symbol LIKE '%.SW' OR symbol LIKE '%.VI'
             OR symbol LIKE '%.T' OR symbol LIKE '%.HK' OR symbol LIKE '%.SS'
             OR symbol LIKE '%.SZ' OR symbol LIKE '%.AX' OR symbol LIKE '%.NZ'
             OR symbol LIKE '%.SA' OR symbol LIKE '%.NS' OR symbol LIKE '%.BO'
             OR symbol LIKE '%.TW' OR symbol LIKE '%.SI' OR symbol LIKE '%.KS'
             OR symbol LIKE '%.KQ' OR symbol LIKE '%.BK' OR symbol LIKE '%.JK'
             OR symbol LIKE '%.KL' OR symbol LIKE '%.TA' THEN
            substr(symbol, 1, instr(symbol, '.') - 1)
        ELSE symbol
    END,
    -- exchange_mic: infer from symbol suffix
    CASE
        WHEN symbol LIKE '%.TO' THEN 'XTSE'
        WHEN symbol LIKE '%.V' THEN 'XTSX'
        WHEN symbol LIKE '%.CN' THEN 'XCNQ'
        WHEN symbol LIKE '%.L' THEN 'XLON'
        WHEN symbol LIKE '%.DE' THEN 'XETR'
        WHEN symbol LIKE '%.PA' THEN 'XPAR'
        WHEN symbol LIKE '%.AS' THEN 'XAMS'
        WHEN symbol LIKE '%.MI' THEN 'XMIL'
        WHEN symbol LIKE '%.MC' THEN 'XMAD'
        WHEN symbol LIKE '%.ST' THEN 'XSTO'
        WHEN symbol LIKE '%.HE' THEN 'XHEL'
        WHEN symbol LIKE '%.CO' THEN 'XCSE'
        WHEN symbol LIKE '%.OL' THEN 'XOSL'
        WHEN symbol LIKE '%.SW' THEN 'XSWX'
        WHEN symbol LIKE '%.VI' THEN 'XWBO'
        WHEN symbol LIKE '%.T' THEN 'XTKS'
        WHEN symbol LIKE '%.HK' THEN 'XHKG'
        WHEN symbol LIKE '%.SS' THEN 'XSHG'
        WHEN symbol LIKE '%.SZ' THEN 'XSHE'
        WHEN symbol LIKE '%.AX' THEN 'XASX'
        WHEN symbol LIKE '%.NZ' THEN 'XNZE'
        WHEN symbol LIKE '%.SA' THEN 'BVMF'
        WHEN symbol LIKE '%.NS' THEN 'XNSE'
        WHEN symbol LIKE '%.BO' THEN 'XBOM'
        WHEN symbol LIKE '%.TW' THEN 'XTAI'
        WHEN symbol LIKE '%.SI' THEN 'XSES'
        WHEN symbol LIKE '%.KS' THEN 'XKRX'
        WHEN symbol LIKE '%.KQ' THEN 'XKOS'
        WHEN symbol LIKE '%.BK' THEN 'XBKK'
        WHEN symbol LIKE '%.JK' THEN 'XIDX'
        WHEN symbol LIKE '%.KL' THEN 'XKLS'
        WHEN symbol LIKE '%.TA' THEN 'XTAE'
        -- US exchanges (no suffix) - default to XNAS for now
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund')
             AND symbol NOT LIKE '%.%' AND symbol NOT LIKE '%=X' THEN NULL
        ELSE NULL
    END,
    -- currency: for FX assets, use quote currency (last 3 chars); otherwise keep original
    CASE
        WHEN asset_type IN ('Forex', 'Currency') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency') AND length(symbol) = 6 THEN
            substr(symbol, 4, 3)
        ELSE currency
    END,
    -- pricing_mode: derive from data_source
    CASE
        WHEN asset_type = 'Cash' THEN 'NONE'
        WHEN data_source = 'MANUAL' THEN 'MANUAL'
        ELSE 'MARKET'
    END,
    -- preferred_provider: from data_source
    CASE
        WHEN data_source IN ('YAHOO', 'ALPHA_VANTAGE', 'MARKETDATA_APP', 'METAL_PRICE_API') THEN data_source
        ELSE NULL
    END,
    -- provider_overrides: migrate to JSON format
    -- FX assets: create Yahoo-specific override with EURUSD=X format
    -- Other assets: migrate symbol_mapping if present
    CASE
        -- FX assets: create provider_overrides with Yahoo FX symbol format
        WHEN asset_type IN ('Forex', 'Currency') AND symbol LIKE '%=X' THEN
            json_object(
                'YAHOO',
                json_object('type', 'fx_symbol', 'symbol', symbol)
            )
        WHEN asset_type IN ('Forex', 'Currency') AND length(symbol) = 6 THEN
            json_object(
                'YAHOO',
                json_object('type', 'fx_symbol', 'symbol', symbol || '=X')
            )
        -- Other assets with symbol_mapping: migrate to equity_symbol format
        WHEN symbol_mapping IS NOT NULL AND symbol_mapping != '' AND symbol_mapping != symbol THEN
            json_object(
                COALESCE(data_source, 'YAHOO'),
                json_object('type', 'equity_symbol', 'symbol', symbol_mapping)
            )
        ELSE NULL
    END,
    isin,
    asset_class,
    asset_sub_class,
    notes,
    -- profile: migrate legacy columns (countries, sectors, url) into JSON
    CASE
        WHEN countries IS NOT NULL OR sectors IS NOT NULL OR url IS NOT NULL THEN
            json_object(
                'countries', countries,
                'sectors', sectors,
                'website', url
            )
        ELSE NULL
    END,
    NULL, -- metadata
    1, -- is_active
    created_at,
    updated_at
FROM assets_old;

-- Drop old table
DROP TABLE assets_old;

-- Indexes per spec
CREATE INDEX IF NOT EXISTS idx_assets_kind_active ON assets(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_assets_exchange_mic ON assets(exchange_mic);

-- Uniqueness constraints per spec
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_security
ON assets(symbol, exchange_mic)
WHERE kind = 'SECURITY' AND exchange_mic IS NOT NULL AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_fx_pair
ON assets(symbol, currency)
WHERE kind = 'FX_RATE' AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_crypto_pair
ON assets(symbol, currency)
WHERE kind = 'CRYPTO' AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_cash_currency
ON assets(kind, currency)
WHERE kind = 'CASH';

-- ============================================================================
-- STEP 4: RECREATE ACTIVITIES TABLE WITH NEW SCHEMA
-- Now that assets table exists with correct schema, activities FK will reference it
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
-- STEP 4.5: MIGRATE EXISTING TRANSFER_IN/OUT TO PRESERVE BEHAVIOR
-- Mark existing transfers as external (affecting net_contribution) to maintain
-- backward compatibility. This includes:
-- 1. Original TRANSFER_IN/TRANSFER_OUT activities
-- 2. Converted ADD_HOLDING -> TRANSFER_IN (from step 4 above)
-- 3. Converted REMOVE_HOLDING -> TRANSFER_OUT (from step 4 above)
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

-- ============================================================================
-- STEP 7: CREATE QUOTE_SYNC_STATE TABLE
-- Tracks sync status for each symbol to optimize quote fetching
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_sync_state (
    symbol TEXT PRIMARY KEY,
    is_active INTEGER NOT NULL DEFAULT 1,
    first_activity_date TEXT,
    last_activity_date TEXT,
    position_closed_date TEXT,
    last_synced_at TEXT,
    last_quote_date TEXT,
    earliest_quote_date TEXT,
    data_source TEXT NOT NULL DEFAULT 'YAHOO',
    sync_priority INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_sync_state_active ON quote_sync_state(is_active);
CREATE INDEX IF NOT EXISTS idx_quote_sync_state_priority ON quote_sync_state(sync_priority DESC);
CREATE INDEX IF NOT EXISTS idx_quote_sync_state_dates ON quote_sync_state(first_activity_date, earliest_quote_date);

-- ============================================================================
-- STEP 8: ADD QUOTE INDEXES FOR ALTERNATIVE ASSETS
-- Enables efficient manual valuation queries
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_symbol_source_timestamp
ON quotes (symbol, data_source, timestamp);

CREATE INDEX IF NOT EXISTS idx_quotes_manual_symbol
ON quotes (symbol, timestamp DESC)
WHERE data_source = 'MANUAL';

-- ============================================================================
-- STEP 9: ADD NOTES COLUMN TO QUOTES TABLE
-- Enables manual notes for alternative asset valuations
-- ============================================================================

ALTER TABLE quotes ADD COLUMN notes TEXT;

-- ============================================================================
-- STEP 10: RESET PRAGMA
-- Restore default behavior for future operations
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
