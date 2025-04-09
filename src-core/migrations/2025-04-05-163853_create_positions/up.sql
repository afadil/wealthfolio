
-- Create new tables with desired names
CREATE TABLE positions (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES Accounts(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    quantity TEXT NOT NULL,                -- Decimal as TEXT
    average_cost TEXT NOT NULL,            -- Decimal as TEXT
    total_cost_basis TEXT NOT NULL,        -- Decimal as TEXT
    inception_date TEXT NOT NULL,          -- DateTime<Utc> as TEXT (ISO 8601)
    last_updated TEXT NOT NULL             -- DateTime<Utc> as TEXT (ISO 8601)
);
CREATE UNIQUE INDEX idx_pos_account_asset ON positions (account_id, asset_id);
CREATE INDEX idx_pos_account ON positions (account_id);


CREATE TABLE lots (
    id TEXT PRIMARY KEY NOT NULL,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    acquisition_date TEXT NOT NULL,          -- DateTime<Utc> as TEXT
    quantity TEXT NOT NULL,                  -- Decimal as TEXT
    cost_basis TEXT NOT NULL,                -- Decimal as TEXT
    acquisition_price TEXT NOT NULL,         -- Decimal as TEXT
    acquisition_fees TEXT NOT NULL,          -- Decimal as TEXT
    last_updated TEXT NOT NULL               -- DateTime<Utc> as TEXT
);
CREATE INDEX idx_lots_position ON lots (position_id);

CREATE TABLE cash_holdings (
    id TEXT PRIMARY KEY NOT NULL,             -- e.g., "CASH-{currency}-{account_id}"
    account_id TEXT NOT NULL REFERENCES Accounts(id) ON DELETE CASCADE,
    currency TEXT NOT NULL,
    amount TEXT NOT NULL,                    -- Decimal as TEXT
    last_updated TEXT NOT NULL               -- DateTime<Utc> as TEXT
);
-- Add unique constraint after table creation if needed by SQLite version
CREATE UNIQUE INDEX idx_cash_account_currency ON cash_holdings (account_id, currency);
CREATE INDEX idx_cash_account ON cash_holdings (account_id);