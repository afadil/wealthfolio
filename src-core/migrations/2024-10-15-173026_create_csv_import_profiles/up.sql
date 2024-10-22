CREATE TABLE IF NOT EXISTS import_mappings (
    account_id TEXT PRIMARY KEY NOT NULL,
    fields_mappings TEXT NOT NULL,
    activity_type_mappings TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
