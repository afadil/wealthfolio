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
-- Map old symbol to new asset_id using legacy_asset_id_map generated in
-- 2026-01-01-000000_refactor_asset_model.
-- Use a temp map table so join uses a plain indexed text column.
CREATE TEMP TABLE asset_old_id_map AS
SELECT
    old_id,
    new_id
FROM legacy_asset_id_map;

CREATE INDEX idx_asset_old_id_map_old_id ON asset_old_id_map(old_id);

INSERT INTO quotes_new (
    id, asset_id, day, source, open, high, low, close, adjclose, volume,
    currency, notes, created_at, timestamp
)
SELECT
    -- Use mapped asset_id in the quote ID
    rq.mapped_asset_id || '_' || rq.day || '_' || rq.data_source,
    rq.mapped_asset_id AS asset_id,
    rq.day,
    rq.data_source AS source,
    CASE WHEN rq.open = '0' THEN NULL ELSE rq.open END,
    CASE WHEN rq.high = '0' THEN NULL ELSE rq.high END,
    CASE WHEN rq.low = '0' THEN NULL ELSE rq.low END,
    rq.close,
    CASE WHEN rq.adjclose = '0' THEN NULL ELSE rq.adjclose END,
    CASE WHEN rq.volume = '0' THEN NULL ELSE rq.volume END,
    rq.currency,
    NULL, -- notes (new column)
    -- Convert datetime format
    CASE
        WHEN rq.created_at LIKE '%T%' THEN rq.created_at
        ELSE replace(rq.created_at, ' ', 'T') || 'Z'
    END,
    -- Convert timestamp format
    CASE
        WHEN rq.timestamp LIKE '%T%' THEN rq.timestamp
        ELSE replace(rq.timestamp, ' ', 'T') || 'Z'
    END
FROM (
    SELECT
        q.*,
        COALESCE(m.new_id, q.symbol) AS mapped_asset_id,
        substr(q.timestamp, 1, 10) AS day,
        row_number() OVER (
            PARTITION BY COALESCE(m.new_id, q.symbol), substr(q.timestamp, 1, 10), q.data_source
            ORDER BY q.timestamp DESC, q.created_at DESC, q.id DESC
        ) AS row_num
    FROM quotes q
    LEFT JOIN asset_old_id_map m ON m.old_id = q.symbol
) rq
WHERE rq.row_num = 1;

DROP TABLE asset_old_id_map;
DROP TABLE legacy_asset_id_map;

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
