PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_sync_peer_metadata_state;
DROP INDEX IF EXISTS idx_sync_peer_metadata_failure_count;
DROP TABLE IF EXISTS sync_peer_clock;
DROP TABLE IF EXISTS sync_peer_metadata;
