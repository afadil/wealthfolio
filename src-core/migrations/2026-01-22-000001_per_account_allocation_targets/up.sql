-- Add account_id column to asset_class_targets
-- Allows per-account allocation strategies; NULL account_id = global "All Portfolio" targets

ALTER TABLE asset_class_targets
ADD COLUMN account_id TEXT;

-- Add index for efficient account filtering
CREATE INDEX IF NOT EXISTS idx_asset_class_targets_account_id
ON asset_class_targets(account_id);

-- Add index for efficient strategy lookup
CREATE INDEX IF NOT EXISTS idx_asset_class_targets_strategy_id
ON asset_class_targets(strategy_id);

-- Update UNIQUE constraint to include account_id (per-account uniqueness)
-- Create new unique index: (strategy_id, account_id) allows NULL account_id for global targets
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_class_targets_unique
ON asset_class_targets(strategy_id, account_id);
