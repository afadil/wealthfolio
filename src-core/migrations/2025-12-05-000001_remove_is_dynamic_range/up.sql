-- Remove is_dynamic_range column from events table
-- Event dates are now always fixed and represent when the event takes place
-- Transaction dates are independent of event dates

-- Disable foreign key constraints during table recreation
PRAGMA foreign_keys=OFF;

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
CREATE TABLE events_new (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data from old table (excluding is_dynamic_range)
INSERT INTO events_new (id, name, description, event_type_id, start_date, end_date, created_at, updated_at)
SELECT id, name, description, event_type_id, start_date, end_date, created_at, updated_at
FROM events;

-- Drop old table and rename new one
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

-- Recreate indexes
CREATE INDEX idx_events_event_type_id ON events(event_type_id);
CREATE INDEX idx_events_dates ON events(start_date, end_date);

-- Re-enable foreign key constraints
PRAGMA foreign_keys=ON;
