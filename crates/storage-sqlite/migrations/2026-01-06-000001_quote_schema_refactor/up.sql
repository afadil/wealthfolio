-- ============================================================================
-- QUOTE SCHEMA REFACTOR MIGRATION
-- ============================================================================
-- This migration updates the quotes table to use cleaner naming:
-- - `symbol` -> `asset_id` (our internal asset identifier)
-- - `data_source` -> `source` (manual or provider id)
-- - Add `day` column (YYYY-MM-DD extracted from timestamp)
-- - Generate deterministic quote IDs: {asset_id}_{day}_{source}
-- - Add proper indexes for the new column patterns
-- ============================================================================

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 1: Create new quotes table with updated schema
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

    -- Enforce YYYY-MM-DD format for day
    CHECK (length(day) = 10),

    -- Foreign key to assets table
    CONSTRAINT quotes_asset_fkey FOREIGN KEY (asset_id)
        REFERENCES assets (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================================
-- STEP 2: Migrate data with deterministic ID generation
-- ============================================================================

INSERT INTO quotes_new (
    id, asset_id, day, source, open, high, low, close, adjclose, volume,
    currency, notes, created_at, timestamp
)
SELECT
    -- Generate deterministic ID: {asset_id}_{YYYY-MM-DD}_{source}
    symbol || '_' || substr(timestamp, 1, 10) || '_' || data_source,
    symbol AS asset_id,
    substr(timestamp, 1, 10) AS day,
    data_source AS source,
    CASE WHEN open = '0' THEN NULL ELSE open END,
    CASE WHEN high = '0' THEN NULL ELSE high END,
    CASE WHEN low = '0' THEN NULL ELSE low END,
    close,
    CASE WHEN adjclose = '0' THEN NULL ELSE adjclose END,
    CASE WHEN volume = '0' THEN NULL ELSE volume END,
    currency,
    notes,
    created_at,
    timestamp
FROM quotes;

-- ============================================================================
-- STEP 3: Drop old table and rename new one
-- ============================================================================

DROP TABLE quotes;
ALTER TABLE quotes_new RENAME TO quotes;

-- ============================================================================
-- STEP 4: Create indexes
-- ============================================================================

-- Primary lookup: asset + day + source (unique constraint)
CREATE UNIQUE INDEX uq_quotes_asset_day_source ON quotes(asset_id, day, source);

-- Common queries: asset + day range
CREATE INDEX idx_quotes_asset_day ON quotes(asset_id, day);

-- Source-filtered queries: asset + source + day
CREATE INDEX idx_quotes_asset_source_day ON quotes(asset_id, source, day);

-- Manual quotes lookup (for import service)
CREATE INDEX idx_quotes_manual
ON quotes(asset_id, day DESC)
WHERE source = 'MANUAL';

-- ============================================================================
-- STEP 5: Rename symbol -> asset_id in quote_sync_state
-- ============================================================================

CREATE TABLE quote_sync_state_new (
    asset_id TEXT PRIMARY KEY,
    is_active INTEGER NOT NULL DEFAULT 1,
    first_activity_date TEXT,
    last_activity_date TEXT,
    position_closed_date TEXT,
    last_synced_at TEXT,
    last_quote_date TEXT,
    earliest_quote_date TEXT,
    data_source TEXT NOT NULL DEFAULT 'YAHOO',
    sync_priority INTEGER NOT NULL DEFAULT 1,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO quote_sync_state_new (
    asset_id, is_active, first_activity_date, last_activity_date,
    position_closed_date, last_synced_at, last_quote_date, earliest_quote_date,
    data_source, sync_priority, error_count, last_error, created_at, updated_at
)
SELECT
    symbol AS asset_id, is_active, first_activity_date, last_activity_date,
    position_closed_date, last_synced_at, last_quote_date, earliest_quote_date,
    data_source, sync_priority, error_count, last_error, created_at, updated_at
FROM quote_sync_state;

DROP TABLE quote_sync_state;
ALTER TABLE quote_sync_state_new RENAME TO quote_sync_state;

-- ============================================================================
-- STEP 6: Restore pragmas
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
