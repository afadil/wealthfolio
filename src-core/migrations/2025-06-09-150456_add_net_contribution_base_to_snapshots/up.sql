-- Your SQL goes here

ALTER TABLE holdings_snapshots
ADD COLUMN net_contribution_base TEXT NOT NULL DEFAULT '0';

DELETE FROM holdings_snapshots;
DELETE FROM daily_account_valuation;

CREATE INDEX IF NOT EXISTS idx_dav_account_id ON daily_account_valuation (account_id);
CREATE INDEX IF NOT EXISTS idx_dav_valuation_date ON daily_account_valuation (valuation_date);
