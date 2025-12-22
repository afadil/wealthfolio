-- Rollback quote_sync_state table

DROP INDEX IF EXISTS idx_quote_sync_state_dates;
DROP INDEX IF EXISTS idx_quote_sync_state_priority;
DROP INDEX IF EXISTS idx_quote_sync_state_active;
DROP TABLE IF EXISTS quote_sync_state;
