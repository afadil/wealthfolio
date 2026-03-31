-- Goal funding model: explicit reservations for save-up, residual eligible for retirement

-- Extend goals_allocation with funding-role semantics
ALTER TABLE goals_allocation ADD COLUMN funding_role TEXT NOT NULL DEFAULT 'explicit_reservation';
ALTER TABLE goals_allocation ADD COLUMN reservation_percent REAL;
ALTER TABLE goals_allocation ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE goals_allocation ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Migrate existing rows: copy percent_allocation → reservation_percent, set timestamps
UPDATE goals_allocation SET
    reservation_percent = percent_allocation,
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- One account per goal (prevents accidental duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_allocation_goal_account
    ON goals_allocation(goal_id, account_id);

-- Cached display target (derived from plan for retirement, equals target_amount for save-up)
ALTER TABLE goals ADD COLUMN target_amount_cached REAL;

-- Backfill target_amount_cached from explicit target_amount for existing goals
UPDATE goals SET target_amount_cached = target_amount WHERE target_amount > 0;

-- Strip includedAccountIds from retirement plan settings (now lives in funding rules)
UPDATE goal_plans
SET settings_json = json_remove(settings_json, '$.includedAccountIds')
WHERE plan_kind = 'retirement'
  AND json_extract(settings_json, '$.includedAccountIds') IS NOT NULL;
