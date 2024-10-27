CREATE TABLE IF NOT EXISTS activity_import_profiles (
    account_id TEXT PRIMARY KEY NOT NULL,
    field_mappings TEXT NOT NULL,
    activity_mappings TEXT NOT NULL,
    symbol_mappings TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

