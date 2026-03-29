-- Corrective pass for the 2026-03-18 migration which lacked a guard
-- against same-day price-bearing activities. This re-checks BROKER
-- quotes with a NOT EXISTS clause so that legitimate fallback quotes
-- created by BUY/SELL/TRANSFER_IN on the same asset+day are preserved.
-- For fresh installs the prior migration already includes this guard;
-- this is a harmless no-op in that case.
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
