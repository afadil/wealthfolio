-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- This migration removes the transfer_account_id column from activities

-- Create a temporary table without the transfer_account_id column
CREATE TABLE activities_backup (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity TEXT NOT NULL,
    unit_price TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee TEXT NOT NULL,
    amount TEXT,
    is_draft BOOLEAN NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    name TEXT,
    category_id TEXT REFERENCES categories(id),
    sub_category_id TEXT REFERENCES categories(id),
    event_id TEXT REFERENCES events(id)
);

-- Copy data from the original table
INSERT INTO activities_backup SELECT
    id, account_id, asset_id, activity_type, activity_date, quantity, unit_price,
    currency, fee, amount, is_draft, comment, created_at, updated_at,
    name, category_id, sub_category_id, event_id
FROM activities;

-- Drop the original table
DROP TABLE activities;

-- Rename the backup table to the original name
ALTER TABLE activities_backup RENAME TO activities;
