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
ALTER TABLE goals ADD COLUMN summary_current_value REAL;
ALTER TABLE goals ADD COLUMN summary_progress REAL;
ALTER TABLE goals ADD COLUMN projected_completion_date TEXT;
ALTER TABLE goals ADD COLUMN projected_value_at_target_date REAL;
ALTER TABLE goals ADD COLUMN summary_target_amount REAL;
ALTER TABLE goals ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Backfill timestamps for existing rows
UPDATE goals SET
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- Sync lifecycle from legacy is_achieved flag
UPDATE goals SET status_lifecycle = 'achieved' WHERE is_achieved = 1;
ALTER TABLE goals DROP COLUMN is_achieved;

-- Backfill summary_target_amount from explicit target_amount for existing goals
UPDATE goals SET summary_target_amount = target_amount WHERE target_amount > 0;

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
-- Guard: create old-schema table for databases that predated goals_allocation
CREATE TABLE IF NOT EXISTS goals_allocation (
    id TEXT NOT NULL PRIMARY KEY,
    percent_allocation INTEGER NOT NULL DEFAULT 0,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL
);

CREATE TABLE goals_allocation_new (
    id TEXT NOT NULL PRIMARY KEY,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    share_percent REAL NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
    tax_bucket TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO goals_allocation_new (id, goal_id, account_id, share_percent, created_at, updated_at)
    SELECT MIN(id), goal_id, account_id,
           CASE
               WHEN SUM(CAST(percent_allocation AS REAL)) < 0 THEN 0
               WHEN SUM(CAST(percent_allocation AS REAL)) > 100 THEN 100
               ELSE SUM(CAST(percent_allocation AS REAL))
           END,
           strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    FROM goals_allocation
    GROUP BY goal_id, account_id;

DROP TABLE goals_allocation;
ALTER TABLE goals_allocation_new RENAME TO goals_allocation;

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_allocation_goal_account
    ON goals_allocation(goal_id, account_id);
