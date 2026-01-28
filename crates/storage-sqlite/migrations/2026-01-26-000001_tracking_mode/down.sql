-- Rollback: Tracking mode support
-- 1. Remove source column from holdings_snapshots
-- 2. Remove trackingMode from accounts.meta

--------------------------------------------------------------------------------
-- PART 1: Remove source column from holdings_snapshots
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS holdings_snapshots_old (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    currency TEXT NOT NULL,
    positions TEXT NOT NULL,
    cash_balances TEXT NOT NULL,
    cost_basis TEXT NOT NULL,
    net_contribution TEXT NOT NULL,
    calculated_at TEXT NOT NULL,
    net_contribution_base TEXT NOT NULL DEFAULT '0',
    cash_total_account_currency TEXT NOT NULL DEFAULT '0',
    cash_total_base_currency TEXT NOT NULL DEFAULT '0'
);

-- Copy data back (excluding source column)
INSERT OR IGNORE INTO holdings_snapshots_old (
    id, account_id, snapshot_date, currency, positions, cash_balances,
    cost_basis, net_contribution, calculated_at, net_contribution_base,
    cash_total_account_currency, cash_total_base_currency
)
SELECT
    id, account_id, snapshot_date, currency, positions, cash_balances,
    cost_basis, net_contribution, calculated_at, net_contribution_base,
    cash_total_account_currency, cash_total_base_currency
FROM holdings_snapshots;

-- Drop table with source and rename old one back
DROP TABLE IF EXISTS holdings_snapshots;
ALTER TABLE holdings_snapshots_old RENAME TO holdings_snapshots;

-- Recreate the original index
CREATE INDEX IF NOT EXISTS ix_holdings_snapshots_account_date
    ON holdings_snapshots(account_id, snapshot_date);

-- Remove the source index
DROP INDEX IF EXISTS ix_holdings_snapshots_source;

--------------------------------------------------------------------------------
-- PART 2: Remove trackingMode from accounts.meta
--------------------------------------------------------------------------------
-- Best-effort rollback - removes trackingMode key only

-- Remove trackingMode from wealthfolio object
UPDATE accounts
SET meta = json_remove(meta, '$.wealthfolio.trackingMode')
WHERE meta IS NOT NULL
  AND json_valid(meta)
  AND json_extract(meta, '$.wealthfolio.trackingMode') IS NOT NULL;

-- Clean up empty wealthfolio objects: {"wealthfolio":{}} -> remove wealthfolio key
UPDATE accounts
SET meta = json_remove(meta, '$.wealthfolio')
WHERE meta IS NOT NULL
  AND json_valid(meta)
  AND json_extract(meta, '$.wealthfolio') = '{}';

-- Clean up empty meta: {} -> NULL
UPDATE accounts
SET meta = NULL
WHERE meta = '{}';
