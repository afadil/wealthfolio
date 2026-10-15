# Same-account currency exchanges through transfers

The internal cash transfer editor accepts the same source and destination
account when the cash currencies differ. Both actual amounts are required;
same-currency self-transfers (including normalized minor units) and same-account
securities transfers remain invalid. Desktop and mobile expose both currency
choices immediately when the same account is selected.

The existing pair-save API writes a `TRANSFER_OUT` and a `TRANSFER_IN` in one
SQLite writer transaction, with a shared `source_group_id` and
`flow.is_external: false` on both legs. A same-account cash pair in two
currencies whose legs are both explicitly internal moves neither net
contribution nor external flows, whatever the legs' source: the pair form, the
transfer link and the import linker all write that mark (engine rules R2.2). The
execution ratio comes from the two amounts, never from a fetched quote or the
activity-to-account `fx_rate`. Unmarked legacy pairs keep the per-leg
contribution. Account tracking-mode behaviour is unchanged (engine rules R1.2).

Pair editing retains both final amounts. A single-leg amount edit on an
explicitly internal pair scales its counterpart using the existing amounts, as
cross-account transfers do, without rounding through the displayed execution
rate or using a valuation override. Account/currency changes use the pair
editor. Lifecycle transitions and deletion use the existing pair cascade.
Duplication resolves the entire FX pair, even across pagination, and gives both
copies new per-leg idempotency keys and one new group. Grid duplicates remain
local until Save; list and Spending duplicates save immediately, as their
ordinary Duplicate actions do.

## Architecture impact

- No new activity type, database columns, migration, snapshot version or API.
  Both runtimes reuse the shared adapter, Tauri command/Axum handler, core
  activity service, SQLite transaction/outbox, events and background
  recomputation.
- Calculation change: every explicitly internal same-account FX pair becomes
  contribution-neutral. That includes pairs users already linked by hand and
  imported pairs whose amounts were edited after import, which moved net
  contribution before. No rows are rewritten, and stored history keeps the old
  figures. The next change in an affected account refolds it only from that day,
  so its history shows a one-time step in net contribution there until
  "Recalculate all" rewrites it from the start (covered by the release note).
  Native Spending totals already sum the two transfer legs and classify
  within-Spending pairs as neutral.
- No new provider requests, execution quote lookups, workers or retries.
  Existing local currency registration and valuation surfaces remain in charge
  of pricing.
- Older clients can store/sync these ordinary transfer rows, but lack the new
  contribution rule and editor support; use updated clients for editing and
  consistent returns. This is not a wire/schema compatibility guarantee for old
  calculations.

## Verification

- Core activity tests: validation before writes, neutrality from any source,
  exact amount propagation, preview parity, atomic pair editing/deletion and
  emitted scopes; a table test that core's rule agrees with the engine's pairing
  for every combination of source, flow flags and import FX record.
- Engine `manual_fx_transfer` tests: internal pairs from any source match the
  imported pair's balances, flows, contributions and returns; a pair without two
  explicitly internal legs retains legacy behaviour.
- Frontend tests: desktop/mobile validation, currency discovery, pair
  duplication and grid save payloads; adapter-command parity for both runtime
  routes.
- `pnpm test:e2e e2e/same-account-fx-transfers.spec.ts`: real web API and
  SQLite, desktop/mobile create/edit, grid/list/Spending duplicate/delete and
  native totals.
