-- Remove loan tracking columns from daily_account_valuation table
-- Note: Requires SQLite 3.35.0+ for DROP COLUMN support
ALTER TABLE daily_account_valuation DROP COLUMN outstanding_loans;
ALTER TABLE daily_account_valuation DROP COLUMN portfolio_equity;

-- Remove loan tracking columns from holdings_snapshots table
ALTER TABLE holdings_snapshots DROP COLUMN outstanding_loans;
ALTER TABLE holdings_snapshots DROP COLUMN outstanding_loans_base;
