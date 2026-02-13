-- Revert: recreate table with the original FK (will have the same composite PK issue)
CREATE TABLE portfolio_target_allocations_old (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    target_percent INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (target_id) REFERENCES portfolio_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES taxonomy_categories(id)
);

INSERT INTO portfolio_target_allocations_old
    SELECT * FROM portfolio_target_allocations;

DROP TABLE portfolio_target_allocations;

ALTER TABLE portfolio_target_allocations_old RENAME TO portfolio_target_allocations;

CREATE INDEX idx_target_allocations_target ON portfolio_target_allocations(target_id);
