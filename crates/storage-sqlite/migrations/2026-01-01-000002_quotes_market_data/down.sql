-- Revert Quotes & Market Data Migration

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- Drop exchanges table
DROP TABLE IF EXISTS exchanges;

-- Remove Finnhub provider
DELETE FROM market_data_providers WHERE id = 'FINNHUB';

-- Drop quote_sync_state
DROP TABLE IF EXISTS quote_sync_state;

-- Revert quotes table
DROP INDEX IF EXISTS uq_quotes_asset_day_source;
DROP INDEX IF EXISTS idx_quotes_asset_day;
DROP INDEX IF EXISTS idx_quotes_asset_source_day;
DROP INDEX IF EXISTS idx_quotes_manual;

ALTER TABLE quotes RENAME TO quotes_new;

CREATE TABLE quotes (
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
    CONSTRAINT quotes_asset_id_fkey FOREIGN KEY (symbol) REFERENCES assets (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO quotes (
    id, symbol, timestamp, open, high, low, close, adjclose, volume,
    currency, data_source, created_at
)
SELECT
    asset_id || '_' || replace(day, '-', '') || '_' || source,
    asset_id,
    timestamp,
    COALESCE(open, '0'),
    COALESCE(high, '0'),
    COALESCE(low, '0'),
    close,
    COALESCE(adjclose, '0'),
    COALESCE(volume, '0'),
    currency,
    source,
    created_at
FROM quotes_new;

DROP TABLE quotes_new;

CREATE INDEX idx_quotes_symbol_date ON quotes(symbol, timestamp);
CREATE INDEX idx_quotes_date ON quotes(timestamp);
CREATE INDEX idx_quotes_symbol ON quotes(symbol);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
