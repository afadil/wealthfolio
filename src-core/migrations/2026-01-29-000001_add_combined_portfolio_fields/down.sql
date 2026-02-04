-- Rollback Combined Portfolio fields
ALTER TABLE accounts DROP COLUMN component_account_ids;
ALTER TABLE accounts DROP COLUMN is_combined_portfolio;
