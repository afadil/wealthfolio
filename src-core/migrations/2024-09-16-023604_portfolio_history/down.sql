DROP TABLE IF EXISTS portfolio_history;

-- Revert changes to goals table
ALTER TABLE goals RENAME TO goals_new;

CREATE TABLE goals (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_amount" REAL NOT NULL,
    "is_achieved" BOOLEAN
);

INSERT INTO goals (id, title, description, target_amount, is_achieved)
SELECT id, title, description, CAST(target_amount AS REAL), is_achieved
FROM goals_new;

DROP TABLE goals_new;

DROP INDEX IF EXISTS idx_portfolio_history_account_date;
