-- Budget configuration table (global settings)
CREATE TABLE budget_config (
    id TEXT NOT NULL PRIMARY KEY,
    monthly_spending_target TEXT NOT NULL DEFAULT '0',
    monthly_income_target TEXT NOT NULL DEFAULT '0',
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Budget allocations table (category-specific amounts)
CREATE TABLE budget_allocations (
    id TEXT NOT NULL PRIMARY KEY,
    budget_config_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount TEXT NOT NULL DEFAULT '0',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (budget_config_id) REFERENCES budget_config(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(budget_config_id, category_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_budget_allocations_config ON budget_allocations(budget_config_id);
CREATE INDEX idx_budget_allocations_category ON budget_allocations(category_id);
