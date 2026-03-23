-- Recreate old table
CREATE TABLE activity_import_profiles (
    account_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    account_mappings TEXT NOT NULL DEFAULT '{}'
);

-- Restore data from migrated templates
INSERT INTO activity_import_profiles (account_id, name, config, created_at, updated_at)
SELECT
    iat.account_id,
    it.name,
    it.config,
    iat.created_at,
    iat.updated_at
FROM import_account_templates iat
JOIN import_templates it ON it.id = iat.template_id;

DROP TABLE import_account_templates;
DROP TABLE IF EXISTS import_templates;
