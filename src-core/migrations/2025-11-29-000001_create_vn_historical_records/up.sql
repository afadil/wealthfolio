-- VN Market Historical Records Cache
-- Stores historical price data for Vietnamese market assets (stocks, funds, gold, indices)

CREATE TABLE vn_historical_records (
    id TEXT PRIMARY KEY NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL,  -- STOCK, FUND, GOLD, INDEX
    date TEXT NOT NULL,
    open TEXT NOT NULL,
    high TEXT NOT NULL,
    low TEXT NOT NULL,
    close TEXT NOT NULL,
    adjclose TEXT NOT NULL,
    volume TEXT NOT NULL,
    nav TEXT,                  -- For funds (Net Asset Value)
    buy_price TEXT,            -- For gold
    sell_price TEXT,           -- For gold
    currency TEXT NOT NULL DEFAULT 'VND',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(symbol, date, asset_type)
);

-- Index for efficient date range queries
CREATE INDEX idx_vn_historical_symbol_date ON vn_historical_records(symbol, date);

-- Index for filtering by asset type
CREATE INDEX idx_vn_historical_asset_type ON vn_historical_records(asset_type);

-- Index for cleanup queries (by date)
CREATE INDEX idx_vn_historical_date ON vn_historical_records(date);
