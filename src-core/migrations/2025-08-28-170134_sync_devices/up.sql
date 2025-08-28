PRAGMA foreign_keys = ON;

-- 1) Add sync metadata columns
ALTER TABLE accounts ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

ALTER TABLE activities ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activities ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE activities ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

-- 1) Add sync metadata columns to assets
ALTER TABLE assets ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;


-- 2) Indexes for sync
CREATE INDEX IF NOT EXISTS idx_accounts_updated_version   ON accounts(updated_version);
CREATE INDEX IF NOT EXISTS idx_activities_updated_version ON activities(updated_version);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted           ON accounts(deleted);
CREATE INDEX IF NOT EXISTS idx_activities_deleted         ON activities(deleted);
CREATE INDEX IF NOT EXISTS idx_assets_updated_version ON assets(updated_version);
CREATE INDEX IF NOT EXISTS idx_assets_deleted         ON assets(deleted);

-- 3) Global logical clock and device id
CREATE TABLE IF NOT EXISTS sync_sequence (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO sync_sequence(name, value) VALUES ('clock', 0);

CREATE TABLE IF NOT EXISTS sync_device (
  id TEXT PRIMARY KEY
);

-- 4) Per-peer checkpoints (P2P sync state)
CREATE TABLE IF NOT EXISTS sync_peer_checkpoint (
  peer_id TEXT PRIMARY KEY,
  last_version_sent     INTEGER NOT NULL DEFAULT 0,
  last_version_received INTEGER NOT NULL DEFAULT 0
);

-- Optional: trusted peers + fingerprint pinning (for TLS/mTLS later)
CREATE TABLE IF NOT EXISTS sync_trusted_peers (
  peer_id     TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  name        TEXT,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5) Triggers for accounts: INSERT/UPDATE stamp, DELETE -> tombstone
CREATE TRIGGER IF NOT EXISTS accounts_ai AFTER INSERT ON accounts
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE accounts
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS accounts_au AFTER UPDATE ON accounts
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE accounts
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

-- Soft-delete tombstone
CREATE TRIGGER IF NOT EXISTS accounts_bd BEFORE DELETE ON accounts
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE accounts
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;

-- Cascade tombstone to activities when an account is tombstoned
CREATE TRIGGER IF NOT EXISTS accounts_tombstone_activities
AFTER UPDATE OF deleted ON accounts
WHEN NEW.deleted = 1
BEGIN
  UPDATE activities
     SET deleted = 1
   WHERE account_id = NEW.id
     AND deleted = 0;
END;

-- 6) Triggers for activities
CREATE TRIGGER IF NOT EXISTS activities_ai AFTER INSERT ON activities
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activities
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS activities_au AFTER UPDATE ON activities
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activities
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS activities_bd BEFORE DELETE ON activities
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activities
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;

-- 6) Triggers for assets
-- Only stamp local inserts (NEW.updated_version=0) so inbound replicated rows keep their version/origin
CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE assets
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

-- Only stamp local updates (when version unchanged)
CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE ON assets
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE assets
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

-- Convert deletes to tombstones (and cascade tombstone to activities)
CREATE TRIGGER IF NOT EXISTS assets_bd BEFORE DELETE ON assets
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE assets
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;

-- Tombstone activities referencing the asset
CREATE TRIGGER IF NOT EXISTS assets_tombstone_activities
AFTER UPDATE OF deleted ON assets
WHEN NEW.deleted = 1
BEGIN
  UPDATE activities
     SET deleted = 1
   WHERE asset_id = NEW.id AND deleted = 0;
END;
