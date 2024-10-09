-- Drop contribution_limits table
DROP TABLE IF EXISTS contribution_limits;

-- Remove contribution_limit_ids column from accounts table
ALTER TABLE accounts DROP COLUMN contribution_limit_ids;

-- Remove instance_id from app_settings
DELETE FROM app_settings WHERE setting_key = 'instance_id';
