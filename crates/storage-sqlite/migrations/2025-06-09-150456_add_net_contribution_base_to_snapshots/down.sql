-- This file should undo anything in `up.sql`

ALTER TABLE holdings_snapshots
DROP COLUMN net_contribution_base;
