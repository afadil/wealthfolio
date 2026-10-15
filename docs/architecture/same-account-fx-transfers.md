# Same-account currency exchanges through transfers

The internal cash transfer editor accepts the same source and destination
account when the cash currencies differ. Both actual amounts are required;
same-currency self-transfers (including normalized minor units) and same-account
securities transfers remain invalid. Desktop and mobile expose both currency
choices immediately when the same account is selected.

The existing pair-save API writes a `TRANSFER_OUT` and a `TRANSFER_IN` in one
SQLite writer transaction, with a shared `source_group_id`, `MANUAL` provenance
and `flow.is_external: false`. These explicitly internal manual FX pairs move
neither net contribution nor external flows. The execution ratio comes from the
two amounts, never from a fetched quote or the activity-to-account `fx_rate`.
Imported FX recognition and unmarked legacy pairs keep their existing rules.
Account tracking-mode behaviour is unchanged (engine rules R1.2).

Pair editing retains both final amounts. A single-leg amount edit on a manual
pair scales its counterpart using the existing amounts, without rounding through
the displayed execution rate or using a valuation override. Account/currency
changes use the pair editor. Lifecycle transitions and deletion use the existing
pair cascade. Duplication resolves the entire FX pair, even across pagination,
and gives both copies new per-leg idempotency keys and one new group. Grid
duplicates remain local until Save; list and Spending duplicates save
immediately, as their ordinary Duplicate actions do.

## Architecture impact

- No new activity type, database columns, migration, snapshot version or API.
  Both runtimes reuse the shared adapter, Tauri command/Axum handler, core
  activity service, SQLite transaction/outbox, events and background
  recomputation.
- Calculation changes are confined to explicitly internal manual same-account FX
  pairs. Native Spending totals already sum the two transfer legs and classify
  within-Spending pairs as neutral. Historical rows are not rewritten.
- No new provider requests, execution quote lookups, workers or retries.
  Existing local currency registration and valuation surfaces remain in charge
  of pricing.
- Older clients can store/sync these ordinary transfer rows, but lack the new
  manual-FX contribution rule and editor support; use updated clients for
  editing and consistent returns. This is not a wire/schema compatibility
  guarantee for old calculations.

## Verification

- Core activity tests: validation before writes, neutral provenance, exact
  amount propagation, preview parity, atomic pair editing/deletion and emitted
  scopes.
- Engine `manual_fx_transfer` tests: imported/manual parity for balances, flows,
  contributions and returns; incomplete provenance retains legacy behaviour.
- Frontend tests: desktop/mobile validation, currency discovery, pair
  duplication and grid save payloads; adapter-command parity for both runtime
  routes.
- `pnpm test:e2e e2e/same-account-fx-transfers.spec.ts`: real web API and
  SQLite, desktop/mobile create/edit, grid/list/Spending duplicate/delete and
  native totals.
