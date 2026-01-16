-- Rollback AI Chat Persistence Tables

DROP INDEX IF EXISTS idx_ai_thread_tags_thread_id;
DROP INDEX IF EXISTS idx_ai_thread_tags_tag;
DROP TABLE IF EXISTS ai_thread_tags;

DROP INDEX IF EXISTS idx_ai_messages_thread_created;
DROP INDEX IF EXISTS idx_ai_messages_thread_id;
DROP TABLE IF EXISTS ai_messages;

DROP INDEX IF EXISTS idx_ai_threads_updated_at;
DROP TABLE IF EXISTS ai_threads;
