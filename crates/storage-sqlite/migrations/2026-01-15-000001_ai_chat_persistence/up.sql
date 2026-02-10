-- AI Chat Persistence Tables
-- Stores chat threads, messages, and tags for the AI assistant

-- Table: ai_threads
-- Stores chat thread metadata
CREATE TABLE ai_threads (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT,
    config_snapshot TEXT,  -- JSON: providerId, modelId, promptTemplateId, promptVersion, toolsAllowlist
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for listing threads by recency
CREATE INDEX idx_ai_threads_updated_at ON ai_threads(updated_at DESC);
-- Index for sorting by pinned status (pinned first, then by updated_at)
CREATE INDEX idx_ai_threads_pinned_updated ON ai_threads(is_pinned DESC, updated_at DESC);

-- Table: ai_messages
-- Stores messages within threads with structured content_json
CREATE TABLE ai_messages (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
    content_json TEXT NOT NULL,  -- JSON array of message parts with schemaVersion
    created_at TEXT NOT NULL,

    -- Ensure valid role values
    CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

-- Index for fetching messages by thread
CREATE INDEX idx_ai_messages_thread_id ON ai_messages(thread_id);
-- Index for ordering messages within a thread
CREATE INDEX idx_ai_messages_thread_created ON ai_messages(thread_id, created_at ASC);

-- Table: ai_thread_tags
-- Stores tags for filtering/organizing threads
CREATE TABLE ai_thread_tags (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,

    -- Prevent duplicate tags on same thread
    UNIQUE(thread_id, tag)
);

-- Index for filtering threads by tag
CREATE INDEX idx_ai_thread_tags_tag ON ai_thread_tags(tag);
CREATE INDEX idx_ai_thread_tags_thread_id ON ai_thread_tags(thread_id);
