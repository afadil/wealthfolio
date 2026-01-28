-- Migration: Tracking mode support
-- 1. Set trackingMode="TRANSACTIONS" for all existing accounts
-- 2. Add source column to holdings_snapshots table

--------------------------------------------------------------------------------
-- PART 1: Set trackingMode for existing accounts
--------------------------------------------------------------------------------
-- Ensures backward compatibility: existing accounts continue as transaction-based
-- while new accounts can use different tracking modes (TRANSACTIONS, HOLDINGS, NOT_SET)

-- Case 1: meta is NULL or empty string
UPDATE accounts
SET meta = '{"wealthfolio":{"trackingMode":"TRANSACTIONS"}}'
WHERE meta IS NULL OR meta = '';

-- Case 2: Invalid JSON (non-empty string that isn't valid JSON)
UPDATE accounts
SET meta = '{"wealthfolio":{"trackingMode":"TRANSACTIONS"}}'
WHERE meta IS NOT NULL
  AND meta != ''
  AND NOT json_valid(meta);

-- Case 3 & 4: Valid JSON but missing wealthfolio.trackingMode
UPDATE accounts
SET meta = json_set(
    meta,
    '$.wealthfolio.trackingMode',
    'TRANSACTIONS'
)
WHERE meta IS NOT NULL
  AND meta != ''
  AND json_valid(meta)
  AND json_extract(meta, '$.wealthfolio.trackingMode') IS NULL;

--------------------------------------------------------------------------------
-- PART 2: Add source column to holdings_snapshots
--------------------------------------------------------------------------------
-- Tracks how the snapshot was created:
-- - CALCULATED: Auto-calculated from activities
-- - MANUAL_ENTRY: User-entered holdings snapshot
-- - BROKER_IMPORTED: Imported from broker API
-- - CSV_IMPORT: Imported from CSV file

-- NOTE: No FOREIGN KEY on account_id because TOTAL portfolio uses "TOTAL" as account_id

-- Create new table with source column
CREATE TABLE IF NOT EXISTS holdings_snapshots_new (
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
    cash_total_base_currency TEXT NOT NULL DEFAULT '0',
    source TEXT NOT NULL DEFAULT 'CALCULATED',
    CHECK (source IN ('CALCULATED', 'MANUAL_ENTRY', 'BROKER_IMPORTED', 'CSV_IMPORT', 'SYNTHETIC'))
);

-- Copy existing data (source defaults to CALCULATED)
INSERT OR IGNORE INTO holdings_snapshots_new (
    id, account_id, snapshot_date, currency, positions, cash_balances,
    cost_basis, net_contribution, calculated_at, net_contribution_base,
    cash_total_account_currency, cash_total_base_currency, source
)
SELECT
    id, account_id, snapshot_date, currency, positions, cash_balances,
    cost_basis, net_contribution, calculated_at, net_contribution_base,
    cash_total_account_currency, cash_total_base_currency, 'CALCULATED'
FROM holdings_snapshots;

-- Drop old table and rename new one
DROP TABLE IF EXISTS holdings_snapshots;
ALTER TABLE holdings_snapshots_new RENAME TO holdings_snapshots;

-- Create indexes
CREATE INDEX IF NOT EXISTS ix_holdings_snapshots_account_date
    ON holdings_snapshots(account_id, snapshot_date);
CREATE INDEX IF NOT EXISTS ix_holdings_snapshots_source
    ON holdings_snapshots(account_id, source);
