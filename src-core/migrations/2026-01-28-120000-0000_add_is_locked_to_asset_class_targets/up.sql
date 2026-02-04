-- Add is_locked column to asset_class_targets
-- Allows users to lock asset class targets to prevent accidental modifications

ALTER TABLE asset_class_targets
ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;
