-- Set logo filenames for providers that were inserted without them
UPDATE market_data_providers SET logo_filename = 'treasury.png' WHERE id = 'US_TREASURY_CALC' AND logo_filename IS NULL;
UPDATE market_data_providers SET logo_filename = 'boerse.png' WHERE id = 'BOERSE_FRANKFURT' AND logo_filename IS NULL;
UPDATE market_data_providers SET logo_filename = 'openfigi.png' WHERE id = 'OPENFIGI' AND logo_filename IS NULL;
UPDATE market_data_providers SET logo_filename = 'metal-price-api.png' WHERE id = 'METAL_PRICE_API' AND logo_filename IS NULL;
