-- Health issue dismissals table
-- Stores user-dismissed health issues with data hash for change detection

CREATE TABLE health_issue_dismissals (
    issue_id TEXT PRIMARY KEY NOT NULL,
    dismissed_at TEXT NOT NULL,
    data_hash TEXT NOT NULL
);

-- Index for efficient lookups
CREATE INDEX idx_health_issue_dismissals_dismissed_at ON health_issue_dismissals(dismissed_at);
