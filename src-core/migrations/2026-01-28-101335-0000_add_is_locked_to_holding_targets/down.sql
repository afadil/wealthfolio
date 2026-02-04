-- Remove is_locked column from holding_targets

DROP INDEX IF EXISTS idx_holding_targets_is_locked;

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Save existing data
CREATE TEMPORARY TABLE holding_targets_backup AS SELECT * FROM holding_targets;

-- Drop the table
DROP TABLE holding_targets;

-- Recreate without is_locked
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_percent_of_class REAL NOT NULL CHECK(target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)
);

-- Restore data (without is_locked column)
INSERT INTO holding_targets (id, asset_class_id, asset_id, target_percent_of_class, created_at, updated_at)
SELECT id, asset_class_id, asset_id, target_percent_of_class, created_at, updated_at
FROM holding_targets_backup;

-- Drop backup
DROP TABLE holding_targets_backup;

-- Recreate indexes
CREATE INDEX idx_holding_targets_asset_class_id ON holding_targets(asset_class_id);
CREATE INDEX idx_holding_targets_asset_id ON holding_targets(asset_id);
