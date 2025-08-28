DROP TRIGGER IF EXISTS activities_bd;
DROP TRIGGER IF EXISTS activities_au;
DROP TRIGGER IF EXISTS activities_ai;

DROP TRIGGER IF EXISTS accounts_tombstone_activities;
DROP TRIGGER IF EXISTS accounts_bd;
DROP TRIGGER IF EXISTS accounts_au;
DROP TRIGGER IF EXISTS accounts_ai;

DROP TABLE IF EXISTS sync_trusted_peers;
DROP TABLE IF EXISTS sync_peer_checkpoint;
DROP TABLE IF EXISTS sync_device;
DROP TABLE IF EXISTS sync_sequence;


DROP TRIGGER IF EXISTS assets_tombstone_activities;
DROP TRIGGER IF EXISTS assets_bd;
DROP TRIGGER IF EXISTS assets_au;
DROP TRIGGER IF EXISTS assets_ai;