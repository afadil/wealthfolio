-- Drop indexes first
DROP INDEX IF EXISTS idx_budget_allocations_config;
DROP INDEX IF EXISTS idx_budget_allocations_category;

-- Drop tables
DROP TABLE IF EXISTS budget_allocations;
DROP TABLE IF EXISTS budget_config;
