-- Add missing market data providers that were registered in code but not in the DB.
-- Without DB rows the settings page cannot display or toggle them.

INSERT OR IGNORE INTO market_data_providers (id, name, description, url, priority, enabled, logo_filename, last_synced_at, last_sync_status, last_sync_error)
VALUES
  ('METAL_PRICE_API', 'Metal Price API', 'Real-time precious metal spot prices in USD. Requires a free API key.', 'https://metalpriceapi.com/', 5, FALSE, 'metal-price-api.png', NULL, NULL, NULL),
  ('US_TREASURY_CALC', 'US Treasury Calculator', 'Calculates US Treasury bond prices from the official yield curve. No API key required.', 'https://home.treasury.gov/', 6, TRUE, 'treasury.png', NULL, NULL, NULL),
  ('BOERSE_FRANKFURT', 'Boerse Frankfurt', 'European bond pricing and profiles from Boerse Frankfurt. No API key required.', 'https://www.boerse-frankfurt.de/', 7, TRUE, 'boerse.png', NULL, NULL, NULL),
  ('OPENFIGI', 'OpenFIGI', 'Bond name resolution via the OpenFIGI mapping service. No API key required.', 'https://www.openfigi.com/', 8, TRUE, 'openfigi.png', NULL, NULL, NULL);
