-- Remove is_locked column from asset_class_targets

ALTER TABLE asset_class_targets
DROP COLUMN is_locked;
