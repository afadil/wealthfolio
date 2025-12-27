-- Remove recurrence column from activities table
-- SQLite doesn't support DROP COLUMN directly in older versions,
-- but modern SQLite (3.35+) does support it

DROP INDEX IF EXISTS idx_activities_recurrence;

-- For SQLite 3.35+
ALTER TABLE activities DROP COLUMN recurrence;
