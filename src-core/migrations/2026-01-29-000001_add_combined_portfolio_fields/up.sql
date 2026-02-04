-- Add fields to support Combined Portfolio feature
-- This allows creating virtual portfolios that combine multiple accounts
ALTER TABLE accounts ADD COLUMN is_combined_portfolio BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN component_account_ids TEXT; -- JSON array of account IDs
