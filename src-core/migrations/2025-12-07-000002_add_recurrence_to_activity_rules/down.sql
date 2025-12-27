-- Remove recurrence column from activity_rules table
-- For SQLite 3.35+
ALTER TABLE activity_rules DROP COLUMN recurrence;
