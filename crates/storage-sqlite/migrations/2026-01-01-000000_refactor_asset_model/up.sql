-- Core Schema v2 Migration (atomic)
-- Transforms assets, activities, accounts, and platforms in a single transaction.
--
-- There is no valid intermediate state between asset ID migration and activity
-- FK remapping, so these MUST run together. If activities still reference
-- bare-symbol IDs (e.g. "AAPL") while assets already have UUIDs, every FK is
-- dangling and the app is broken.
--
-- Source: original schema (asset id=symbol like "AAPL", "SHOP.TO", "$CASH-USD")
-- Target: v2 schema (opaque UUIDs, instrument_key STORED, simplified kinds,
--         sync-aware activities, no CASH asset rows)

PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 1: CLEAN UP ORPHANED DATA
-- ============================================================================

DELETE FROM activities
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = activities.account_id);

-- ============================================================================
-- STEP 2: RECREATE ASSETS TABLE WITH V2 SCHEMA
-- ============================================================================

ALTER TABLE assets RENAME TO assets_old;

CREATE TABLE assets (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || '4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),

    -- Core identity
    kind TEXT NOT NULL,
    name TEXT,
    display_code TEXT,
    notes TEXT,
    metadata TEXT,

    is_active INTEGER NOT NULL DEFAULT 1,

    -- Valuation
    quote_mode TEXT NOT NULL,             -- MARKET | MANUAL
    quote_ccy TEXT NOT NULL,              -- currency prices/valuations are quoted in

    -- Instrument identity (NULL for non-market assets)
    instrument_type TEXT,                 -- EQUITY | CRYPTO | FX | OPTION | METAL
    instrument_symbol TEXT,               -- canonical symbol (AAPL, BTC, EUR)
    instrument_exchange_mic TEXT,         -- ISO 10383 MIC (XNAS, XTSE)

    -- Computed canonical key (materialized on disk, never set directly)
    instrument_key TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instrument_type IS NULL OR instrument_symbol IS NULL THEN NULL
            WHEN instrument_type IN ('FX', 'CRYPTO')
                THEN instrument_type || ':' || instrument_symbol || '/' || quote_ccy
            WHEN instrument_exchange_mic IS NOT NULL
                THEN instrument_type || ':' || instrument_symbol || '@' || instrument_exchange_mic
            ELSE instrument_type || ':' || instrument_symbol
        END
    ) STORED,

    -- Provider configuration (single JSON blob)
    provider_config TEXT,

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK (kind IN (
        'INVESTMENT',
        'PROPERTY', 'VEHICLE', 'COLLECTIBLE', 'PRECIOUS_METAL',
        'PRIVATE_EQUITY', 'LIABILITY', 'OTHER',
        'FX'
    )),
    CHECK (quote_mode IN ('MARKET', 'MANUAL')),
    CHECK (is_active IN (0, 1)),
    CHECK (metadata IS NULL OR json_valid(metadata)),
    CHECK (provider_config IS NULL OR json_valid(provider_config))
);

-- ============================================================================
-- STEP 3: MIGRATE ASSET DATA (excluding CASH rows)
-- ============================================================================

INSERT INTO assets (
    id, kind, name, display_code, notes, metadata,
    is_active, quote_mode, quote_ccy,
    instrument_type, instrument_symbol, instrument_exchange_mic,
    provider_config, created_at, updated_at
)
SELECT
    -- id: opaque UUID
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || '4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),

    -- kind
    CASE
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund',
                           'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND') THEN 'INVESTMENT'
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') THEN 'INVESTMENT'
        WHEN asset_type = 'Option' THEN 'INVESTMENT'
        WHEN asset_type = 'Commodity' THEN 'INVESTMENT'
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX', 'CURRENCY') THEN 'FX'
        WHEN asset_type IN ('Property', 'Real Estate') THEN 'PROPERTY'
        WHEN asset_type = 'Vehicle' THEN 'VEHICLE'
        WHEN asset_type = 'Collectible' THEN 'COLLECTIBLE'
        WHEN asset_type = 'Liability' THEN 'LIABILITY'
        ELSE 'INVESTMENT'
    END,

    name,

    -- display_code
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3) || '/' || substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 1, 3) || '/' || substr(symbol, 4, 3)
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

    -- notes
    notes,

    -- metadata: preserve old_id for FK mapping + legacy data for taxonomy migration
    CASE
        WHEN isin IS NOT NULL AND isin != '' THEN
            json_object(
                'legacy', json_object(
                    'old_id', id,
                    'asset_class', asset_class,
                    'asset_sub_class', asset_sub_class,
                    'sectors', sectors,
                    'countries', countries
                ),
                'identifiers', json_object('isin', isin)
            )
        ELSE
            json_object(
                'legacy', json_object(
                    'old_id', id,
                    'asset_class', asset_class,
                    'asset_sub_class', asset_sub_class,
                    'sectors', sectors,
                    'countries', countries
                )
            )
    END,

    1, -- is_active

    -- quote_mode
    CASE
        WHEN data_source = 'MANUAL' THEN 'MANUAL'
        ELSE 'MARKET'
    END,

    -- quote_ccy
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 4, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 4, 3)
        ELSE currency
    END,

    -- instrument_type
    CASE
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund',
                           'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND') THEN 'EQUITY'
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') THEN 'CRYPTO'
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX', 'CURRENCY') THEN 'FX'
        WHEN asset_type = 'Option' THEN 'OPTION'
        WHEN asset_type = 'Commodity' AND symbol IN ('XAU', 'XAG', 'XPT', 'XPD') THEN 'METAL'
        WHEN asset_type = 'Commodity' THEN 'EQUITY'
        ELSE NULL
    END,

    -- instrument_symbol
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            substr(replace(symbol, '=X', ''), 1, 3)
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            substr(symbol, 1, 3)
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') AND symbol LIKE '%-%' THEN
            substr(symbol, 1, instr(symbol, '-') - 1)
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund',
                           'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND', 'Option', 'Commodity') THEN
            CASE
                WHEN symbol LIKE '%.%' THEN substr(symbol, 1, instr(symbol, '.') - 1)
                ELSE symbol
            END
        ELSE NULL
    END,

    -- instrument_exchange_mic
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
        WHEN asset_type IN ('Stock', 'Equity', 'ETF', 'Etf', 'Mutual Fund', 'MutualFund',
                           'STOCK', 'EQUITY', 'ETF', 'MUTUALFUND')
             AND symbol NOT LIKE '%.%' THEN 'XNAS'
        ELSE NULL
    END,

    -- provider_config
    CASE
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND symbol LIKE '%=X' THEN
            json_object(
                'preferred_provider', COALESCE(data_source, 'YAHOO'),
                'overrides', json_object('YAHOO', json_object('type', 'fx_symbol', 'symbol', symbol))
            )
        WHEN asset_type IN ('Forex', 'Currency', 'FOREX') AND length(symbol) = 6 AND symbol NOT LIKE '%.%' THEN
            json_object(
                'preferred_provider', COALESCE(data_source, 'YAHOO'),
                'overrides', json_object('YAHOO', json_object('type', 'fx_symbol', 'symbol', symbol || '=X'))
            )
        WHEN asset_type IN ('Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') AND symbol LIKE '%-%' THEN
            json_object(
                'preferred_provider', COALESCE(data_source, 'YAHOO'),
                'overrides', json_object('YAHOO', json_object('type', 'crypto_symbol', 'symbol', symbol))
            )
        WHEN symbol_mapping IS NOT NULL AND symbol_mapping != '' AND symbol_mapping != symbol THEN
            json_object(
                'preferred_provider', CASE WHEN data_source IN ('YAHOO', 'ALPHA_VANTAGE', 'MARKETDATA_APP', 'METAL_PRICE_API') THEN data_source ELSE NULL END,
                'overrides', json_object(COALESCE(data_source, 'YAHOO'), json_object('type', 'equity_symbol', 'symbol', symbol_mapping))
            )
        WHEN symbol LIKE '%.%' AND asset_type NOT IN ('Forex', 'Currency', 'FOREX', 'Cryptocurrency', 'Crypto', 'CRYPTOCURRENCY', 'CRYPTO') THEN
            json_object(
                'preferred_provider', CASE WHEN data_source IN ('YAHOO', 'ALPHA_VANTAGE', 'MARKETDATA_APP', 'METAL_PRICE_API') THEN data_source ELSE NULL END,
                'overrides', json_object('YAHOO', json_object('type', 'equity_symbol', 'symbol', symbol))
            )
        WHEN data_source IN ('YAHOO', 'ALPHA_VANTAGE', 'MARKETDATA_APP', 'METAL_PRICE_API') THEN
            json_object('preferred_provider', data_source)
        ELSE NULL
    END,

    -- Timestamps
    CASE WHEN created_at LIKE '%T%' THEN created_at ELSE replace(created_at, ' ', 'T') || 'Z' END,
    CASE WHEN updated_at LIKE '%T%' THEN updated_at ELSE replace(updated_at, ' ', 'T') || 'Z' END

FROM assets_old
WHERE NOT (asset_type IN ('Cash', 'CASH') OR id LIKE '$CASH-%');

DROP TABLE assets_old;

-- Assets indexes
CREATE UNIQUE INDEX idx_assets_instrument_key
ON assets(instrument_key)
WHERE instrument_key IS NOT NULL;

CREATE INDEX idx_assets_kind ON assets(kind);
CREATE INDEX idx_assets_is_active ON assets(is_active);
CREATE INDEX idx_assets_display_code ON assets(display_code);

-- ============================================================================
-- STEP 4: CREATE NEW TABLES
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
-- STEP 5: MAP OLD ASSET IDs → NEW UUIDs AND RECREATE ACTIVITIES
-- ============================================================================

-- Build lookup: old bare-symbol ID (e.g. "AAPL") → new UUID
-- Uses metadata.legacy.old_id saved in STEP 3
CREATE TEMP TABLE asset_id_mapping AS
SELECT
    json_extract(metadata, '$.legacy.old_id') AS old_id,
    id AS new_id
FROM assets
WHERE json_extract(metadata, '$.legacy.old_id') IS NOT NULL;

CREATE INDEX idx_asset_id_mapping_old ON asset_id_mapping(old_id);

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

-- Copy data: map old asset_id → new v2 UUID, CASH/unmapped → NULL
INSERT INTO activities (
    id, account_id, asset_id, activity_type, status,
    activity_date, quantity, unit_price, amount, fee, currency,
    notes, is_user_modified, needs_review, created_at, updated_at
)
SELECT
    a.id,
    a.account_id,
    -- Map to new v2 ID; NULL if CASH or unmapped (LEFT JOIN miss)
    m.new_id AS asset_id,
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
-- STEP 8: UPDATE HOLDINGS SNAPSHOTS
-- ============================================================================

ALTER TABLE holdings_snapshots ADD COLUMN cash_total_account_currency TEXT NOT NULL DEFAULT '0';
ALTER TABLE holdings_snapshots ADD COLUMN cash_total_base_currency TEXT NOT NULL DEFAULT '0';

-- Clear snapshots to force recalculation with new asset IDs
DELETE FROM holdings_snapshots;
DELETE FROM daily_account_valuation;

-- ============================================================================
-- STEP 9: RESTORE PRAGMA
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
