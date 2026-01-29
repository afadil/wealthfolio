-- Reverse migration: Remove tracking_mode, is_archived, and source columns
-- SQLite 3.35+ supports DROP COLUMN

DROP INDEX IF EXISTS ix_holdings_snapshots_source;
ALTER TABLE accounts DROP COLUMN tracking_mode;
ALTER TABLE accounts DROP COLUMN is_archived;
ALTER TABLE holdings_snapshots DROP COLUMN source;
