-- Add recurrence column to activities table
-- Values: 'fixed' | 'variable' | 'periodic' | NULL
ALTER TABLE activities ADD COLUMN recurrence TEXT;

-- Create index for filtering by recurrence
CREATE INDEX idx_activities_recurrence ON activities(recurrence);
