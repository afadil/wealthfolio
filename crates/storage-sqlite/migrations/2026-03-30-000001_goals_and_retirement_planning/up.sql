-- Goals-first architecture: goal types, lifecycle, plans, funding model, retirement planning

-- Extend goals table
ALTER TABLE goals ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'custom_save_up';
ALTER TABLE goals ADD COLUMN status_lifecycle TEXT NOT NULL DEFAULT 'active';
ALTER TABLE goals ADD COLUMN status_health TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE goals ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0;
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

-- Extend goals_allocation with funding-role semantics and countable percent
ALTER TABLE goals_allocation ADD COLUMN funding_role TEXT NOT NULL DEFAULT 'explicit_reservation';
ALTER TABLE goals_allocation ADD COLUMN reservation_percent REAL;
ALTER TABLE goals_allocation ADD COLUMN countable_percent REAL;
ALTER TABLE goals_allocation ADD COLUMN tax_bucket TEXT;
ALTER TABLE goals_allocation ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE goals_allocation ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Migrate existing rows
UPDATE goals_allocation SET
    reservation_percent = percent_allocation,
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- One account per goal
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_allocation_goal_account
    ON goals_allocation(goal_id, account_id);
