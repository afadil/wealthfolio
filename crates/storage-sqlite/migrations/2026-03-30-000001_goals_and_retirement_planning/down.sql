-- Best-effort reverse (SQLite cannot drop columns without table rebuild)
DROP INDEX IF EXISTS idx_goals_allocation_goal_account;

-- Rebuild goals_allocation to original schema
CREATE TABLE goals_allocation_old (
    id TEXT NOT NULL PRIMARY KEY,
    percent_allocation INTEGER NOT NULL DEFAULT 0,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL
);
INSERT INTO goals_allocation_old (id, percent_allocation, goal_id, account_id)
    SELECT id, CAST(share_percent AS INTEGER), goal_id, account_id
    FROM goals_allocation;
DROP TABLE goals_allocation;
ALTER TABLE goals_allocation_old RENAME TO goals_allocation;

DELETE FROM sync_table_state WHERE table_name = 'goal_plans';
DROP TABLE IF EXISTS goal_plans;

-- Recreate original goals table
CREATE TABLE goals_backup AS
    SELECT
        id,
        title,
        description,
        target_amount,
        status_lifecycle = 'achieved' AS is_achieved
    FROM goals;
DROP TABLE goals;
CREATE TABLE goals (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    target_amount REAL NOT NULL,
    is_achieved BOOLEAN
);
INSERT INTO goals SELECT * FROM goals_backup;
DROP TABLE goals_backup;
