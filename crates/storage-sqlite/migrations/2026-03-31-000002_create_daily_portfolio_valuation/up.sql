-- Portfolio-level daily valuations, replacing TOTAL pseudo-account rows
-- in daily_account_valuation.
CREATE TABLE daily_portfolio_valuation (
    id TEXT PRIMARY KEY NOT NULL,
    valuation_date DATE NOT NULL,
    base_currency TEXT NOT NULL,
    cash_balance TEXT NOT NULL DEFAULT '0',
    investment_market_value TEXT NOT NULL DEFAULT '0',
    alternative_market_value TEXT NOT NULL DEFAULT '0',
    total_assets TEXT NOT NULL DEFAULT '0',
    total_liabilities TEXT NOT NULL DEFAULT '0',
    net_worth TEXT NOT NULL DEFAULT '0',
    cost_basis TEXT NOT NULL DEFAULT '0',
    net_contribution TEXT NOT NULL DEFAULT '0',
    calculated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_portfolio_valuation_date ON daily_portfolio_valuation(valuation_date);

-- Backfill from existing TOTAL rows in daily_account_valuation.
INSERT INTO daily_portfolio_valuation (
    id, valuation_date, base_currency, cash_balance, investment_market_value,
    alternative_market_value, total_assets, total_liabilities, net_worth,
    cost_basis, net_contribution, calculated_at
)
SELECT
    id, valuation_date, base_currency, cash_balance, investment_market_value,
    alternative_market_value,
    total_value,    -- total_assets = old total_value (no liabilities tracked before)
    '0',            -- total_liabilities (not previously tracked)
    total_value,    -- net_worth = total_value (no liabilities subtracted before)
    cost_basis, net_contribution, calculated_at
FROM daily_account_valuation
WHERE account_id = 'TOTAL';

-- Remove TOTAL rows from daily_account_valuation.
DELETE FROM daily_account_valuation WHERE account_id = 'TOTAL';
