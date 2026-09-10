-- Optional amount condition on categorization rules. Compares against the
-- activity's unsigned amount; amount_value2 is the upper bound, used only by
-- the 'between' operator. All three NULL = no amount condition.
ALTER TABLE spending_categorization_rules
    ADD COLUMN amount_op TEXT
    CHECK (amount_op IN ('eq', 'gt', 'gte', 'lt', 'lte', 'between'));
ALTER TABLE spending_categorization_rules ADD COLUMN amount_value TEXT;
ALTER TABLE spending_categorization_rules ADD COLUMN amount_value2 TEXT;
