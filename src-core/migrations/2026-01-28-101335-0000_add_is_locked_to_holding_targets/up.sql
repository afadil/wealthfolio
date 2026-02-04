-- Add is_locked column to holding_targets
-- Allows users to lock specific holdings from auto-adjustment during rebalancing

ALTER TABLE holding_targets
ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;  -- SQLite uses INTEGER for BOOLEAN (0=false, 1=true)

-- Add index for efficient filtering of locked holdings
CREATE INDEX IF NOT EXISTS idx_holding_targets_is_locked
ON holding_targets(is_locked);
