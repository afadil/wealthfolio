-- Add provider_type column to distinguish built-in from custom providers
ALTER TABLE market_data_providers ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'builtin';

-- Add config column (unused now, kept for schema compat)
ALTER TABLE market_data_providers ADD COLUMN config TEXT;

-- Seed the runtime dispatch provider
INSERT OR IGNORE INTO market_data_providers (id, name, description, url, priority, enabled, provider_type)
VALUES ('CUSTOM_SCRAPER', 'Custom Provider', 'Runtime dispatch provider for user-defined custom sources', NULL, 50, 1, 'builtin');

-- Dedicated syncable table for user-authored custom provider definitions.
-- UUID `id` is the sync identity; `code` is the slug used by assets/FX.
CREATE TABLE market_data_custom_providers (
    id          TEXT    NOT NULL PRIMARY KEY,
    code        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    priority    INTEGER NOT NULL DEFAULT 50,
    config      TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
