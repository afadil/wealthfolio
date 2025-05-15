-- This file should undo anything in `up.sql`
DROP TABLE IF EXISTS daily_account_valuation;
DROP TABLE IF EXISTS holdings_snapshots; -- This will also drop associated indexes implicitly, but good practice to be explicit for new ones.


-- Recreate the original portfolio_history table
CREATE TABLE portfolio_history (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    date DATE NOT NULL,
    total_value NUMERIC NOT NULL DEFAULT 0,
    market_value NUMERIC NOT NULL DEFAULT 0,
    book_cost NUMERIC NOT NULL DEFAULT 0,
    available_cash NUMERIC NOT NULL DEFAULT 0,
    net_deposit NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    total_gain_value NUMERIC NOT NULL DEFAULT 0,
    total_gain_percentage NUMERIC NOT NULL DEFAULT 0,
    day_gain_percentage NUMERIC NOT NULL DEFAULT 0,
    day_gain_value NUMERIC NOT NULL DEFAULT 0,
    allocation_percentage NUMERIC NOT NULL DEFAULT 0,
    exchange_rate NUMERIC NOT NULL DEFAULT 0,
    holdings TEXT,
	calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Added default value
    UNIQUE(account_id, date)
);
CREATE INDEX idx_portfolio_history_account_date ON portfolio_history(account_id, date);
