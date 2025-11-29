-- Add transfer_account_id column back to activities table
ALTER TABLE activities ADD COLUMN transfer_account_id TEXT REFERENCES accounts(id);
