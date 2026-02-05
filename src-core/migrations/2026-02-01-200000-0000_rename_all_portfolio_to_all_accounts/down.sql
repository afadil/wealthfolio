-- Rollback: Rename back to "All Portfolio"

UPDATE rebalancing_strategies
SET name = 'All Portfolio'
WHERE
  account_id IS NULL
  AND (name = 'All Accounts' OR id = 'default-all-portfolio');
