-- Your SQL goes here
CREATE TABLE market_data_providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    api_key_vault_path TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    logo_filename TEXT
);
