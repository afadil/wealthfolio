-- Drop VN Market Historical Records table
DROP INDEX IF EXISTS idx_vn_historical_date;
DROP INDEX IF EXISTS idx_vn_historical_asset_type;
DROP INDEX IF EXISTS idx_vn_historical_symbol_date;
DROP TABLE IF EXISTS vn_historical_records;
