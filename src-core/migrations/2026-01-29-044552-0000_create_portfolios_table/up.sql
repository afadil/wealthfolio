-- Create portfolios table for user-defined portfolio groupings
-- Portfolios are lightweight references to groups of accounts
CREATE TABLE portfolios (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    account_ids TEXT NOT NULL, -- JSON array: ["acc1-id", "acc2-id"]
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portfolios_name ON portfolios(name);

-- Add migration tracking field to accounts table for combined portfolio migration
ALTER TABLE accounts ADD COLUMN migrated_to_portfolio_id TEXT;
