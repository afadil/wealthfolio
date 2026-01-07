-- ============================================================================
-- Rollback: Rename activity_rules back to category_rules
-- ============================================================================

-- Recreate category_rules table
CREATE TABLE category_rules (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'contains',
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    sub_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_global INTEGER NOT NULL DEFAULT 1,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data back (only rows with category_id set)
INSERT INTO category_rules (id, name, pattern, match_type, category_id, sub_category_id, priority, is_global, account_id, created_at, updated_at)
SELECT id, name, pattern, match_type, category_id, sub_category_id, priority, is_global, account_id, created_at, updated_at
FROM activity_rules
WHERE category_id IS NOT NULL;

-- Drop new table
DROP TABLE activity_rules;

-- Recreate indexes
CREATE INDEX idx_category_rules_priority ON category_rules(priority DESC);
CREATE INDEX idx_category_rules_category ON category_rules(category_id);
CREATE INDEX idx_category_rules_account ON category_rules(account_id);
CREATE INDEX idx_category_rules_is_global ON category_rules(is_global);
