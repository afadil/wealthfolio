-- Revert to original (flawed) schema
DROP TABLE IF EXISTS holding_targets;
DROP TABLE IF EXISTS asset_class_targets;
DROP TABLE IF EXISTS rebalancing_strategies;

-- Recreate original tables (for rollback compatibility)
CREATE TABLE rebalancing_strategies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_rebalancing_strategies_account_id ON rebalancing_strategies(account_id);
CREATE INDEX idx_rebalancing_strategies_is_active ON rebalancing_strategies(is_active);

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

CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    target_percent_of_class REAL NOT NULL CHECK(target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, symbol)
);

CREATE INDEX idx_holding_targets_asset_class_id ON holding_targets(asset_class_id);
CREATE INDEX idx_holding_targets_symbol ON holding_targets(symbol);
