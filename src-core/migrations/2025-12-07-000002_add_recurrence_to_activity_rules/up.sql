-- Add recurrence column to activity_rules table
-- Allows rules to set recurrence type on matched activities
ALTER TABLE activity_rules ADD COLUMN recurrence TEXT;
