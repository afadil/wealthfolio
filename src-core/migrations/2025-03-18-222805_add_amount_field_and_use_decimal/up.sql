-- Your SQL goes here

-- Add amount field to activities table
ALTER TABLE activities ADD COLUMN amount TEXT DEFAULT NULL;

-- Update unit_price to quantity for cash activities (to fix the wrong values)
UPDATE activities 
SET 
    amount = unit_price * quantity,
    quantity = 0,
    unit_price = 0
WHERE activity_type IN ('DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'CONVERSION_IN', 'CONVERSION_OUT', 'FEE', 'TAX');

UPDATE activities 
SET 
    amount = unit_price,
    quantity = 0,
    unit_price = 0
WHERE activity_type = 'SPLIT';


UPDATE activities 
SET 
    amount = unit_price * quantity,
    quantity = 0,
    unit_price = 0
WHERE activity_type IN ('TRANSFER_IN', 'TRANSFER_OUT') AND asset_id LIKE '$CASH-%';

-- Update TRANSFER_IN to ADD_HOLDING and TRANSFER_OUT to REMOVE_HOLDING for non-cash assets
UPDATE activities
SET activity_type = 'ADD_HOLDING'
WHERE activity_type = 'TRANSFER_IN' AND asset_id NOT LIKE '$CASH-%';

UPDATE activities
SET activity_type = 'REMOVE_HOLDING'
WHERE activity_type = 'TRANSFER_OUT' AND asset_id NOT LIKE '$CASH-%';

-- Rename CONVERSION_IN/OUT to TRANSFER_IN/OUT
UPDATE activities SET activity_type = 'TRANSFER_IN' WHERE activity_type = 'CONVERSION_IN';
UPDATE activities SET activity_type = 'TRANSFER_OUT' WHERE activity_type = 'CONVERSION_OUT';

-- Rename comment column to notes in assets table
ALTER TABLE assets RENAME COLUMN comment TO notes;

-- Convert existing numeric fields from DOUBLE to TEXT for BigDecimal storage
-- First create temporary table with new schema
CREATE TABLE activities_new (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity TEXT NOT NULL,
    unit_price TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee TEXT NOT NULL,
    amount TEXT,
    is_draft BOOLEAN NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data from old table to new table, converting numeric values to TEXT and timestamps to RFC3339 UTC
INSERT INTO activities_new (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
)
SELECT 
    id, account_id, asset_id, activity_type, 
    strftime('%Y-%m-%dT%H:%M:%fZ', activity_date),
    CAST(quantity AS TEXT), CAST(unit_price AS TEXT), currency, CAST(fee AS TEXT),
    CAST(amount AS TEXT), 
    is_draft, comment, 
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
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


-- Create temporary quotes table with only the columns that exist in the old table
CREATE TABLE quotes_temp AS 
SELECT id, symbol, date, open, high, low, close, adjclose, volume, data_source, created_at 
FROM quotes;
-- WHERE data_source = 'MANUAL';

-- Drop and recreate quotes table with new structure
DROP TABLE IF EXISTS quotes;

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
    CONSTRAINT "quotes_asset_id_fkey" FOREIGN KEY ("symbol") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Reinsert the MANUAL quotes with numeric values converted to TEXT and timestamp converted to RFC3339 UTC
-- Join with assets table to get the correct currency
INSERT INTO quotes (
    id, symbol, timestamp, open, high, low, close,
    adjclose, volume, currency, data_source, created_at
)
SELECT
    q.id, q.symbol,
    strftime('%Y-%m-%dT%H:%M:%fZ', q.date),
    CAST(q.open AS TEXT),
    CAST(q.high AS TEXT),
    CAST(q.low AS TEXT),
    CAST(q.close AS TEXT),
    CAST(q.adjclose AS TEXT),
    CAST(q.volume AS TEXT),
    a.currency,
    q.data_source,
    strftime('%Y-%m-%dT%H:%M:%fZ', q.created_at)
FROM quotes_temp q
JOIN assets a ON q.symbol = a.id
WHERE q.data_source = 'MANUAL';

-- Drop temporary table
DROP TABLE quotes_temp;

-- Create indexes for quotes table
CREATE INDEX idx_quotes_symbol_date ON quotes(symbol, timestamp);
CREATE INDEX idx_quotes_date ON quotes(timestamp);
CREATE INDEX idx_quotes_symbol ON quotes(symbol);

-- Add foreign key constraints
PRAGMA foreign_keys = OFF;
PRAGMA foreign_keys = ON;
