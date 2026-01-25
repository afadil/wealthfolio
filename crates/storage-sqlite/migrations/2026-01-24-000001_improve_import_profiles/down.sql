-- Revert to the old table structure with separate columns

-- Step 1: Create the old table structure
CREATE TABLE activity_import_profiles_old (
    account_id TEXT PRIMARY KEY NOT NULL,
    field_mappings TEXT NOT NULL DEFAULT '{}',
    activity_mappings TEXT NOT NULL DEFAULT '{}',
    symbol_mappings TEXT NOT NULL DEFAULT '{}',
    account_mappings TEXT NOT NULL DEFAULT '{}',
    parse_config TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Migrate data back - extract JSON fields from config
INSERT INTO activity_import_profiles_old (account_id, field_mappings, activity_mappings, symbol_mappings, account_mappings, parse_config, created_at, updated_at)
SELECT
    account_id,
    COALESCE(json_extract(config, '$.fieldMappings'), '{}'),
    COALESCE(json_extract(config, '$.activityMappings'), '{}'),
    COALESCE(json_extract(config, '$.symbolMappings'), '{}'),
    COALESCE(json_extract(config, '$.accountMappings'), '{}'),
    json_extract(config, '$.parseConfig'),
    created_at,
    updated_at
FROM activity_import_profiles;

-- Step 3: Drop new table and rename old one
DROP TABLE activity_import_profiles;
ALTER TABLE activity_import_profiles_old RENAME TO activity_import_profiles;
