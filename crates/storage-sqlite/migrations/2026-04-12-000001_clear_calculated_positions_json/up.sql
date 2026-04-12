-- Clear positions JSON for CALCULATED snapshots (TRANSACTIONS-mode accounts).
-- The lots table is the source of truth for these accounts; the positions
-- JSON was never read back and wasted ~150MB+ on typical portfolios.
-- HOLDINGS-mode snapshots (MANUAL_ENTRY, BROKER_IMPORTED, CSV_IMPORT, SYNTHETIC)
-- are preserved — they still use the positions JSON as their source of truth.
UPDATE holdings_snapshots SET positions = '{}' WHERE source = 'CALCULATED';
