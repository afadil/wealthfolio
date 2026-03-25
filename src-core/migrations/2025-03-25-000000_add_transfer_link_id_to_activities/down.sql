-- This file should undo anything in `up.sql`

-- Remove to_account_id column from activities table
ALTER TABLE activities DROP COLUMN to_account_id;

-- Remove transfer_link_id column from activities table
ALTER TABLE activities DROP COLUMN transfer_link_id;
