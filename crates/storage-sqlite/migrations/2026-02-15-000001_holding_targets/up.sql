-- Create holding_targets table for per-holding allocation targets
CREATE TABLE IF NOT EXISTS holding_targets (
    id TEXT PRIMARY KEY NOT NULL,
    allocation_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_percent INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (allocation_id) REFERENCES portfolio_target_allocations(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(allocation_id, asset_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_holding_targets_allocation_id ON holding_targets(allocation_id);
CREATE INDEX IF NOT EXISTS idx_holding_targets_asset_id ON holding_targets(asset_id);
