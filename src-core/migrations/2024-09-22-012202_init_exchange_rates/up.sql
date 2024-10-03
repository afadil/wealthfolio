-- Get the base currency from app_setting
WITH base_currency AS (
    SELECT setting_value AS currency
    FROM app_settings
    WHERE setting_key = 'base_currency'
)

-- Insert exchange rates for accounts
INSERT OR IGNORE INTO exchange_rates (id, from_currency, to_currency, rate, source)
SELECT 
    base_currency.currency || accounts.currency || '=X' AS id,
    base_currency.currency,
    accounts.currency,
    1.0, -- Default rate, to be updated later
    'MANUAL'
FROM accounts
CROSS JOIN base_currency
WHERE accounts.currency != base_currency.currency

UNION

-- Insert exchange rates for activities
SELECT DISTINCT
    accounts.currency || activities.currency || '=X' AS id,
    accounts.currency,
    activities.currency,
    1.0, -- Default rate, to be updated later
    'MANUAL'
FROM activities
JOIN accounts ON activities.account_id = accounts.id
WHERE activities.currency != accounts.currency

UNION

-- Insert exchange rates from base currency to activity currency
SELECT DISTINCT
    base_currency.currency || activities.currency || '=X' AS id,
    base_currency.currency,
    activities.currency,
    1.0, -- Default rate, to be updated later
    'MANUAL'
FROM activities
CROSS JOIN base_currency
WHERE activities.currency != base_currency.currency;