-- Revert initial market data providers

DELETE FROM market_data_providers WHERE id = 'yahoo';
DELETE FROM market_data_providers WHERE id = 'marketdata_app';
