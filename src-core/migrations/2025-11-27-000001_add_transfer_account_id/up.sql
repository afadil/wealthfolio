-- Add transfer_account_id column to activities table
-- This field tracks the other account involved in TRANSFER_IN/TRANSFER_OUT transactions
-- For TRANSFER_IN: references where the money came from
-- For TRANSFER_OUT: references where the money went to
ALTER TABLE activities ADD COLUMN transfer_account_id TEXT REFERENCES accounts(id);
