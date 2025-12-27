-- Create new goal_contributions table to replace goals_allocation
CREATE TABLE goal_contributions (
    id TEXT NOT NULL PRIMARY KEY,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    contributed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX idx_goal_contributions_goal_id ON goal_contributions(goal_id);
CREATE INDEX idx_goal_contributions_account_id ON goal_contributions(account_id);

-- Migrate existing data: Convert percent_allocation to fixed amounts
-- Uses the latest cash_balance from daily_account_valuation for each account
INSERT INTO goal_contributions (id, goal_id, account_id, amount, contributed_at)
SELECT
    ga.id,
    ga.goal_id,
    ga.account_id,
    COALESCE((CAST(ga.percent_allocation AS REAL) / 100.0) * CAST(dav.cash_balance AS REAL), 0.0) as amount,
    datetime('now') as contributed_at
FROM goals_allocation ga
LEFT JOIN (
    SELECT account_id, cash_balance,
           ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY valuation_date DESC) as rn
    FROM daily_account_valuation
) dav ON ga.account_id = dav.account_id AND dav.rn = 1
WHERE ga.percent_allocation > 0;

-- Drop the old table
DROP TABLE goals_allocation;
