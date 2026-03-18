-- Remove bogus BROKER quotes that were created from DIVIDEND, INTEREST,
-- FEE, TAX, and CREDIT activities. These activity types store payment
-- amounts in unit_price, not asset market prices.
DELETE FROM quotes
WHERE source = 'BROKER'
  AND id IN (
    SELECT q.id
    FROM quotes q
    JOIN activities a ON a.asset_id = q.asset_id
      AND substr(a.activity_date, 1, 10) = q.day
    WHERE q.source = 'BROKER'
      AND a.activity_type IN ('DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'CREDIT')
  );
