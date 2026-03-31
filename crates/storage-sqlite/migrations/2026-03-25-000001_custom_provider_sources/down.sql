-- Remove the CUSTOM_SCRAPER seed row
DELETE FROM market_data_providers WHERE id = 'CUSTOM_SCRAPER';

-- SQLite cannot DROP COLUMN, so recreate market_data_providers without provider_type/config
CREATE TABLE market_data_providers_backup AS SELECT
    id, name, description, url, priority, enabled, logo_filename,
    last_synced_at, last_sync_status, last_sync_error
FROM market_data_providers;

DROP TABLE market_data_providers;

CREATE TABLE market_data_providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT 0,
    logo_filename TEXT,
    last_synced_at TEXT,
    last_sync_status TEXT,
    last_sync_error TEXT
);

INSERT INTO market_data_providers SELECT * FROM market_data_providers_backup;
DROP TABLE market_data_providers_backup;
