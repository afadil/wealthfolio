-- Portfolio target allocation profiles
CREATE TABLE portfolio_targets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    taxonomy_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (taxonomy_id) REFERENCES taxonomies(id)
);

CREATE INDEX idx_portfolio_targets_account ON portfolio_targets(account_id);

-- Category-level target allocations within a profile
CREATE TABLE portfolio_target_allocations (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    target_percent INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (target_id) REFERENCES portfolio_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES taxonomy_categories(id)
);

CREATE INDEX idx_target_allocations_target ON portfolio_target_allocations(target_id);
