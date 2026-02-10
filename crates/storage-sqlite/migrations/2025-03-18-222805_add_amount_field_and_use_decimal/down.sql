-- This file should undo anything in `up.sql`

-- Revert ADD_HOLDING back to TRANSFER_IN and REMOVE_HOLDING back to TRANSFER_OUT for non-cash assets
UPDATE activities
SET activity_type = 'TRANSFER_IN'
WHERE activity_type = 'ADD_HOLDING' AND asset_id NOT LIKE '$CASH-%';

UPDATE activities
SET activity_type = 'TRANSFER_OUT'
WHERE activity_type = 'REMOVE_HOLDING' AND asset_id NOT LIKE '$CASH-%';

-- Rename notes column back to comment in assets table
ALTER TABLE assets RENAME COLUMN notes TO comment;

-- Create temporary table with old schema
CREATE TABLE activities_old (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TIMESTAMP NOT NULL,
    quantity DOUBLE NOT NULL,
    unit_price DOUBLE NOT NULL,
    currency TEXT NOT NULL,
    fee DOUBLE NOT NULL,
    is_draft BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Copy data from new table to old table, converting TEXT values back to DOUBLE and TEXT timestamps back to TIMESTAMP format
-- For cash activities, we need to restore the original values from amount
INSERT INTO activities_old (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee,
    is_draft, comment, created_at, updated_at
)
SELECT
    id, account_id, asset_id, activity_type,
    datetime(activity_date),
    -- quantity: set to 1.0 for types where 'amount' held the total value in up.sql
    -- For FEE and non-cash transfers (ADD_HOLDING/REMOVE_HOLDING), original quantity is restored.
    CASE
        WHEN activity_type IN ('DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'CONVERSION_IN', 'CONVERSION_OUT', 'TAX', 'SPLIT') THEN 1.0
        ELSE CAST(quantity AS DOUBLE)
    END as quantity,
    -- unit_price: set to 'amount' for types where 'amount' held the total value/original unit_price.
    -- For FEE and non-cash transfers, original unit_price is restored.
    CASE
        WHEN activity_type IN ('DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'CONVERSION_IN', 'CONVERSION_OUT', 'TAX', 'SPLIT') THEN
            COALESCE(CAST(amount AS DOUBLE), 0.0)
        ELSE CAST(unit_price AS DOUBLE)
    END as unit_price,
    currency,
    -- fee: For FEE type, restore from 'amount'; otherwise, restore from 'fee'.
    CASE
        WHEN activity_type = 'FEE' THEN COALESCE(CAST(amount AS DOUBLE), 0.0)
        ELSE CAST(fee AS DOUBLE)
    END as fee,
    is_draft, comment,
    datetime(created_at),
    datetime(updated_at)
FROM activities;

-- Drop new table
DROP TABLE activities;

-- Rename old table to original name
ALTER TABLE activities_old RENAME TO activities;

-- Recreate indexes and foreign keys
CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- Drop the TEXT based portfolio_history table
DROP TABLE IF EXISTS portfolio_history;

-- Create original portfolio_history with DOUBLE types
CREATE TABLE portfolio_history (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    date DATE NOT NULL,
    total_value DOUBLE NOT NULL,
    market_value DOUBLE NOT NULL,
    book_cost DOUBLE NOT NULL,
    available_cash DOUBLE NOT NULL,
    net_deposit DOUBLE NOT NULL,
    currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    total_gain_value DOUBLE NOT NULL,
    total_gain_percentage DOUBLE NOT NULL,
    day_gain_percentage DOUBLE NOT NULL,
    day_gain_value DOUBLE NOT NULL,
    allocation_percentage DOUBLE NOT NULL,
    exchange_rate DOUBLE NOT NULL,
    holdings TEXT,
    calculated_at TIMESTAMP NOT NULL
);

-- Create indexes
CREATE INDEX idx_portfolio_history_account_id ON portfolio_history(account_id);
CREATE INDEX idx_portfolio_history_date ON portfolio_history(date);

-- Add foreign key constraints
PRAGMA foreign_keys = OFF;
PRAGMA foreign_keys = ON;

-- Create temporary quotes table with old schema (without currency)
CREATE TABLE quotes_old (
    id TEXT NOT NULL PRIMARY KEY,
    symbol TEXT NOT NULL,
    date TIMESTAMP NOT NULL,
    open DOUBLE NOT NULL,
    high DOUBLE NOT NULL,
    low DOUBLE NOT NULL,
    close DOUBLE NOT NULL,
    adjclose DOUBLE NOT NULL,
    volume DOUBLE NOT NULL,
    data_source TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT "quotes_asset_id_fkey" FOREIGN KEY ("symbol") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Copy data from new table to old table, converting TEXT values back to DOUBLE and TEXT timestamps back to TIMESTAMP format
INSERT INTO quotes_old (
    id, symbol, date, open, high, low, close, 
    adjclose, volume, data_source, created_at
)
SELECT 
    id, symbol, date,
    CAST(open AS DOUBLE),
    CAST(high AS DOUBLE),
    CAST(low AS DOUBLE),
    CAST(close AS DOUBLE),
    CAST(adjclose AS DOUBLE),
    CAST(volume AS DOUBLE),
    data_source, created_at
FROM quotes;

-- Drop new table
DROP TABLE quotes;

-- Rename old table to original name
ALTER TABLE quotes_old RENAME TO quotes;

-- Recreate indexes for quotes table
CREATE INDEX idx_quotes_symbol_date ON quotes(symbol, date);
CREATE INDEX idx_quotes_date ON quotes(date);
CREATE INDEX idx_quotes_symbol ON quotes(symbol);

