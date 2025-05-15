-- Your SQL goes here
-- Drop the existing table (Warning: Deletes all data!)
DROP TABLE IF EXISTS portfolio_history;

-- Recreate the table with the new snapshot structure
CREATE TABLE holdings_snapshots (
    id TEXT PRIMARY KEY NOT NULL,           -- PK: e.g., "ACCOUNTID_YYYY-MM-DD"
    account_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,            -- Format: YYYY-MM-DD
    currency TEXT NOT NULL,

    -- Store complex data as JSON strings
    positions TEXT NOT NULL DEFAULT '{}',     -- JSON HashMap<String, Position>
    cash_balances TEXT NOT NULL DEFAULT '{}', -- JSON HashMap<String, Decimal>

    -- Store Decimals as TEXT
    cost_basis TEXT NOT NULL DEFAULT '0.0',
    net_contribution TEXT NOT NULL DEFAULT '0.0',

    -- Store timestamp
    calculated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Store as ISO 8601 string
);


-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_account_date ON holdings_snapshots (account_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_date ON holdings_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_account_id ON holdings_snapshots (account_id);


-- table to store daily account history valuation metrics
CREATE TABLE daily_account_valuation (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    valuation_date DATE NOT NULL, -- Assuming NaiveDate maps to DATE
    account_currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    fx_rate_to_base TEXT NOT NULL, -- Storing Decimal as TEXT
    cash_balance TEXT NOT NULL,
    investment_market_value TEXT NOT NULL,
    total_value TEXT NOT NULL,
    cost_basis TEXT NOT NULL,
    net_contribution TEXT NOT NULL,
    calculated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) -- Store as ISO 8601 string with default
);

-- Add index for faster lookups by account_id and date
CREATE INDEX idx_daily_account_valuation_account_date ON daily_account_valuation(account_id, valuation_date);
