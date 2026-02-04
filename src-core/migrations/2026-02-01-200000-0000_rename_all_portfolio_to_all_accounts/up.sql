-- Rename "All Portfolio" strategy to "All Accounts" for consistency
-- This updates the default strategy created in migration 2026-01-20-000001
-- NOTE: We only update the name, not the ID, because the ID is referenced by foreign keys

UPDATE rebalancing_strategies
SET name = 'All Accounts'
WHERE
  account_id IS NULL
  AND (name = 'All Portfolio' OR id = 'default-all-portfolio');
