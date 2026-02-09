-- Quotes & Market Data Migration
-- Refactors quotes table and creates quote sync infrastructure
--
-- Key changes:
-- - quotes: symbol → asset_id, data_source → source, add day column, add notes
-- - quote_sync_state: tracks sync status per asset
-- - Finnhub provider added to market_data_providers
-- ============================================================================

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 1: REFACTOR QUOTES TABLE
-- ============================================================================

CREATE TABLE quotes_new (
    id          TEXT NOT NULL PRIMARY KEY,
    asset_id    TEXT NOT NULL,
    day         TEXT NOT NULL,
    source      TEXT NOT NULL,
    open        TEXT,
    high        TEXT,
    low         TEXT,
    close       TEXT NOT NULL,
    adjclose    TEXT,
    volume      TEXT,
    currency    TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    timestamp   TEXT NOT NULL,

    CHECK (length(day) = 10),

    CONSTRAINT quotes_asset_fkey FOREIGN KEY (asset_id)
        REFERENCES assets (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Migrate data with deterministic ID generation
-- ID format: {asset_id}_{YYYY-MM-DD}_{source}
-- Map old symbol to new asset_id using metadata.legacy.old_id
INSERT INTO quotes_new (
    id, asset_id, day, source, open, high, low, close, adjclose, volume,
    currency, notes, created_at, timestamp
)
SELECT
    -- Use new asset_id in the quote ID
    COALESCE(a.id, q.symbol) || '_' || substr(q.timestamp, 1, 10) || '_' || q.data_source,
    -- Map old symbol to new asset_id
    COALESCE(a.id, q.symbol) AS asset_id,
    substr(q.timestamp, 1, 10) AS day,
    q.data_source AS source,
    CASE WHEN q.open = '0' THEN NULL ELSE q.open END,
    CASE WHEN q.high = '0' THEN NULL ELSE q.high END,
    CASE WHEN q.low = '0' THEN NULL ELSE q.low END,
    q.close,
    CASE WHEN q.adjclose = '0' THEN NULL ELSE q.adjclose END,
    CASE WHEN q.volume = '0' THEN NULL ELSE q.volume END,
    q.currency,
    NULL, -- notes (new column)
    -- Convert datetime format
    CASE
        WHEN q.created_at LIKE '%T%' THEN q.created_at
        ELSE replace(q.created_at, ' ', 'T') || 'Z'
    END,
    -- Convert timestamp format
    CASE
        WHEN q.timestamp LIKE '%T%' THEN q.timestamp
        ELSE replace(q.timestamp, ' ', 'T') || 'Z'
    END
FROM quotes q
LEFT JOIN assets a ON json_extract(a.metadata, '$.legacy.old_id') = q.symbol;

DROP TABLE quotes;
ALTER TABLE quotes_new RENAME TO quotes;

-- Quotes indexes
CREATE UNIQUE INDEX uq_quotes_asset_day_source ON quotes(asset_id, day, source);
CREATE INDEX idx_quotes_asset_day ON quotes(asset_id, day);
CREATE INDEX idx_quotes_asset_source_day ON quotes(asset_id, source, day);
CREATE INDEX idx_quotes_manual ON quotes(asset_id, day DESC) WHERE source = 'MANUAL';

-- ============================================================================
-- STEP 2: CREATE QUOTE_SYNC_STATE TABLE
-- ============================================================================
--
-- This table tracks sync coordination state per asset. It is NOT a cache of
-- operational data. Activity dates and quote bounds are computed on-the-fly
-- from the activities and quotes tables at sync planning time.
--
-- Fields:
--   is_active, position_closed_date: position state (derived from snapshots)
--   last_synced_at: when last sync was attempted
--   data_source: which provider to use for this asset
--   sync_priority: ordering for sync operations
--   error_count, last_error: health tracking for retry logic
--   profile_enriched_at: tracks asset profile enrichment

-- Position state is derived from position_closed_date:
--   NULL = active position, NOT NULL = closed position
CREATE TABLE quote_sync_state (
    asset_id TEXT PRIMARY KEY,
    position_closed_date TEXT,  -- NULL = active, NOT NULL = closed (date when position was closed)
    last_synced_at TEXT,
    data_source TEXT NOT NULL DEFAULT 'YAHOO',
    sync_priority INTEGER NOT NULL DEFAULT 1,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    profile_enriched_at TEXT,  -- NULL = needs enrichment, set after successful enrichment
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_quote_sync_state_priority ON quote_sync_state(sync_priority DESC);

-- ============================================================================
-- STEP 3: ADD FINNHUB PROVIDER
-- ============================================================================

INSERT INTO market_data_providers (id, name, description, url, priority, enabled, logo_filename, last_synced_at, last_sync_status, last_sync_error)
VALUES
    ('FINNHUB', 'Finnhub', 'Finnhub provides real-time stock, forex, and cryptocurrency data with global coverage. Free tier includes 60 API calls/minute.', 'https://finnhub.io/', 4, FALSE, 'finnhub.png', NULL, NULL, NULL);


-- ============================================================================
-- STEP 5: RESTORE PRAGMAS
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
