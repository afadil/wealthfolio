-- Drop contribution_limits table
DROP TABLE IF EXISTS contribution_limits;

-- Remove instance_id from app_settings
DELETE FROM app_settings WHERE setting_key = 'instance_id';