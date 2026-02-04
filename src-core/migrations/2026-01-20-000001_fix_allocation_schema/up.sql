-- Drop existing tables (they're empty anyway)
DROP TABLE IF EXISTS holding_targets;
DROP TABLE IF EXISTS asset_class_targets;
DROP TABLE IF EXISTS rebalancing_strategies;

-- Recreate with correct schema
-- 1. Rebalancing strategies (parent)
CREATE TABLE rebalancing_strategies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,  -- NULL means "All Portfolio"
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_rebalancing_strategies_account_id ON rebalancing_strategies(account_id);
CREATE INDEX idx_rebalancing_strategies_is_active ON rebalancing_strategies(is_active);

-- 2. Asset class targets (child of strategy)
CREATE TABLE asset_class_targets (
    id TEXT NOT NULL PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_percent REAL NOT NULL CHECK(target_percent >= 0 AND target_percent <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id) ON DELETE CASCADE,
    UNIQUE(strategy_id, asset_class)
);

CREATE INDEX idx_asset_class_targets_strategy_id ON asset_class_targets(strategy_id);
CREATE INDEX idx_asset_class_targets_asset_class ON asset_class_targets(asset_class);

-- 3. Holding targets (child of asset class) - FIXED VERSION
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ✅ FIXED: Using asset_id instead of symbol
    target_percent_of_class REAL NOT NULL CHECK(target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,  -- ✅ ADDED: Link to assets table
    UNIQUE(asset_class_id, asset_id)  -- ✅ FIXED: Prevent duplicate holdings
);

CREATE INDEX idx_holding_targets_asset_class_id ON holding_targets(asset_class_id);
CREATE INDEX idx_holding_targets_asset_id ON holding_targets(asset_id);

-- Create default "All Accounts" strategy
INSERT INTO rebalancing_strategies (id, name, account_id, is_active)
VALUES ('default-all-portfolio', 'All Accounts', NULL, 1);
