-- Drop holding_targets table
DROP INDEX IF EXISTS idx_holding_targets_asset_id;
DROP INDEX IF EXISTS idx_holding_targets_allocation_id;
DROP TABLE IF EXISTS holding_targets;
