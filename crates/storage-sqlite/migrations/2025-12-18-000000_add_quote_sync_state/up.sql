-- Quote sync state tracking table
-- Tracks the sync status and requirements for each symbol to optimize quote fetching

CREATE TABLE IF NOT EXISTS quote_sync_state (
    -- Primary key is the symbol
    symbol TEXT PRIMARY KEY,

    -- Position tracking
    is_active INTEGER NOT NULL DEFAULT 1,          -- 1 = has open position, 0 = closed
    first_activity_date TEXT,                       -- Earliest activity date for this symbol (YYYY-MM-DD)
    last_activity_date TEXT,                        -- Most recent activity date (YYYY-MM-DD)
    position_closed_date TEXT,                      -- When position fully closed, NULL if open (YYYY-MM-DD)

    -- Sync tracking
    last_synced_at TEXT,                            -- Last successful sync timestamp (RFC3339)
    last_quote_date TEXT,                           -- Date of most recent quote in DB (YYYY-MM-DD)
    earliest_quote_date TEXT,                       -- Earliest quote date in DB (YYYY-MM-DD)

    -- Metadata
    data_source TEXT NOT NULL DEFAULT 'YAHOO',
    sync_priority INTEGER NOT NULL DEFAULT 0,       -- Higher = sync first (active=100, backfill=90, new=80, recently_closed=50)
    error_count INTEGER NOT NULL DEFAULT 0,         -- Consecutive sync failures
    last_error TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for filtering active symbols (most common query)
CREATE INDEX IF NOT EXISTS idx_quote_sync_state_active ON quote_sync_state(is_active);

-- Index for priority-based sync ordering
CREATE INDEX IF NOT EXISTS idx_quote_sync_state_priority ON quote_sync_state(sync_priority DESC);

-- Index for finding symbols that need backfill
CREATE INDEX IF NOT EXISTS idx_quote_sync_state_dates ON quote_sync_state(first_activity_date, earliest_quote_date);
