-- Your SQL goes here

-- Add amount field to activities table
ALTER TABLE activities ADD COLUMN amount TEXT DEFAULT NULL;

-- Update unit_price to quantity for cash activities (to fix the wrong values)
UPDATE activities 
SET 
    amount = unit_price * quantity,
    quantity = 0,
    unit_price = 0
WHERE activity_type IN ('DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'CONVERSION_IN', 'CONVERSION_OUT', 'FEE', 'TAX', 'SPLIT');

-- Rename comment column to notes in assets table
ALTER TABLE assets RENAME COLUMN comment TO notes;

-- Convert existing numeric fields from DOUBLE to TEXT for BigDecimal storage
-- First create temporary table with new schema
CREATE TABLE activities_new (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TIMESTAMP NOT NULL,
    quantity TEXT NOT NULL,  -- Changed from DOUBLE to TEXT
    unit_price TEXT NOT NULL, -- Changed from DOUBLE to TEXT
    currency TEXT NOT NULL,
    fee TEXT NOT NULL, -- Changed from DOUBLE to TEXT
    amount TEXT, -- New field for cash activities amount
    is_draft BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Copy data from old table to new table, converting numeric values to TEXT
INSERT INTO activities_new (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
)
SELECT 
    id, account_id, asset_id, activity_type, activity_date,
    CAST(quantity AS TEXT), CAST(unit_price AS TEXT), currency, CAST(fee AS TEXT),
    CAST(amount AS TEXT), 
    is_draft, comment, created_at, updated_at
FROM activities;

-- Drop old table
DROP TABLE activities;

-- Rename new table to original name
ALTER TABLE activities_new RENAME TO activities;

-- Recreate indexes and foreign keys
CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- For portfolio_history table, completely drop it and recreate from scratch
DROP TABLE IF EXISTS portfolio_history;

-- Create fresh portfolio_history table with explicit TEXT types
CREATE TABLE portfolio_history (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    total_value TEXT NOT NULL,
    market_value TEXT NOT NULL,
    book_cost TEXT NOT NULL,
    available_cash TEXT NOT NULL,
    net_deposit TEXT NOT NULL,
    currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    total_gain_value TEXT NOT NULL,
    total_gain_percentage TEXT NOT NULL,
    day_gain_percentage TEXT NOT NULL,
    day_gain_value TEXT NOT NULL,
    allocation_percentage TEXT NOT NULL,
    exchange_rate TEXT NOT NULL,
    holdings TEXT,
    calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_portfolio_history_account_id ON portfolio_history(account_id);
CREATE INDEX idx_portfolio_history_date ON portfolio_history(date);

-- Create temporary quotes table with only the columns that exist in the old table
CREATE TABLE quotes_temp AS 
SELECT id, symbol, date, open, high, low, close, adjclose, volume, data_source, created_at 
FROM quotes 
WHERE data_source = 'MANUAL';

-- Drop and recreate quotes table with new structure
DROP TABLE IF EXISTS quotes;

CREATE TABLE quotes (
    id TEXT NOT NULL PRIMARY KEY,
    symbol TEXT NOT NULL,
    date TIMESTAMP NOT NULL,
    open TEXT NOT NULL,
    high TEXT NOT NULL,
    low TEXT NOT NULL,
    close TEXT NOT NULL,
    adjclose TEXT NOT NULL,
    volume TEXT NOT NULL,
    currency TEXT NOT NULL,
    data_source TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT "quotes_asset_id_fkey" FOREIGN KEY ("symbol") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Reinsert the MANUAL quotes with numeric values converted to TEXT
-- Join with assets table to get the correct currency
INSERT INTO quotes (
    id, symbol, date, open, high, low, close, 
    adjclose, volume, currency, data_source, created_at
)
SELECT 
    q.id, q.symbol, q.date,
    CAST(q.open AS TEXT),
    CAST(q.high AS TEXT),
    CAST(q.low AS TEXT),
    CAST(q.close AS TEXT),
    CAST(q.adjclose AS TEXT),
    CAST(q.volume AS TEXT),
    a.currency,
    q.data_source, q.created_at
FROM quotes_temp q
JOIN assets a ON q.symbol = a.id;

-- Drop temporary table
DROP TABLE quotes_temp;

-- Create indexes for quotes table
CREATE INDEX idx_quotes_symbol_date ON quotes(symbol, date);
CREATE INDEX idx_quotes_date ON quotes(date);
CREATE INDEX idx_quotes_symbol ON quotes(symbol);

-- Add foreign key constraints
PRAGMA foreign_keys = OFF;
PRAGMA foreign_keys = ON;
