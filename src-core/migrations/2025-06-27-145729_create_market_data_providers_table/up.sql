CREATE TABLE market_data_providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    logo_filename TEXT,
    last_synced_at TEXT,
    last_sync_status TEXT,
    last_sync_error TEXT
);

INSERT INTO market_data_providers (id, name, description, priority, enabled, logo_filename, last_synced_at, last_sync_status, last_sync_error)
VALUES
    ('YAHOO', 'Yahoo Finance', 'Yahoo Finance is a leading financial data provider for many markets. It provides historical and real-time stock data.', 1, TRUE, 'yahoo-finance.png', NULL, NULL, NULL),
    ('MARKETDATA_APP', 'MarketData.app', 'https://www.marketdata.app/ provides real-time and historical data for U.S. stocks, options, ETFs, mutual funds, and more.', 2, FALSE, 'marketdata-app.png', NULL, NULL, NULL);