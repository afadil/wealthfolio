CREATE TABLE bank_download_runs (
  id TEXT PRIMARY KEY NOT NULL,
  bank_key TEXT NOT NULL,
  account_name TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  files_downloaded INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_bank_download_runs_bank_key ON bank_download_runs(bank_key);
CREATE INDEX idx_bank_download_runs_started_at ON bank_download_runs(started_at DESC);
