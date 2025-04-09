-- Drop new tables and indexes created in up.sql
DROP INDEX IF EXISTS idx_cash_account;
DROP INDEX IF EXISTS idx_cash_account_currency;
DROP TABLE IF EXISTS cash_holdings;

DROP INDEX IF EXISTS idx_lots_position;
DROP TABLE IF EXISTS lots;

DROP INDEX IF EXISTS idx_pos_account;
DROP INDEX IF EXISTS idx_pos_account_asset;
DROP TABLE IF EXISTS positions;
