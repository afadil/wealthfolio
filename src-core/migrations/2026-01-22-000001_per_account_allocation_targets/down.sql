-- Rollback: remove indexes and column added in up.sql
DROP INDEX IF EXISTS idx_asset_class_targets_strategy_id;
DROP INDEX IF EXISTS idx_asset_class_targets_account_id;
DROP INDEX IF EXISTS idx_asset_class_targets_unique;

ALTER TABLE asset_class_targets
DROP COLUMN IF EXISTS account_id;
