-- SQLite does not support DROP COLUMN; recreate the table.
-- This is only used in development.

DELETE FROM sync_table_state WHERE table_name = 'goal_plans';
DROP TABLE IF EXISTS goal_plans;

-- Recreate original goals table
CREATE TABLE goals_backup AS SELECT id, title, description, target_amount, is_achieved FROM goals;
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
