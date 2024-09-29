-- Your SQL goes here
-- Up migration
ALTER TABLE portfolio_history ADD COLUMN calculated_at TIMESTAMP NOT NULL DEFAULT '2024-09-28 12:00:00';

CREATE INDEX idx_activities_account_id ON activities(account_id);