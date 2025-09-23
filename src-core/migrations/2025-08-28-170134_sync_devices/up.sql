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

-- 1) Add sync metadata columns to activity_import_profiles
ALTER TABLE activity_import_profiles ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity_import_profiles ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE activity_import_profiles ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

-- 1) Add sync metadata columns to app_settings
ALTER TABLE app_settings ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE app_settings ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

-- 1) Add sync metadata columns to contribution_limits
ALTER TABLE contribution_limits ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contribution_limits ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE contribution_limits ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

-- 1) Add sync metadata columns to goals
ALTER TABLE goals ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;

-- 1) Add sync metadata columns to goals_allocation
ALTER TABLE goals_allocation ADD COLUMN updated_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goals_allocation ADD COLUMN origin          TEXT    NOT NULL DEFAULT '';
ALTER TABLE goals_allocation ADD COLUMN deleted         INTEGER NOT NULL DEFAULT 0;


-- 2) Indexes for sync
CREATE INDEX IF NOT EXISTS idx_accounts_updated_version   ON accounts(updated_version);
CREATE INDEX IF NOT EXISTS idx_activities_updated_version ON activities(updated_version);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted           ON accounts(deleted);
CREATE INDEX IF NOT EXISTS idx_activities_deleted         ON activities(deleted);
CREATE INDEX IF NOT EXISTS idx_assets_updated_version ON assets(updated_version);
CREATE INDEX IF NOT EXISTS idx_assets_deleted         ON assets(deleted);
CREATE INDEX IF NOT EXISTS idx_activity_import_profiles_updated_version ON activity_import_profiles(updated_version);
CREATE INDEX IF NOT EXISTS idx_activity_import_profiles_deleted         ON activity_import_profiles(deleted);
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_version ON app_settings(updated_version);
CREATE INDEX IF NOT EXISTS idx_app_settings_deleted         ON app_settings(deleted);
CREATE INDEX IF NOT EXISTS idx_contribution_limits_updated_version ON contribution_limits(updated_version);
CREATE INDEX IF NOT EXISTS idx_contribution_limits_deleted         ON contribution_limits(deleted);
CREATE INDEX IF NOT EXISTS idx_goals_updated_version ON goals(updated_version);
CREATE INDEX IF NOT EXISTS idx_goals_deleted         ON goals(deleted);
CREATE INDEX IF NOT EXISTS idx_goals_allocation_updated_version ON goals_allocation(updated_version);
CREATE INDEX IF NOT EXISTS idx_goals_allocation_deleted         ON goals_allocation(deleted);

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
  last_version_received INTEGER NOT NULL DEFAULT 0,
  remote_clock          INTEGER NOT NULL DEFAULT 0,
  remote_known_local    INTEGER NOT NULL DEFAULT 0
);

-- 5) Persistent peer storage for device pairing and trust management
CREATE TABLE IF NOT EXISTS sync_peers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  fingerprint     TEXT NOT NULL DEFAULT '',
  paired          BOOLEAN NOT NULL DEFAULT false,
  trusted         BOOLEAN NOT NULL DEFAULT false,
  listen_endpoints TEXT NOT NULL DEFAULT '[]',
  pairing_token   TEXT,
  state           TEXT NOT NULL DEFAULT 'idle',
  last_error      TEXT,
  last_success    TEXT,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  address         TEXT NOT NULL,
  last_seen       TEXT NOT NULL,
  last_sync       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE INDEX IF NOT EXISTS idx_sync_peers_state ON sync_peers(state);
CREATE INDEX IF NOT EXISTS idx_sync_peers_failure_count ON sync_peers(failure_count);


-- 5) Triggers for accounts: INSERT/UPDATE stamp, DELETE -> tombstone
CREATE TRIGGER IF NOT EXISTS accounts_ai AFTER INSERT ON accounts
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE accounts
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS accounts_au AFTER UPDATE ON accounts
WHEN NEW.updated_version = OLD.updated_version
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
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activities
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS activities_au AFTER UPDATE ON activities
WHEN NEW.updated_version = OLD.updated_version
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

-- 7) Triggers for activity_import_profiles
CREATE TRIGGER IF NOT EXISTS activity_import_profiles_ai AFTER INSERT ON activity_import_profiles
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activity_import_profiles
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE account_id = NEW.account_id;
END;

CREATE TRIGGER IF NOT EXISTS activity_import_profiles_au AFTER UPDATE ON activity_import_profiles
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activity_import_profiles
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE account_id = NEW.account_id;
END;

CREATE TRIGGER IF NOT EXISTS activity_import_profiles_bd BEFORE DELETE ON activity_import_profiles
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE activity_import_profiles
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE account_id = OLD.account_id;
  SELECT RAISE(IGNORE);
END;

-- 8) Triggers for app_settings
CREATE TRIGGER IF NOT EXISTS app_settings_ai AFTER INSERT ON app_settings
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE app_settings
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE setting_key = NEW.setting_key;
END;

CREATE TRIGGER IF NOT EXISTS app_settings_au AFTER UPDATE ON app_settings
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE app_settings
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE setting_key = NEW.setting_key;
END;

CREATE TRIGGER IF NOT EXISTS app_settings_bd BEFORE DELETE ON app_settings
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE app_settings
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE setting_key = OLD.setting_key;
  SELECT RAISE(IGNORE);
END;

-- 9) Triggers for contribution_limits
CREATE TRIGGER IF NOT EXISTS contribution_limits_ai AFTER INSERT ON contribution_limits
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE contribution_limits
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS contribution_limits_au AFTER UPDATE ON contribution_limits
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE contribution_limits
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS contribution_limits_bd BEFORE DELETE ON contribution_limits
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE contribution_limits
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;

-- 10) Triggers for goals
CREATE TRIGGER IF NOT EXISTS goals_ai AFTER INSERT ON goals
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS goals_au AFTER UPDATE ON goals
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS goals_bd BEFORE DELETE ON goals
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;

-- Tombstone goals_allocation referencing the goal
CREATE TRIGGER IF NOT EXISTS goals_tombstone_allocations
AFTER UPDATE OF deleted ON goals
WHEN NEW.deleted = 1
BEGIN
  UPDATE goals_allocation
     SET deleted = 1
   WHERE goal_id = NEW.id AND deleted = 0;
END;

-- 11) Triggers for goals_allocation
CREATE TRIGGER IF NOT EXISTS goals_allocation_ai AFTER INSERT ON goals_allocation
WHEN NEW.updated_version = 0
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals_allocation
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1),
         deleted         = 0
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS goals_allocation_au AFTER UPDATE ON goals_allocation
WHEN NEW.updated_version = OLD.updated_version
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals_allocation
     SET updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS goals_allocation_bd BEFORE DELETE ON goals_allocation
BEGIN
  UPDATE sync_sequence SET value = value + 1 WHERE name = 'clock';
  UPDATE goals_allocation
     SET deleted         = 1,
         updated_version = (SELECT value FROM sync_sequence WHERE name='clock'),
         origin          = (SELECT id FROM sync_device LIMIT 1)
   WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END;
