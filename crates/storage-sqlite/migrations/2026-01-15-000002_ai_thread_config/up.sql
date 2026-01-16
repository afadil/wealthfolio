-- Add config_snapshot to ai_threads for per-thread agent configuration
-- Stores: providerId, modelId, promptTemplateId, promptVersion, toolsAllowlist

ALTER TABLE ai_threads ADD COLUMN config_snapshot TEXT;
