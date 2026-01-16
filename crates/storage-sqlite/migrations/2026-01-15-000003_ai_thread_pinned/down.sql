-- Remove is_pinned column and its index
DROP INDEX IF EXISTS idx_ai_threads_pinned_updated;
-- SQLite doesn't support DROP COLUMN directly, but for rollback purposes
-- we document this would require table recreation
