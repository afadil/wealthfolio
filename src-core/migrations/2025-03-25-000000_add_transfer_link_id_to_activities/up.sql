-- Your SQL goes here

-- Add transfer_link_id column to activities table for linking transfer pairs
ALTER TABLE activities ADD COLUMN transfer_link_id TEXT DEFAULT NULL;

-- Add to_account_id column to activities table for tracking transfer destination
ALTER TABLE activities ADD COLUMN to_account_id TEXT DEFAULT NULL;
