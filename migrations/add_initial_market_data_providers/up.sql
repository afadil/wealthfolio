-- Add initial market data providers

INSERT INTO market_data_providers (id, name, api_key_vault_path, priority, enabled, logo_filename)
VALUES
    ('yahoo', 'Yahoo Finance', NULL, 1, TRUE, 'yahoo-finance.png'),
    ('marketdata_app', 'MarketData.app', NULL, 2, FALSE, 'marketdata-app.png');
