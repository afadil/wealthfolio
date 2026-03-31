-- Add provider_type column to distinguish built-in from custom providers
ALTER TABLE market_data_providers ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'builtin';

-- Add config column for custom provider source definitions (JSON)
ALTER TABLE market_data_providers ADD COLUMN config TEXT;

-- Seed the runtime dispatch provider
INSERT OR IGNORE INTO market_data_providers (id, name, description, url, priority, enabled, provider_type)
VALUES ('CUSTOM_SCRAPER', 'Custom Provider', 'Runtime dispatch provider for user-defined custom sources', NULL, 50, 1, 'builtin');
