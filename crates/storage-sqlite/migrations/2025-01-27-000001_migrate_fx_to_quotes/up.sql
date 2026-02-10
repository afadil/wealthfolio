-- First, update existing currency assets
UPDATE assets
SET 
    name = CASE 
        WHEN length(e.id) >= 6 THEN substr(e.id, 1, 3) || '/' || substr(e.id, 4, 3) || ' Exchange Rate'
        ELSE e.id || ' Exchange Rate'
    END,
    asset_type = 'FOREX',
    asset_class = 'FOREX',
    asset_sub_class = 'FOREX',
    data_source = e.source,
    currency = CASE 
        WHEN length(e.id) >= 3 THEN substr(e.id, 1, 3)
        ELSE e.id
    END,
    comment = CASE 
        WHEN length(e.id) >= 6 THEN 'Currency pair for converting from ' || substr(e.id, 1, 3) || ' to ' || substr(e.id, 4, 3)
        ELSE 'Currency pair ' || e.id
    END,
    updated_at = CURRENT_TIMESTAMP
FROM exchange_rates e
WHERE assets.symbol = e.id;

-- Then insert new currency pairs into assets table
INSERT INTO assets (
    id,
    symbol,
    name,
    asset_type,
    data_source,
    currency,
    comment,
    created_at,
    updated_at
)
SELECT 
    id,
    id as symbol,
    CASE 
        WHEN length(id) >= 6 THEN substr(id, 1, 3) || '/' || substr(id, 4, 3) || ' Exchange Rate'
        ELSE id || ' Exchange Rate'
    END as name,
    'FOREX' as asset_type,
    source as data_source,
    CASE 
        WHEN length(id) >= 3 THEN substr(id, 1, 3)
        ELSE id
    END as currency,
    CASE 
        WHEN length(id) >= 6 THEN 'Currency pair for converting from ' || substr(id, 1, 3) || ' to ' || substr(id, 4, 3)
        ELSE 'Currency pair ' || id
    END as comment,
    created_at,
    updated_at
FROM exchange_rates
WHERE NOT EXISTS (
    SELECT 1 FROM assets 
    WHERE assets.symbol = exchange_rates.id
);

-- Insert quotes for manual exchange rates
INSERT INTO quotes (
    id,
    symbol,
    date,
    open,
    high,
    low,
    close,
    adjclose,
    volume,
    data_source,
    created_at
)
SELECT 
    id || '_' || strftime('%Y%m%d', updated_at),
    id,
    updated_at,
    rate,
    rate,
    rate,
    rate,
    rate,
    0.0,
    source,
    created_at
FROM exchange_rates;

-- Drop the exchange_rates table
DROP TABLE exchange_rates; 

-- Add performance optimizing indexes
CREATE INDEX IF NOT EXISTS idx_quotes_symbol_date ON quotes(symbol, date);
CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(date);
CREATE INDEX IF NOT EXISTS idx_assets_type_currency ON assets(asset_type); 


-- Capitalize all asset types
UPDATE assets SET asset_type = UPPER(asset_type), data_source = UPPER(data_source), symbol_mapping = symbol;
UPDATE assets SET asset_type = 'CASH' WHERE asset_class = 'CASH' OR id LIKE '$CASH-%';
UPDATE assets SET asset_type = 'FOREX' WHERE asset_type = 'CURRENCY';
UPDATE assets SET asset_class = 'FOREX', asset_sub_class = 'FOREX' WHERE asset_type = 'FOREX';
-- Update the countries JSON field to rename "code" to "name"
UPDATE assets 
SET countries = REPLACE(countries, '"code":', '"name":')
WHERE countries IS NOT NULL;

-- Delete quotes for cash symbols (not needed)
DELETE from quotes where symbol like '$CASH-%';