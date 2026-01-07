-- ============================================================================
-- QUOTE SCHEMA REFACTOR MIGRATION - ROLLBACK
-- ============================================================================

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- ============================================================================
-- STEP 1: Create old quotes table schema
-- ============================================================================

CREATE TABLE quotes_old (
    id TEXT NOT NULL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    open TEXT NOT NULL,
    high TEXT NOT NULL,
    low TEXT NOT NULL,
    close TEXT NOT NULL,
    adjclose TEXT NOT NULL,
    volume TEXT NOT NULL,
    currency TEXT NOT NULL,
    data_source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    notes TEXT,
    CONSTRAINT quotes_asset_id_fkey FOREIGN KEY (symbol)
        REFERENCES assets (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================================
-- STEP 2: Migrate data back
-- ============================================================================

INSERT INTO quotes_old (
    id, symbol, timestamp, open, high, low, close, adjclose, volume,
    currency, data_source, created_at, notes
)
SELECT
    -- Restore original ID format (best effort - may differ from original)
    asset_id || '_' || substr(day, 1, 4) || substr(day, 6, 2) || substr(day, 9, 2),
    asset_id AS symbol,
    timestamp,
    COALESCE(open, '0'),
    COALESCE(high, '0'),
    COALESCE(low, '0'),
    close,
    COALESCE(adjclose, '0'),
    COALESCE(volume, '0'),
    currency,
    source AS data_source,
    created_at,
    notes
FROM quotes;

-- ============================================================================
-- STEP 3: Drop new table and rename old one
-- ============================================================================

DROP TABLE quotes;
ALTER TABLE quotes_old RENAME TO quotes;

-- ============================================================================
-- STEP 4: Recreate old indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quotes_symbol_date ON quotes(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(timestamp);
CREATE INDEX IF NOT EXISTS idx_quotes_manual_symbol
ON quotes (symbol, timestamp DESC)
WHERE data_source = 'MANUAL';

-- ============================================================================
-- STEP 5: Revert quote_sync_state (asset_id -> symbol)
-- ============================================================================

CREATE TABLE quote_sync_state_old (
    symbol TEXT PRIMARY KEY,
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

INSERT INTO quote_sync_state_old (
    symbol, is_active, first_activity_date, last_activity_date,
    position_closed_date, last_synced_at, last_quote_date, earliest_quote_date,
    data_source, sync_priority, error_count, last_error, created_at, updated_at
)
SELECT
    asset_id AS symbol, is_active, first_activity_date, last_activity_date,
    position_closed_date, last_synced_at, last_quote_date, earliest_quote_date,
    data_source, sync_priority, error_count, last_error, created_at, updated_at
FROM quote_sync_state;

DROP TABLE quote_sync_state;
ALTER TABLE quote_sync_state_old RENAME TO quote_sync_state;

-- ============================================================================
-- STEP 6: Restore pragmas
-- ============================================================================

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
