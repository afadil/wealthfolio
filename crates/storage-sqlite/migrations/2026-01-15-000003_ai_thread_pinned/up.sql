-- Add is_pinned column to ai_threads for thread pinning functionality
ALTER TABLE ai_threads ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

-- Index for sorting by pinned status (pinned first, then by updated_at)
CREATE INDEX idx_ai_threads_pinned_updated ON ai_threads(is_pinned DESC, updated_at DESC);
