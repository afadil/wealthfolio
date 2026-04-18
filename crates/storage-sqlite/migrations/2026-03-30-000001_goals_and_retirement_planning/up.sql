-- Goals-first architecture: goal types, lifecycle, plans, funding model, retirement planning

-- Extend goals table
ALTER TABLE goals ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'custom_save_up';
ALTER TABLE goals ADD COLUMN status_lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK (status_lifecycle IN ('active', 'achieved', 'archived'));
ALTER TABLE goals ADD COLUMN status_health TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE goals ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN cover_image_key TEXT;
ALTER TABLE goals ADD COLUMN currency TEXT;
ALTER TABLE goals ADD COLUMN start_date TEXT;
ALTER TABLE goals ADD COLUMN target_date TEXT;
ALTER TABLE goals ADD COLUMN current_value_cached REAL;
ALTER TABLE goals ADD COLUMN progress_cached REAL;
ALTER TABLE goals ADD COLUMN projected_completion_date TEXT;
ALTER TABLE goals ADD COLUMN projected_value_at_target_date REAL;
ALTER TABLE goals ADD COLUMN target_amount_cached REAL;
ALTER TABLE goals ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Backfill timestamps for existing rows
UPDATE goals SET
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- Sync lifecycle from legacy is_achieved flag
UPDATE goals SET status_lifecycle = 'achieved' WHERE is_achieved = 1;
ALTER TABLE goals DROP COLUMN is_achieved;

-- Backfill target_amount_cached from explicit target_amount for existing goals
UPDATE goals SET target_amount_cached = target_amount WHERE target_amount > 0;

-- Goal plans table (1:1 with goals for complex goal types)
CREATE TABLE goal_plans (
    goal_id TEXT NOT NULL PRIMARY KEY,
    plan_kind TEXT NOT NULL,
    planner_mode TEXT,
    settings_json TEXT NOT NULL DEFAULT '{}',
    summary_json TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CONSTRAINT goal_plans_goal_id_fkey FOREIGN KEY (goal_id)
        REFERENCES goals (id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO sync_table_state (table_name, enabled) VALUES ('goal_plans', 1);

-- Rebuild goals_allocation with share-based schema
CREATE TABLE goals_allocation_new (
    id TEXT NOT NULL PRIMARY KEY,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    share_percent REAL NOT NULL DEFAULT 0,
    tax_bucket TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO goals_allocation_new (id, goal_id, account_id, share_percent, created_at, updated_at)
    SELECT id, goal_id, account_id, CAST(percent_allocation AS REAL),
           strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    FROM goals_allocation;

DROP TABLE goals_allocation;
ALTER TABLE goals_allocation_new RENAME TO goals_allocation;

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_allocation_goal_account
    ON goals_allocation(goal_id, account_id);
