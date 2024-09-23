-- Create the new app_settings table with key-value structure
CREATE TABLE "app_settings" (
    "setting_key" TEXT NOT NULL PRIMARY KEY,
    "setting_value" TEXT NOT NULL
);

-- Migrate existing settings to the new table
INSERT INTO "app_settings" ("setting_key", "setting_value")
SELECT 'theme', theme FROM settings
UNION ALL
SELECT 'font', font FROM settings
UNION ALL
SELECT 'base_currency', base_currency FROM settings;

-- Drop the old settings table
DROP TABLE "settings";