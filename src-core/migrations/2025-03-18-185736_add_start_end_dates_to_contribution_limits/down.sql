-- This file should undo anything in `up.sql`
-- Remove start_date and end_date columns from contribution_limits table
ALTER TABLE contribution_limits DROP COLUMN start_date;
ALTER TABLE contribution_limits DROP COLUMN end_date;
