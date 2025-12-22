CREATE TABLE portfolio_history (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    date DATE NOT NULL,
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
    holdings TEXT,
    UNIQUE(account_id, date)
);
CREATE INDEX idx_portfolio_history_account_date ON portfolio_history(account_id, date);

-- change goals table column types
ALTER TABLE "goals" ADD COLUMN "target_amount_new" NUMERIC NOT NULL DEFAULT 0;
UPDATE "goals" SET "target_amount_new" = "target_amount";
ALTER TABLE "goals" DROP COLUMN "target_amount";
ALTER TABLE "goals" RENAME COLUMN "target_amount_new" TO "target_amount";
ALTER TABLE "goals" ADD COLUMN "is_achieved_new" BOOLEAN NOT NULL DEFAULT false;
UPDATE "goals" SET "is_achieved_new" = COALESCE("is_achieved", false);
ALTER TABLE "goals" DROP COLUMN "is_achieved";
ALTER TABLE "goals" RENAME COLUMN "is_achieved_new" TO "is_achieved";

CREATE TABLE exchange_rates (
    id TEXT NOT NULL PRIMARY KEY,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate NUMERIC NOT NULL,
    source TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency)
);

CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
