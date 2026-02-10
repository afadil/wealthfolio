-- Migration: Add tracking_mode column + is_archived column + holdings_snapshots source
-- 1. Add tracking_mode column to accounts
-- 2. Add is_archived column to accounts
-- 3. Add source column to holdings_snapshots (simple ALTER + clear recalculated data)

--------------------------------------------------------------------------------
-- PART 1: Add tracking_mode column
--------------------------------------------------------------------------------
ALTER TABLE accounts ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'NOT_SET';

-- Backfill existing accounts to TRANSACTIONS for backward compatibility
UPDATE accounts SET tracking_mode = 'TRANSACTIONS';

--------------------------------------------------------------------------------
-- PART 2: Add is_archived column
--------------------------------------------------------------------------------
ALTER TABLE accounts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;

-- Backward-compat: archive currently inactive accounts
UPDATE accounts SET is_archived = 1 WHERE is_active = 0;

--------------------------------------------------------------------------------
-- PART 3: Add source column to holdings_snapshots
--------------------------------------------------------------------------------
-- Simply add the column and clear calculated data (will be recalculated on startup)
ALTER TABLE holdings_snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'CALCULATED';

-- Delete all calculated snapshots - they will be recalculated with correct is_archived logic
DELETE FROM holdings_snapshots WHERE source = 'CALCULATED';

-- Delete all daily account valuations - they will be recalculated
DELETE FROM daily_account_valuation;

-- Create index for source column
CREATE INDEX IF NOT EXISTS ix_holdings_snapshots_source
    ON holdings_snapshots(account_id, source);
