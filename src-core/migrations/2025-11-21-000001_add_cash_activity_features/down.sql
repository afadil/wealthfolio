-- ============================================================================
-- Rollback migration for cash activity features
-- Reverse order of up.sql
-- ============================================================================

-- ============================================================================
-- PART 4: Remove activities table extensions
-- ============================================================================

-- Drop indexes for activity columns
DROP INDEX IF EXISTS idx_activities_event;
DROP INDEX IF EXISTS idx_activities_sub_category_id;
DROP INDEX IF EXISTS idx_activities_category_id;

-- SQLite doesn't support DROP COLUMN directly, need to recreate table
-- For simplicity, we'll create a new table without the columns and copy data

CREATE TABLE activities_backup AS SELECT
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, is_draft, comment, created_at, updated_at, amount
FROM activities;

DROP TABLE activities;

CREATE TABLE activities (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity REAL,
    unit_price REAL,
    currency TEXT NOT NULL,
    fee REAL,
    is_draft INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    amount REAL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT INTO activities SELECT * FROM activities_backup;
DROP TABLE activities_backup;

-- Recreate original indexes
CREATE INDEX idx_activities_account ON activities(account_id);
CREATE INDEX idx_activities_asset ON activities(asset_id);
CREATE INDEX idx_activities_date ON activities(activity_date);

-- ============================================================================
-- PART 3: Drop events and event_types
-- ============================================================================

DROP INDEX IF EXISTS idx_events_dates;
DROP INDEX IF EXISTS idx_events_event_type;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_types;

-- ============================================================================
-- PART 2: Drop category_rules
-- ============================================================================

DROP INDEX IF EXISTS idx_category_rules_is_global;
DROP INDEX IF EXISTS idx_category_rules_account;
DROP INDEX IF EXISTS idx_category_rules_category;
DROP INDEX IF EXISTS idx_category_rules_priority;
DROP TABLE IF EXISTS category_rules;

-- ============================================================================
-- PART 1: Drop categories
-- ============================================================================

DROP INDEX IF EXISTS idx_categories_is_income;
DROP INDEX IF EXISTS idx_categories_parent_id;
DROP TABLE IF EXISTS categories;
