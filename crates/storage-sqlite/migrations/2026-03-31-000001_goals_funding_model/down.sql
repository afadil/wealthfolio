-- Best-effort reverse (SQLite cannot drop columns without table rebuild)
DROP INDEX IF EXISTS idx_goals_allocation_goal_account;
