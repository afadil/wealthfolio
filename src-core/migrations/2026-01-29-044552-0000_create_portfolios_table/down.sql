-- Revert portfolios table creation
DROP INDEX IF EXISTS idx_portfolios_name;
DROP TABLE IF EXISTS portfolios;

-- Remove migration tracking field
ALTER TABLE accounts DROP COLUMN migrated_to_portfolio_id;
