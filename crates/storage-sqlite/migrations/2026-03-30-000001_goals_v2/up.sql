-- Extend goals table for Goals-first architecture
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
ALTER TABLE goals ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Backfill timestamps for existing rows
UPDATE goals SET
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- Sync lifecycle from legacy is_achieved flag
UPDATE goals SET status_lifecycle = 'achieved' WHERE is_achieved = 1;

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

-- Register goal_plans for device sync
INSERT INTO sync_table_state (table_name, enabled) VALUES ('goal_plans', 1);
