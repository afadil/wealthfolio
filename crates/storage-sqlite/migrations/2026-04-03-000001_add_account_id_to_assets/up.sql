-- Optional link from alternative assets (liabilities, property, etc.) to the
-- account they belong to.  NULL for unlinked assets (house, gold in a safe)
-- and for investment assets (linked via activities/lots instead).
ALTER TABLE assets ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
