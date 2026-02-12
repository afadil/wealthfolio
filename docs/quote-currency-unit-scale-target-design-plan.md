# Quote Currency + Unit Scale Target Design Plan

## Goal

Replace minor-unit currency-code behavior (`GBp`/`GBX`) with an explicit model:

- currency code (major ISO, e.g. `GBP`)
- unit scale metadata (e.g. pence scale `2`)

This removes ambiguity and prevents unit-conversion drift across
create/import/sync/valuation flows.

## Phase 1: Canonical Domain Model

1. Define canonical asset + quote fields:

- `quote_currency` (major ISO, e.g. `GBP`)
- `quote_scale` (integer, e.g. `0` major units, `2` pence)
- optional trace fields for provider raw values (`raw_close`, `raw_currency`,
  `raw_scale`).

2. Keep existing fields during transition; mark old minor-code paths as legacy.

## Phase 2: Storage Migration

1. Add non-breaking DB migration(s) for new fields in `assets` and `quotes`.
2. Keep old columns and dual-read support initially.
3. Backfill defaults where safe (`quote_scale = 0` unless known
   exchange/provider rule says otherwise).

## Phase 3: Ingestion + Sync Normalization

1. Normalize provider quotes once at ingestion:

- provider value + provider unit metadata -> normalized value in canonical
  currency/scale.

2. Persist normalized price for valuation usage.
3. Persist raw provider values for audit/debug (optional but recommended for
   rollout).

## Phase 4: Asset Creation/Update Consistency

1. Enforce `MIC -> (currency, scale)` for all market-asset creation/update
   paths:

- single create
- bulk save
- import
- ensure-assets/batch path

2. Ensure activity transaction currency never silently drives market asset quote
   metadata.

## Phase 5: Valuation + Holdings Pipeline

1. Use normalized quote value exclusively in valuation calculations.
2. Remove branching based on minor-unit currency-code strings.
3. Keep backward compatibility adapter for legacy rows until migration
   completes.

## Phase 6: API + Frontend

1. Add API fields for `quoteScale` (and optional raw quote metadata).
2. Update formatting logic to use scale metadata instead of special currency
   strings.
3. Remove/retire frontend `GBp -> GBP` normalization hacks once backend parity
   is verified.

## Phase 7: Data Repair + Backfill

1. Add one-time repair job for known cases (e.g., `XLON + YAHOO` historical
   rows).
2. Produce anomaly report for ambiguous historical data before auto-conversion.
3. Apply deterministic conversions only where confidence is high.

## Phase 8: Verification + Rollout

1. Add tests for:

- single activity create
- bulk/import create
- quote sync
- valuation correctness
- UI display

2. Add regression scenario for `AZN.L` and other LSE symbols.
3. Roll out behind a feature flag or staged migration toggle.
4. Remove legacy minor-code paths after parity and backfill verification.

## Open Questions

1. Should legacy minor currency codes (`GBp`, `GBX`) remain accepted on write,
   or be fully rejected after migration?
2. Should raw provider quote values be stored permanently, or only during
   migration/debug mode?
3. For ambiguous historical rows, should correction be heuristic auto-fix or
   manual review queue?
