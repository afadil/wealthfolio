-- Remove config_snapshot column from ai_threads
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

CREATE TABLE ai_threads_new (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO ai_threads_new (id, title, created_at, updated_at)
SELECT id, title, created_at, updated_at FROM ai_threads;

DROP TABLE ai_threads;
ALTER TABLE ai_threads_new RENAME TO ai_threads;

-- Recreate indexes
CREATE INDEX idx_ai_threads_updated_at ON ai_threads(updated_at DESC);
