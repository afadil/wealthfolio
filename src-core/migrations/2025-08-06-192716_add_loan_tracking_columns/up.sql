-- Add loan tracking columns to daily_account_valuation table
ALTER TABLE daily_account_valuation ADD COLUMN outstanding_loans TEXT DEFAULT '0';
ALTER TABLE daily_account_valuation ADD COLUMN portfolio_equity TEXT DEFAULT '0';

-- Add loan tracking columns to holdings_snapshots table  
ALTER TABLE holdings_snapshots ADD COLUMN outstanding_loans TEXT DEFAULT '0';
ALTER TABLE holdings_snapshots ADD COLUMN outstanding_loans_base TEXT DEFAULT '0';
