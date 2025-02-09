-- First recreate the exchange_rates table
CREATE TABLE exchange_rates (
    id TEXT NOT NULL PRIMARY KEY,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate NUMERIC NOT NULL,
    source TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency)
);

-- Migrate data back from quotes to exchange_rates
INSERT INTO exchange_rates (id, from_currency, to_currency, rate, source, created_at, updated_at)
SELECT 
    quotes.symbol as id,
    substr(quotes.symbol, 1, 3) as from_currency,
    substr(quotes.symbol, 4, 3) as to_currency,
    quotes.close as rate,
    quotes.data_source as source,
    quotes.created_at,
    quotes.date as updated_at
FROM quotes
JOIN assets ON quotes.symbol = assets.symbol
WHERE assets.asset_type = 'Currency'
AND quotes.date = (
    SELECT MAX(date)
    FROM quotes AS q2
    WHERE q2.symbol = quotes.symbol
);

-- Clean up the quotes that were inserted for exchange rates
DELETE FROM quotes 
WHERE symbol IN (
    SELECT symbol 
    FROM assets 
    WHERE asset_type = 'Currency'
);

-- Clean up the currency assets
DELETE FROM assets 
WHERE asset_type = 'Currency';

-- Drop the indexes created in the up migration
DROP INDEX IF EXISTS idx_quotes_symbol_date;
DROP INDEX IF EXISTS idx_quotes_date;
DROP INDEX IF EXISTS idx_assets_type_currency; 