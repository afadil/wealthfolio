-- Remove bogus BROKER quotes that were created from DIVIDEND, INTEREST,
-- FEE, TAX, and CREDIT activities. These activity types store payment
-- amounts in unit_price, not asset market prices.
-- Preserves quotes where a price-bearing activity (BUY, SELL, TRANSFER_IN)
-- also exists on the same asset+day.
DELETE FROM quotes
WHERE source = 'BROKER'
  AND id IN (
    SELECT q.id
    FROM quotes q
    JOIN activities a ON a.asset_id = q.asset_id
      AND substr(a.activity_date, 1, 10) = q.day
    WHERE q.source = 'BROKER'
      AND a.activity_type IN ('DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'CREDIT')
      AND NOT EXISTS (
        SELECT 1 FROM activities a2
        WHERE a2.asset_id = q.asset_id
          AND substr(a2.activity_date, 1, 10) = q.day
          AND a2.activity_type IN ('BUY', 'SELL', 'TRANSFER_IN')
      )
  );
