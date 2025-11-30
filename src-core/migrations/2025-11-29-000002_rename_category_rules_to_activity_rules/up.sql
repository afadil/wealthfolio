-- ============================================================================
-- Migration: Rename category_rules to activity_rules and add activity_type
-- ============================================================================
-- This migration renames the category_rules table to activity_rules and adds
-- an optional activity_type column. Rules can now optionally specify an
-- activity type (DEPOSIT, WITHDRAWAL, etc.) to auto-assign during import.
-- ============================================================================

-- Create new activity_rules table with activity_type column
CREATE TABLE activity_rules (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'contains',
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sub_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    activity_type TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    is_global INTEGER NOT NULL DEFAULT 1,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data from category_rules to activity_rules
INSERT INTO activity_rules (id, name, pattern, match_type, category_id, sub_category_id, activity_type, priority, is_global, account_id, created_at, updated_at)
SELECT id, name, pattern, match_type, category_id, sub_category_id, NULL, priority, is_global, account_id, created_at, updated_at
FROM category_rules;

-- Drop old table
DROP TABLE category_rules;

-- Create indexes for activity_rules
CREATE INDEX idx_activity_rules_priority ON activity_rules(priority DESC);
CREATE INDEX idx_activity_rules_category ON activity_rules(category_id);
CREATE INDEX idx_activity_rules_account ON activity_rules(account_id);
CREATE INDEX idx_activity_rules_is_global ON activity_rules(is_global);
CREATE INDEX idx_activity_rules_activity_type ON activity_rules(activity_type);
