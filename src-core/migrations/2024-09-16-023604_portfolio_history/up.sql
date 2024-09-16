CREATE TABLE portfolio_history (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    total_value NUMERIC NOT NULL DEFAULT 0,
    market_value NUMERIC NOT NULL DEFAULT 0,
    book_cost NUMERIC NOT NULL DEFAULT 0,
    available_cash NUMERIC NOT NULL DEFAULT 0,
    net_deposit NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    total_gain_value NUMERIC NOT NULL DEFAULT 0,
    total_gain_percentage NUMERIC NOT NULL DEFAULT 0,
    day_gain_percentage NUMERIC NOT NULL DEFAULT 0,
    day_gain_value NUMERIC NOT NULL DEFAULT 0,
    allocation_percentage NUMERIC NOT NULL DEFAULT 0,
    exchange_rate NUMERIC NOT NULL DEFAULT 0,
    UNIQUE(account_id, date)
);
CREATE INDEX idx_portfolio_history_account_date ON portfolio_history(account_id, date);

-- Update goals table
ALTER TABLE goals RENAME TO goals_old;

CREATE TABLE goals (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_amount" NUMERIC NOT NULL,
    "is_achieved" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO goals (id, title, description, target_amount, is_achieved)
SELECT id, title, description, CAST(target_amount AS NUMERIC), is_achieved
FROM goals_old;

DROP TABLE goals_old;

