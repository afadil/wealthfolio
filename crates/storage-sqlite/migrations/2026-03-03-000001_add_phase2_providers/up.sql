-- Add market data providers for bonds and precious metals
INSERT OR IGNORE INTO market_data_providers (id, name, description, url, priority, enabled, logo_filename, last_synced_at, last_sync_status, last_sync_error)
VALUES
    ('US_TREASURY_CALC', 'US Treasury (Calculated)', 'Calculates US Treasury bond prices from yield curve data published by the US Treasury Department.', 'https://home.treasury.gov/', 10, TRUE, 'treasury.png', NULL, NULL, NULL),
    ('BOERSE_FRANKFURT', 'Börse Frankfurt', 'Börse Frankfurt provides bond and security pricing data for European markets.', 'https://www.boerse-frankfurt.de/', 11, TRUE, 'boerse.png', NULL, NULL, NULL),
    ('OPENFIGI', 'OpenFIGI', 'OpenFIGI provides a mapping service for financial instrument identifiers (FIGI, ISIN, CUSIP, ticker).', 'https://www.openfigi.com/', 12, TRUE, 'openfigi.png', NULL, NULL, NULL),
    ('METAL_PRICE_API', 'Metal Price API', 'Provides real-time and historical spot prices for precious metals (gold, silver, platinum, palladium).', 'https://metalpriceapi.com/', 13, FALSE, 'metal-price-api.png', NULL, NULL, NULL);
