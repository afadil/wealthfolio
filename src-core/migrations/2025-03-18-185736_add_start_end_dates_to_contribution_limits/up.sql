-- Your SQL goes here

-- Add start_date and end_date columns to contribution_limits table
ALTER TABLE contribution_limits ADD COLUMN start_date TIMESTAMP NULL;
ALTER TABLE contribution_limits ADD COLUMN end_date TIMESTAMP NULL;
