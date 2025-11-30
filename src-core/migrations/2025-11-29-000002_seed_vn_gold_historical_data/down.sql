-- Remove seeded VN.GOLD historical data
DELETE FROM vn_historical_records 
WHERE symbol = 'VN.GOLD' 
  AND asset_type = 'GOLD'
  AND id LIKE 'gold_%';
