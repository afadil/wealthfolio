-- Positions are now tracked in the `lots` table. The positions JSON column
-- was already being written as '{}' and ignored on read. Drop it entirely.
ALTER TABLE holdings_snapshots DROP COLUMN positions;
