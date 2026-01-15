-- Core Schema Redesign Migration
-- Transforms assets, activities, accounts, and platforms to new schema
--
-- Key changes:
-- - Assets: Final schema with metadata JSON (no legacy columns)
-- - Activities: New sync-aware schema
-- - New tables: import_runs, brokers_sync_state
-- - Platform/Account updates for provider integration
--
-- IMPORTANT: We use PRAGMA legacy_alter_table=ON to prevent SQLite from automatically
-- updating foreign key references when tables are renamed.

PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 0: CLEAN UP ORPHANED DATA
-- ============================================================================

DELETE FROM activities
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = activities.account_id);

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
-- STEP 2: CREATE BROKERS_SYNC_STATE TABLE
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
-- STEP 3: UPDATE ASSETS TABLE - FINAL SCHEMA
-- No legacy columns (isin, asset_class, asset_sub_class, profile)
-- Legacy data stored in metadata.legacy JSON
-- ============================================================================

ALTER TABLE assets RENAME TO assets_old;

CREATE TABLE assets (
    id TEXT NOT NULL PRIMARY KEY,

    -- Identity
    kind TEXT NOT NULL,
    name TEXT,
    symbol TEXT NOT NULL,

    -- Market Identity (for SECURITY)
    exchange_mic TEXT,

    -- Currency
    currency TEXT NOT NULL,

    -- Pricing Configuration
    pricing_mode TEXT NOT NULL DEFAULT 'MARKET',
    preferred_provider TEXT,
    provider_overrides TEXT,

    -- Metadata (includes legacy data for migration)
    notes TEXT,
    metadata TEXT,

    -- Status
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Constraints
    CHECK (kind IN ('SECURITY', 'CRYPTO', 'CASH', 'FX_RATE', 'OPTION', 'COMMODITY',
                    'PRIVATE_EQUITY', 'PROPERTY', 'VEHICLE', 'COLLECTIBLE',
                    'PHYSICAL_PRECIOUS', 'LIABILITY', 'OTHER')),
    CHECK (pricing_mode IN ('MARKET', 'MANUAL', 'DERIVED', 'NONE')),
    CHECK (is_active IN (0, 1)),
    CHECK (provider_overrides IS NULL OR json_valid(provider_overrides)),
    CHECK (metadata IS NULL OR json_valid(metadata))
);

-- Copy data with proper migration
-- Converts old schema to provider-agnostic model
-- Stores ALL legacy data in metadata.legacy JSON
-- NEW: Asset IDs use {primary}:{qualifier} format
INSERT INTO assets (
    id, kind, name, symbol, exchange_mic, currency,
    pricing_mode, preferred_provider, provider_overrides,
    notes, metadata, is_active, created_at, updated_at
)
SELECT
    -- id: New canonical format {primary}:{qualifier}
    -- FX: EUR:USD (base:quote)
    -- Crypto: BTC:USD (base:quote)
    -- Cash: CASH:USD (prefix:currency)
    -- Security with suffix: SHOP:XTSE (symbol:mic)
    -- Security without suffix (US): AAPL:XNAS (symbol:mic, default to XNAS)
    -- Alternative assets: Keep existing ID but replace - with : (PROP-abc -> PROP:abc)
    CASE
        -- FX: base:quote
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3) || ':' || substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 1, 3) || ':' || substr(symbol, 4, 3)
        -- Crypto: base:quote (BTC-CAD -> BTC:CAD)
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') AND symbol LIKE '%-%' THEN
            substr(symbol, 1, instr(symbol, '-') - 1) || ':' || currency
        -- Cash: CASH:currency
        WHEN asset_type IN ('Cash', 'CASH') OR id LIKE '$CASH-%' THEN
            'CASH:' || currency
        -- Alternative assets: PROP-xxx -> PROP:xxx, VEH-xxx -> VEH:xxx, etc.
        WHEN id LIKE 'PROP-%' THEN 'PROP:' || substr(id, 6)
        WHEN id LIKE 'VEH-%' THEN 'VEH:' || substr(id, 5)
        WHEN id LIKE 'COLL-%' THEN 'COLL:' || substr(id, 6)
        WHEN id LIKE 'PREC-%' THEN 'PREC:' || substr(id, 6)
        WHEN id LIKE 'LIAB-%' THEN 'LIAB:' || substr(id, 6)
        WHEN id LIKE 'ALT-%' THEN 'ALT:' || substr(id, 5)
        -- Security with exchange suffix: symbol:MIC
        WHEN symbol LIKE '%.TO' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XTSE'
        WHEN symbol LIKE '%.V' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XTSX'
        WHEN symbol LIKE '%.CN' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XCNQ'
        WHEN symbol LIKE '%.L' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XLON'
        WHEN symbol LIKE '%.DE' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XETR'
        WHEN symbol LIKE '%.PA' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XPAR'
        WHEN symbol LIKE '%.AS' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XAMS'
        WHEN symbol LIKE '%.MI' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XMIL'
        WHEN symbol LIKE '%.MC' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XMAD'
        WHEN symbol LIKE '%.ST' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XSTO'
        WHEN symbol LIKE '%.HE' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XHEL'
        WHEN symbol LIKE '%.CO' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XCSE'
        WHEN symbol LIKE '%.OL' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XOSL'
        WHEN symbol LIKE '%.SW' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XSWX'
        WHEN symbol LIKE '%.VI' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XWBO'
        WHEN symbol LIKE '%.T' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XTKS'
        WHEN symbol LIKE '%.HK' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XHKG'
        WHEN symbol LIKE '%.SS' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XSHG'
        WHEN symbol LIKE '%.SZ' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XSHE'
        WHEN symbol LIKE '%.AX' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XASX'
        WHEN symbol LIKE '%.NZ' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XNZE'
        WHEN symbol LIKE '%.SA' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':BVMF'
        WHEN symbol LIKE '%.NS' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XNSE'
        WHEN symbol LIKE '%.BO' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XBOM'
        WHEN symbol LIKE '%.TW' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XTAI'
        WHEN symbol LIKE '%.SI' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XSES'
        WHEN symbol LIKE '%.KS' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XKRX'
        WHEN symbol LIKE '%.KQ' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XKOS'
        WHEN symbol LIKE '%.BK' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XBKK'
        WHEN symbol LIKE '%.JK' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XIDX'
        WHEN symbol LIKE '%.KL' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XKLS'
        WHEN symbol LIKE '%.TA' THEN substr(symbol, 1, instr(symbol, '.') - 1) || ':XTAE'
        -- US stocks without suffix: default to XNAS (Yahoo's NMS -> XNAS)
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund', 'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND')
             AND symbol NOT LIKE '%.%' THEN
            symbol || ':XNAS'
        -- Fallback: keep original id (shouldn't happen with proper data)
        ELSE id
    END,
    -- kind: derive from asset_type (NOT NULL)
    CASE
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund', 'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND') THEN 'SECURITY'
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') THEN 'CRYPTO'
        WHEN asset_type IN ('Cash', 'CASH') THEN 'CASH'
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX', 'CURRENCY') THEN 'FX_RATE'
        WHEN asset_type = 'Option' THEN 'OPTION'
        WHEN asset_type = 'Commodity' THEN 'COMMODITY'
        WHEN asset_type IN ('Property', 'Real Estate') THEN 'PROPERTY'
        WHEN asset_type = 'Vehicle' THEN 'VEHICLE'
        WHEN asset_type = 'Liability' THEN 'LIABILITY'
        ELSE 'SECURITY'
    END,
    name,
    -- symbol: for FX assets, use base currency only; for crypto, extract base from "BTC-CAD"; for securities, strip provider suffix
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 1, 3)
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') AND symbol LIKE '%-%' THEN
            substr(symbol, 1, instr(symbol, '-') - 1)
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
    -- exchange_mic: infer from symbol suffix OR default to XNAS for US securities
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
        -- US stocks without suffix: default to XNAS (Yahoo's NMS -> XNAS)
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund', 'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND')
             AND symbol NOT LIKE '%.%' THEN 'XNAS'
        ELSE NULL
    END,
    -- currency: for FX assets, use quote currency (last 3 chars); otherwise keep original
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 4, 3)
        ELSE currency
    END,
    -- pricing_mode
    CASE
        WHEN asset_type IN ('Cash', 'CASH') THEN 'NONE'
        WHEN data_source = 'MANUAL' THEN 'MANUAL'
        ELSE 'MARKET'
    END,
    -- preferred_provider
    CASE
        WHEN data_source IN ('YAHOO', 'ALPHA_VANTAGE', 'MARKETDATA_APP', 'METAL_PRICE_API') THEN data_source
        ELSE NULL
    END,
    -- provider_overrides
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            json_object('YAHOO', json_object('type', 'fx_symbol', 'symbol', symbol))
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            json_object('YAHOO', json_object('type', 'fx_symbol', 'symbol', symbol || '=X'))
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') AND symbol LIKE '%-%' THEN
            json_object('YAHOO', json_object('type', 'crypto_symbol', 'symbol', symbol))
        WHEN symbol_mapping IS NOT NULL AND symbol_mapping != '' AND symbol_mapping != symbol THEN
            json_object(COALESCE(data_source, 'YAHOO'), json_object('type', 'equity_symbol', 'symbol', symbol_mapping))
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
            json_object('YAHOO', json_object('type', 'equity_symbol', 'symbol', symbol))
        ELSE NULL
    END,
    notes,
    -- metadata: Contains both temporary $.legacy structure and permanent $.identifiers
    -- $.legacy: Used by 000001 (FK mapping), 000002 (quote mapping), 000003 (taxonomy classification)
    -- $.identifiers: Permanent structure for asset identifiers (ISIN, etc.)
    -- Cleanup: $.legacy is removed at end of 000003_taxonomies, $.identifiers is preserved
    CASE
        WHEN isin IS NOT NULL AND isin != '' THEN
            json_object(
                'legacy', json_object(
                    'old_id', id,  -- Used for FK mapping (temp table) and quote mapping
                    'asset_class', asset_class,  -- Used for taxonomy classification, then removed
                    'asset_sub_class', asset_sub_class,  -- Used for taxonomy classification, then removed
                    'sectors', sectors,  -- Used for manual migration to industries_gics taxonomy
                    'countries', countries  -- Used for manual migration to regions taxonomy
                ),
                'identifiers', json_object('isin', isin)  -- Permanent: preserved after cleanup
            )
        ELSE
            json_object(
                'legacy', json_object(
                    'old_id', id,  -- Used for FK mapping (temp table) and quote mapping
                    'asset_class', asset_class,  -- Used for taxonomy classification, then removed
                    'asset_sub_class', asset_sub_class,  -- Used for taxonomy classification, then removed
                    'sectors', sectors,  -- Used for manual migration to industries_gics taxonomy
                    'countries', countries  -- Used for manual migration to regions taxonomy
                )
            )
    END,
    1, -- is_active
    -- Convert datetime format: try to parse and reformat, or use as-is if already RFC3339
    CASE
        WHEN created_at LIKE '%T%' THEN created_at  -- Already RFC3339
        ELSE replace(created_at, ' ', 'T') || 'Z'   -- Convert SQLite format
    END,
    CASE
        WHEN updated_at LIKE '%T%' THEN updated_at  -- Already RFC3339
        ELSE replace(updated_at, ' ', 'T') || 'Z'   -- Convert SQLite format
    END
FROM assets_old;

DROP TABLE assets_old;

-- Asset indexes
CREATE INDEX IF NOT EXISTS idx_assets_kind_active ON assets(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_assets_exchange_mic ON assets(exchange_mic);

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
-- STEP 4: CREATE ASSET ID MAPPING TABLE
-- Maps old asset IDs to new format for FK updates
-- ============================================================================

CREATE TEMP TABLE asset_id_mapping AS
SELECT
    json_extract(metadata, '$.legacy.old_id') AS old_id,
    id AS new_id
FROM assets
WHERE json_extract(metadata, '$.legacy.old_id') IS NOT NULL;

CREATE INDEX idx_asset_id_mapping_old ON asset_id_mapping(old_id);

-- ============================================================================
-- STEP 5: RECREATE ACTIVITIES TABLE WITH NEW SCHEMA
-- ============================================================================

ALTER TABLE activities RENAME TO activities_old;

CREATE TABLE activities (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    asset_id TEXT,

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

    activity_date TEXT NOT NULL,
    settlement_date TEXT,

    quantity TEXT,
    unit_price TEXT,
    amount TEXT,
    fee TEXT,
    currency TEXT NOT NULL,
    fx_rate TEXT,

    notes TEXT,
    metadata TEXT,

    source_system TEXT,
    source_record_id TEXT,
    source_group_id TEXT,
    idempotency_key TEXT,
    import_run_id TEXT,

    is_user_modified INTEGER NOT NULL DEFAULT 0,
    needs_review INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (import_run_id) REFERENCES import_runs(id) ON DELETE SET NULL
);

-- Copy data from old table with asset_id mapped to new format
INSERT INTO activities (
    id, account_id, asset_id, activity_type, status,
    activity_date, quantity, unit_price, amount, fee, currency,
    notes, is_user_modified, needs_review, created_at, updated_at
)
SELECT
    a.id,
    a.account_id,
    -- Map old asset_id to new format, or NULL if not found
    COALESCE(m.new_id, a.asset_id) AS asset_id,
    CASE
        WHEN a.activity_type = 'ADD_HOLDING' THEN 'TRANSFER_IN'
        WHEN a.activity_type = 'REMOVE_HOLDING' THEN 'TRANSFER_OUT'
        WHEN a.activity_type IN ('BUY', 'SELL', 'SPLIT',
                               'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL',
                               'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'TAX', 'CREDIT')
        THEN a.activity_type
        ELSE 'UNKNOWN'
    END,
    'POSTED',
    a.activity_date,
    a.quantity,
    a.unit_price,
    a.amount,
    a.fee,
    a.currency,
    a.comment,
    0,
    0,
    -- Convert datetime format
    CASE
        WHEN a.created_at LIKE '%T%' THEN a.created_at
        ELSE replace(a.created_at, ' ', 'T') || 'Z'
    END,
    CASE
        WHEN a.updated_at LIKE '%T%' THEN a.updated_at
        ELSE replace(a.updated_at, ' ', 'T') || 'Z'
    END
FROM activities_old a
LEFT JOIN asset_id_mapping m ON a.asset_id = m.old_id;

DROP TABLE activities_old;
DROP TABLE asset_id_mapping;

-- Activity indexes
CREATE INDEX ix_activities_account_id ON activities(account_id);
CREATE INDEX ix_activities_asset_id ON activities(asset_id);
CREATE INDEX ix_activities_activity_date ON activities(activity_date);
CREATE INDEX ix_activities_status ON activities(status);
CREATE UNIQUE INDEX ux_activities_idempotency_key ON activities(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Mark existing transfers as external
UPDATE activities
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.flow',
    json_object('is_external', json('true'))
)
WHERE activity_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
  AND status = 'POSTED';

-- ============================================================================
-- STEP 6: UPDATE PLATFORMS TABLE
-- ============================================================================

ALTER TABLE platforms ADD COLUMN external_id TEXT;
ALTER TABLE platforms ADD COLUMN kind TEXT NOT NULL DEFAULT 'BROKERAGE';
ALTER TABLE platforms ADD COLUMN website_url TEXT;
ALTER TABLE platforms ADD COLUMN logo_url TEXT;

-- ============================================================================
-- STEP 7: UPDATE ACCOUNTS TABLE
-- ============================================================================

ALTER TABLE accounts ADD COLUMN account_number TEXT;
ALTER TABLE accounts ADD COLUMN meta TEXT;
ALTER TABLE accounts ADD COLUMN provider TEXT;
ALTER TABLE accounts ADD COLUMN provider_account_id TEXT;

CREATE INDEX ix_accounts_provider ON accounts(provider, provider_account_id) WHERE provider IS NOT NULL;

-- ============================================================================
-- STEP 8: UPDATE HOLDINGS_SNAPSHOTS
-- ============================================================================

ALTER TABLE holdings_snapshots ADD COLUMN cash_total_account_currency TEXT NOT NULL DEFAULT '0';
ALTER TABLE holdings_snapshots ADD COLUMN cash_total_base_currency TEXT NOT NULL DEFAULT '0';

-- Clear snapshots to force recalculation
DELETE FROM holdings_snapshots;
DELETE FROM daily_account_valuation;

-- ============================================================================
-- STEP 9: RESTORE PRAGMA
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
