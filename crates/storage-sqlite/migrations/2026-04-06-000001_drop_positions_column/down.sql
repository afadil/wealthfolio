-- Re-add the positions column. All rows get '{}' — a full recalculation
-- on older code would be needed to repopulate.
ALTER TABLE holdings_snapshots ADD COLUMN positions TEXT NOT NULL DEFAULT '{}';
