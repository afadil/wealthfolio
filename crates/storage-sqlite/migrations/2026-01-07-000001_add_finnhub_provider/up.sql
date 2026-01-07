-- Add Finnhub provider to market_data_providers table
INSERT INTO market_data_providers (id, name, description, url, priority, enabled, logo_filename, last_synced_at, last_sync_status, last_sync_error)
VALUES
    ('FINNHUB', 'Finnhub', 'Finnhub provides real-time stock, forex, and cryptocurrency data with global coverage. Free tier includes 60 API calls/minute.', 'https://finnhub.io/', 4, FALSE, 'finnhub.png', NULL, NULL, NULL);
