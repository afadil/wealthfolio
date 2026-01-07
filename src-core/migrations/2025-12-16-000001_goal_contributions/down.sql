-- Recreate original goals_allocation table
CREATE TABLE goals_allocation (
    id TEXT NOT NULL PRIMARY KEY,
    percent_allocation INTEGER NOT NULL,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Note: Data cannot be accurately restored to percentages from fixed amounts
-- The goal_contributions data will be lost

-- Drop the new table
DROP INDEX IF EXISTS idx_goal_contributions_goal_id;
DROP INDEX IF EXISTS idx_goal_contributions_account_id;
DROP TABLE goal_contributions;
