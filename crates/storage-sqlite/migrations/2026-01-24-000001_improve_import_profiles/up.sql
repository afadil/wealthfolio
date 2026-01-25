-- Refactor activity_import_profiles to use a single JSON config column
-- and add a name column for the profile

-- Step 1: Create the new table structure
CREATE TABLE activity_import_profiles_new (
    account_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Migrate existing data - combine all JSON columns into one config object
-- Note: parse_config is a new field, so we initialize it as empty object
INSERT INTO activity_import_profiles_new (account_id, name, config, created_at, updated_at)
SELECT
    aip.account_id,
    COALESCE(a.name, ''),
    json_object(
        'fieldMappings', json(aip.field_mappings),
        'activityMappings', json(aip.activity_mappings),
        'symbolMappings', json(aip.symbol_mappings),
        'accountMappings', json(aip.account_mappings),
        'parseConfig', json('{}')
    ),
    aip.created_at,
    aip.updated_at
FROM activity_import_profiles aip
LEFT JOIN accounts a ON aip.account_id = a.id;

-- Step 3: Drop old table and rename new one
DROP TABLE activity_import_profiles;
ALTER TABLE activity_import_profiles_new RENAME TO activity_import_profiles;
