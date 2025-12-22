-- Create a temporary table with the original structure
CREATE TABLE "settings" (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    theme TEXT NOT NULL DEFAULT 'light',
    font TEXT NOT NULL,
    base_currency TEXT NOT NULL
);

-- Migrate data back from app_settings to settings
INSERT INTO settings (theme, font, base_currency)
SELECT 
    (SELECT setting_value FROM app_settings WHERE setting_key = 'theme'),
    (SELECT setting_value FROM app_settings WHERE setting_key = 'font'),
    (SELECT setting_value FROM app_settings WHERE setting_key = 'base_currency');

-- Drop the new app_settings table
DROP TABLE "app_settings";