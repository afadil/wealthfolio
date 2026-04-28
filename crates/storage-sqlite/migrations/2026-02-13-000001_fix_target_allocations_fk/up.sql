-- Fix: portfolio_target_allocations had FK referencing taxonomy_categories(id),
-- but taxonomy_categories uses a composite PK (taxonomy_id, id).
-- Drop the invalid FK by recreating the table without it.

CREATE TABLE portfolio_target_allocations_new (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    target_percent INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (target_id) REFERENCES portfolio_targets(id) ON DELETE CASCADE
);

INSERT INTO portfolio_target_allocations_new
    SELECT * FROM portfolio_target_allocations;

DROP TABLE portfolio_target_allocations;

ALTER TABLE portfolio_target_allocations_new RENAME TO portfolio_target_allocations;

CREATE INDEX idx_target_allocations_target ON portfolio_target_allocations(target_id);
