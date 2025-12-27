-- Add back is_dynamic_range column to events table

CREATE TABLE events_new (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_dynamic_range INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO events_new (id, name, description, event_type_id, start_date, end_date, is_dynamic_range, created_at, updated_at)
SELECT id, name, description, event_type_id, start_date, end_date, 0, created_at, updated_at
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_event_type_id ON events(event_type_id);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
