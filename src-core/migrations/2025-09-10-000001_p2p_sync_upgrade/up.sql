PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_peer_metadata (
  peer_id TEXT PRIMARY KEY,
  listen_endpoints TEXT NOT NULL DEFAULT '[]',
  pairing_token TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  last_success TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_peer_clock (
  peer_id TEXT PRIMARY KEY,
  remote_clock INTEGER NOT NULL DEFAULT 0,
  remote_known_local INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_peer_metadata_state ON sync_peer_metadata(state);
CREATE INDEX IF NOT EXISTS idx_sync_peer_metadata_failure_count ON sync_peer_metadata(failure_count);

INSERT INTO sync_peer_metadata (peer_id, listen_endpoints, state, last_error, last_success, failure_count, updated_at, created_at)
SELECT id, '[]', 'idle', NULL, NULL, 0, datetime('now'), datetime('now')
FROM sync_peers
WHERE id NOT IN (SELECT peer_id FROM sync_peer_metadata);
