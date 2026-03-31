-- Move data back to daily_account_valuation as TOTAL rows.
INSERT INTO daily_account_valuation (
    id, account_id, valuation_date, account_currency, base_currency,
    fx_rate_to_base, cash_balance, investment_market_value, total_value,
    cost_basis, net_contribution, calculated_at, alternative_market_value
)
SELECT
    id, 'TOTAL', valuation_date, base_currency, base_currency,
    '1', cash_balance, investment_market_value, total_assets,
    cost_basis, net_contribution, calculated_at, alternative_market_value
FROM daily_portfolio_valuation;

DROP TABLE daily_portfolio_valuation;
