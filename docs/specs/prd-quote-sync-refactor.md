# Quote Sync Refactor Spec

## Background

Quote syncing currently has two public entry points:
- `QuoteSyncService::sync()` (normal periodic sync)
- `QuoteSyncService::resync()` (user-triggered “refetch all” / full refresh)

Quote sync is triggered by both runtimes:
- Desktop (Tauri): `src-tauri/src/listeners.rs` chooses sync behavior based on the portfolio job payload.
- Web (Axum server): `src-server/src/api/shared.rs` chooses sync behavior based on the portfolio job payload.

The sync planner is a mix of:
- Persistent cache (`quote_sync_state` table; modeled by `crates/core/src/quotes/sync_state.rs`)
- “Refresh cache from operational tables” on each `sync()` (`refresh_activity_dates_from_activities`, `refresh_earliest_quote_dates`)
- Direct “event updates” via `handle_activity_created` (spawned / not awaited)

## Identifiers & Naming

### Canonical identifier for syncing

The sync subsystem must be keyed by canonical **asset IDs** (a.k.a. “instrument IDs”), not by bare tickers.

- Canonical asset IDs include qualifiers (MIC, quote currency, etc), e.g.:
  - `SEC:AAPL:XNAS`
  - `SEC:SHOP:XTSE`
  - `FX:EUR:USD`
- Quote provider resolution and fetching requires more than a ticker:
  - `asset.kind`, `asset.exchange_mic`, `asset.currency`, `asset.preferred_provider`, `asset.provider_overrides`, etc.
- Therefore, external sync requests must provide `assetIds` (strings containing canonical asset IDs).

### Required rename to remove ambiguity

The codebase currently uses “symbol(s)” for what is functionally `asset_id` in many places (including the misleading repo method `list_by_symbols` which filters by `assets.id`).

This refactor standardizes naming:
- API payload: `assetIds` (not `symbols`)
- Rust variables: `asset_ids` (not `symbols`)
- Repository/service methods: `*_by_asset_ids` or `*_by_ids` (not `*_by_symbols`)
- Targeting: use canonical `asset_id` only (no “sync by ticker” APIs); tickers remain for search and display.

## Current Sync Triggers (Desktop + Web)

Important behavior: today, in both runtimes, a “portfolio update/recalculate job” always runs **market data sync first** (either `sync()` or `resync()`), even when the initiating action is unrelated to market data (e.g., goals/limits/exchange-rate CRUD).

Refactor decision: portfolio jobs must explicitly declare a market-sync policy (no implicit sync):
- `MarketSyncMode::None` (recalc only; no provider calls)
- `MarketSyncMode::Incremental { asset_ids: Option<Vec<String>> }` (default for most portfolio-impacting triggers)
- `MarketSyncMode::RefetchRecent { asset_ids: Option<Vec<String>>, days: i64 }` (explicit user action to refresh recent history, default `days = QUOTE_HISTORY_BUFFER_DAYS`)
- `MarketSyncMode::BackfillHistory { asset_ids: Option<Vec<String>>, days: i64 }` (explicit user action to rebuild longer history, default `days = DEFAULT_HISTORY_DAYS`; used by `/market-data/sync/history`)

Important: `MarketSyncMode` / `SyncMode` are **request/job parameters**, not persisted app settings.
They are chosen per-trigger (UI button, API call, portfolio job) and must not be stored in `settings` or any user preference table.

Default policy by trigger type:
- **Recalc-only (`None`)**: goals/limits CRUD, manual exchange-rate CRUD, alternative-asset valuation writes, quote import/manual quote updates (already writes quotes).
- **Incremental**: activity/account changes, broker-sync producing activities, manual “Update quotes” for an asset, general “Update portfolio”.
- **RefetchRecent**: explicit user action from Settings/Market Data (“Refetch recent”), never as an implicit side effect.
- **BackfillHistory**: explicit user action (“Rebuild history”) and `/market-data/sync/history`, never as an implicit side effect.

### Trigger Matrix

| Trigger | Runtime | Entry point | Job kind | Market sync | Targeting | Notes / FX implications |
|---|---|---|---|---|---|---|
| Manual “Update portfolio” | Desktop | `src-tauri/src/commands/portfolio.rs` `update_portfolio` | update | `sync()` | none | Always syncs “global assets needing sync” (symbols currently ignored in normal mode). |
| Manual “Recalculate portfolio” | Desktop | `src-tauri/src/commands/portfolio.rs` `recalculate_portfolio` | recalc | `sync()` | none | Same as above. |
| Manual “Sync market data” (UI refresh) | Desktop | `src-tauri/src/commands/market_data.rs` `sync_market_data` | update | Incremental/RefetchRecent/BackfillHistory | optional `assetIds` | UI must pass canonical asset IDs. |
| Change base currency | Desktop | `src-tauri/src/commands/settings.rs` `update_settings` | recalc | Incremental (plus FX backfill) | none | Must ensure FX pairs have coverage from earliest activity date for full recompute (see FX rules below). |
| Create/update/delete exchange rate (manual FX) | Desktop | `src-tauri/src/commands/settings.rs` exchange-rate commands | recalc | `sync()` | none | Market sync is likely unnecessary; valuations use FxService directly. |
| Change pricing mode (MARKET↔MANUAL) | Desktop | `src-tauri/src/commands/asset.rs` `update_pricing_mode` | recalc | RefetchRecent | 1 asset ID | Used to refresh recent history when re-enabling MARKET pricing. |
| Broker startup sync produces activities | Desktop | `src-tauri/src/scheduler.rs` `run_startup_sync` | recalc | `sync()` | none | Runs after broker sync; also requests asset enrichment separately. |
| Account created/updated/deleted (resource event) | Desktop | `src-tauri/src/listeners.rs` `handle_account_resource_change` | recalc | `sync()` | maybe 1 FX “symbol” | Currently builds FX “symbol” as `CUR/BASE` (legacy); should become `assetId` `CUR:BASE`. |
| Activity created/updated/deleted/imported/bulk-mutated | Desktop | `src-tauri/src/listeners.rs` `handle_activity_resource_change` | recalc | `sync()` | symbols set | Collects affected asset IDs + FX pairs; also currently spawns sync-state mutations (planned removal). |
| Alternative asset create/valuation update/delete | Desktop | `src-tauri/src/commands/alternative_assets.rs` | recalc | `sync()` | sometimes 1 asset ID | Assets are `pricing_mode=MANUAL`, so quote sync should skip them; running market sync is likely unnecessary. |
| Quote updated/deleted/imported | Desktop | `src-tauri/src/commands/market_data.rs` | update | mostly `sync()` | optional | These already operate on canonical quote `asset_id` when available. |
| Market data sync (API) | Web | `POST /api/v1/market-data/sync` (`src-server/src/api/market_data.rs`) | background job | Incremental/RefetchRecent/BackfillHistory | optional `assetIds` | Request contract uses canonical `assetIds`. |
| Sync history quotes (API) | Web | `POST /api/v1/market-data/sync/history` (`src-server/src/api/market_data.rs`) | sync-only | BackfillHistory | none | Does not run portfolio calculation; pure quote refresh endpoint. |
| Update quote (API) | Web | `PUT /api/v1/market-data/quotes/{symbol}` | background job | `resync()` | 1 ID | Path param is treated as `quote.asset_id`; should be renamed to `{assetId}`. |
| Delete quote / import quotes (API) | Web | `src-server/src/api/market_data.rs` | background job | `sync()` | none | Currently triggers market sync even when importing manual quotes. |
| Update pricing mode (API) | Web | `PUT /api/v1/assets/pricing-mode/{id}` (`src-server/src/api/assets.rs`) | background job | `resync()` | 1 ID | Same intent as desktop. |
| Create/update/delete account (API) | Web | `src-server/src/api/accounts.rs` | background job | `sync()` | maybe 1 FX “symbol” | Uses Yahoo format like `CADUSD=X` today; should become `assetId` `CAD:USD` if/when targeted sync is honored. |
| Activity create/update/delete/import (API) | Web | `src-server/src/api/activities.rs` → `trigger_activity_portfolio_job` | background job | Incremental | assetIds set | Must normalize FX targeting to FX asset IDs (`BASE:QUOTE`) to avoid relying on provider symbols. |
| Update settings / base currency (API) | Web | `src-server/src/api/settings.rs` | immediate job | Incremental (plus FX backfill) | none | Must ensure FX pairs have coverage from earliest activity date for full recompute (see FX rules below). |
| Create/update/delete exchange rate (API) | Web | `src-server/src/api/exchange_rates.rs` | background job | `sync()` | none | Market sync likely unnecessary. |
| Alternative asset create/valuation update/delete (API) | Web | `src-server/src/api/alternative_assets.rs` | background job | `sync()` | sometimes 1 asset ID | Same as desktop: assets are manual-priced; market sync likely unnecessary. |
| Portfolio update/recalculate (API) | Web | `POST /api/v1/portfolio/update` / `/recalculate` (`src-server/src/api/portfolio.rs`) | immediate job | `sync()` or `resync()` | optional | Server-side analogue of desktop portfolio triggers. |
| Broker scheduled sync produces activities | Web | `src-server/src/scheduler.rs` | immediate job | `sync()` | none | Triggers portfolio job when activities synced. |
| Goals / limits changes | Web | `src-server/src/api/goals.rs`, `src-server/src/api/limits.rs` | background job | `sync()` | none | Currently causes market sync even though unrelated. |

## FX + Base Currency Edge Cases

- FX assets are created via core services (FxService / FxRepository), and can be triggered both by:
  - user actions in the UI (Settings → add/update/delete exchange rates), and
  - internal flows (base-currency change, account/activity currency registration).
  - Base currency change registers currency pairs via `SettingsService.update_base_currency` → `FxService.register_currency_pair` → `create_fx_asset`.
  - Activities and accounts also register FX pairs in several paths (account currency ≠ base, activity currency ≠ account, asset currency ≠ account/activity).
- FX assets typically have **no activities** attached to them, so any plan logic that depends on `activity_min_date` will see `None` for FX.
- FX identifiers are currently inconsistent across runtimes:
  - FX assets in storage use `BASE:QUOTE` (e.g. `EUR:USD`).
  - Desktop listener code currently constructs FX “symbols” as `BASE/QUOTE` (slash).
  - Web server currently constructs FX “symbols” as provider symbols like `EURUSD=X`.
  - Today this inconsistency is partially hidden because normal `sync()` ignores the `symbols` list; once targeted sync is honored, these must be normalized to FX asset IDs (`BASE:QUOTE`).
- Therefore, for FX instruments the “start date” must be derived from portfolio needs, not from FX “first activity”. Decision (consistency-first):
  - For any job that performs a full portfolio history recomputation (e.g., base-currency change with `force_full_recalculation=true`), set `history_start_date` to the earliest activity date across the affected accounts.
    - Rationale: holdings snapshots and valuation history are ultimately derived from activities; using earliest activity ensures FX coverage matches the maximum possible history window.
  - For incremental jobs (no full history recomputation), do not backfill FX by default:
    - If FX quotes exist, incremental sync continues from `last_quote_date + 1`.
    - If FX quotes do not exist, fall back to `today - QUOTE_HISTORY_BUFFER_DAYS` (or a small configurable lookback).
  - FX sync planning uses `history_start_date` only for FX pairs that lack sufficient quote coverage (initial fetch/backfill); otherwise FX behaves like any other incrementally-synced asset.

## Problems Observed

### Correctness
- Inconsistent fallback windows:
  - `sync()` falls back to `QUOTE_HISTORY_BUFFER_DAYS` (45 days) when `first_activity_date` is missing.
  - `resync()` falls back to `DEFAULT_HISTORY_DAYS` (5 years) when `first_activity_date` is missing.
- `first_activity_date` can be `NULL` at sync time:
  - async race between activity creation, spawned `handle_activity_created`, and sync trigger emission
  - `resync()` does not refresh sync state before planning, so it observes stale/missing cache
  - activity refresh SQL only considers activities on active accounts (`acc.is_active = 1`)

### Concurrency / architecture
- Multiple writers to the same derived fields (`first_activity_date`, `earliest_quote_date`) create ordering hazards and hard-to-reason about behavior.
- Listener layer owns state mutation policy (via spawned tasks), but sync correctness depends on DB visibility and timing.

### Performance
- `sync()` refreshes state by running SQL updates against `activities` and `quotes` every time.
- The current refresh SQL uses correlated subqueries per row in `quote_sync_state`, which can become expensive as asset count grows.

## Goals

- Single, deterministic planning model: no “half-updated” observations.
- `sync()` and `resync()` share one planner and one fallback policy.
- Remove race conditions caused by spawned sync-state mutations.
- Keep sync planning performant as `activities`/`quotes` grow large.
- Preserve existing UX and external behavior (same triggers, same sync endpoints).

## Non-goals

- Changing market data provider behavior (Yahoo, etc).
- Reworking how portfolio recalculation is triggered.
- Replacing SQLite/Diesel or the write actor.

## Proposed Design (Hybrid Model A: compute activity bounds, keep minimal state)

### Key choice

Treat `quote_sync_state` as “sync cursor + health + provider config”, not as a materialized mirror of operational tables.

- Keep in `quote_sync_state`:
  - `asset_id`, `data_source`, `is_active`/position flags (if still needed by current semantics)
  - `last_synced_at`, `last_quote_date`, `earliest_quote_date` (maintained by quote writes)
  - `error_count`, `last_error`, retry/backoff fields if present/added later
  - `profile_enriched_at`
- Do not rely on persisted `first_activity_date`/`last_activity_date` for planning.
  - Instead compute activity bounds from `activities` at plan time for the set of assets being synced.
  - (Optional follow-up) stop writing these columns and later drop them via migration.

This keeps planning correct and avoids cache drift, while limiting operational-table reads to fast aggregate queries.

### Single entry point + mode

Replace the conceptual split between `sync()` and `resync()` with a single internal implementation:

- `sync(mode: SyncMode, asset_ids: Option<Vec<String>>)`
  - `SyncMode::Incremental`
  - `SyncMode::RefetchRecent { days: i64 }`
  - `SyncMode::BackfillHistory { days: i64 }`

Public API mapping:
- `sync()` → `SyncMode::Incremental`
- “Refetch recent” → `SyncMode::RefetchRecent { days: QUOTE_HISTORY_BUFFER_DAYS }`
- `/market-data/sync/history` and “Rebuild history” → `SyncMode::BackfillHistory { days: DEFAULT_HISTORY_DAYS }`

### Listener responsibilities

Listener layer (`src-tauri/src/listeners.rs`) should:
- Emit “portfolio recalculation/update requested” events.
- Choose sync mode via an explicit payload field (e.g., `market_sync_mode` / `sync_mode`), not a persisted setting.
- Not mutate quote sync state directly (remove spawned `handle_activity_*` calls).

This makes sync state updates a responsibility of the quote sync subsystem only.

## Planning Algorithm

### Targeting rules

- If `asset_ids` is `Some(list)`:
  - Attempt to sync exactly those assets.
  - Assets that are not eligible (e.g., `pricing_mode != Market`, unsupported kind, missing provider settings) should be skipped but reported in the result.
- If `asset_ids` is `None`:
  - Sync the eligible universe:
    - assets currently held (open position)
    - assets recently closed within `CLOSED_POSITION_GRACE_PERIOD_DAYS`
    - required FX assets for the portfolio job (normalized to FX asset IDs `BASE:QUOTE`)

### Inputs per asset

For each asset under consideration:
- `activity_min_date`: `MIN(date(activity_date))` from `activities` filtered by:
  - `activities.asset_id = ?`
  - joined `accounts.is_active = 1`
- `quote_min_date` / `quote_max_date`:
  - Prefer from `quote_sync_state.earliest_quote_date` / `last_quote_date`
  - If missing, compute via `MIN(day)` / `MAX(day)` from `quotes` for that `asset_id` (fallback-only / repair path)

### Date windows

Constants:
- `BUFFER_DAYS = QUOTE_HISTORY_BUFFER_DAYS` (45)
- `OVERLAP_DAYS` (3–7; provider correction window)
- `BACKFILL_MARGIN_DAYS = BACKFILL_SAFETY_MARGIN_DAYS` (7)
- `MIN_LOOKBACK_DAYS = MIN_SYNC_LOOKBACK_DAYS` (existing)

Compute `required_start = activity_min_date - (BUFFER_DAYS + BACKFILL_MARGIN_DAYS)` when activity exists.

Window semantics:
- Treat date windows as inclusive: fetch `[start_date, end_date]` in days.
- Use overlap intentionally; rely on idempotent upserts to dedupe.
- Never execute invalid windows (`start_date > end_date`).

#### Normal mode

- If `quote_max_date` exists:
  - `start = max(quote_max_date - OVERLAP_DAYS, today - MIN_LOOKBACK_DAYS)`
- Else if `activity_min_date` exists:
  - `start = activity_min_date - BUFFER_DAYS`
- Else:
  - `start = today - BUFFER_DAYS`
- `end = today`

Backfill detection:
- If `activity_min_date` exists and `quote_min_date` exists and `required_start < quote_min_date`:
  - create an additional backfill plan: `start = activity_min_date - BUFFER_DAYS`, `end = quote_min_date - 1 day`
  - or prioritize a single plan that covers the missing range (implementation choice; keep current category semantics if needed)

#### RefetchRecent mode

- `start = today - days` (default `days = QUOTE_HISTORY_BUFFER_DAYS`)
- `end = today`

#### BackfillHistory mode

- If `activity_min_date` exists: `start = activity_min_date - BUFFER_DAYS`
- Else: `start = today - days` (default `days = DEFAULT_HISTORY_DAYS`)
- `end = today`

### Query strategy (performance)

Avoid per-asset SQL queries. Use aggregated queries for the asset set:

- Activity bounds:
  - `SELECT asset_id, MIN(date(activity_date)) AS first, MAX(date(activity_date)) AS last
     FROM activities a
     JOIN accounts acc ON a.account_id = acc.id
     WHERE acc.is_active = 1 AND a.asset_id IN (...)
     GROUP BY asset_id`

- Quote bounds (fallback/repair only, or if state lacks bounds):
  - `SELECT asset_id, MIN(day) AS first, MAX(day) AS last
     FROM quotes
     WHERE asset_id IN (...)
     GROUP BY asset_id`

Recommended indexes (verify/ensure via migrations):
- `activities(asset_id, activity_date)`
- `quotes(asset_id, day)`

SQLite parameter limits:
- SQLite commonly limits bound parameters (often 999). Any `IN (...)` query over large `assetIds` will eventually fail.
- This applies to existing code today (e.g., batch quote queries in `crates/storage-sqlite/src/market_data/repository.rs` build an `IN (...)` placeholder list).
- Any new “aggregated bounds” queries must handle this by either:
  - chunking (e.g., 400–800 IDs per query) and merging results in memory, or
  - using a temp table / join strategy to avoid large parameter lists.

## Data Model Changes

### Near-term (no schema change required)

- Stop using `quote_sync_state.first_activity_date/last_activity_date` in planning.
- Keep columns present for compatibility; they may become stale but unused.

### Follow-up (schema cleanup, optional)

- Drop `first_activity_date` and `last_activity_date` columns once all code paths stop reading them.
- Consider dropping `refresh_activity_dates_from_activities` and `refresh_earliest_quote_dates` entirely.
- If `quote_sync_state` has not shipped and the migration has not been applied widely yet, prefer amending the original migration that introduced the table (`crates/storage-sqlite/migrations/2026-01-01-000002_quotes_market_data/up.sql`) to remove unused columns instead of adding an ALTER TABLE migration.
  - If the migration has already been applied in dev environments, changing it will cause a checksum mismatch; either reset local DBs or add a new forward migration.

## Sync State Update Policy

- Quote writes are the authoritative source for quote bounds:
  - On successful fetch+upsert, update `last_quote_date` and (conditionally) `earliest_quote_date`.
  - Ensure import paths update bounds too.
- Activity writes do not update `quote_sync_state` directly in the listener layer.
  - The planner reads activity bounds directly when needed.
- Closed position handling (stop syncing after close):
  - Keep using `quote_sync_state.is_active` as “has an open position now” and `position_closed_date` as the close date.
  - Decision: derive and persist open/closed transitions during snapshot calculation (after holdings snapshots are (re)calculated and persisted):
    - If an `asset_id` is present with non-zero quantity in the latest snapshots → `mark_active(asset_id)`.
    - If an `asset_id` was previously active but is no longer held → `mark_inactive(asset_id, closed_date)`.
  - Sync selection uses `CLOSED_POSITION_GRACE_PERIOD_DAYS`:
    - Always sync active assets.
    - Continue syncing recently-closed assets for a small grace period (default 30 days) to cover late provider availability/weekends and allow “catch up to close”.
    - After the grace period, stop fetching new quotes for the asset; historical quotes remain for charts/performance.

Bounds safety requirements:
- Bounds updates should be monotonic:
  - `earliest_quote_date = MIN(existing, new_min)`
  - `last_quote_date = MAX(existing, new_max)`
- Bounds updates should be crash-safe:
  - Prefer updating bounds in the same writer transaction as quote upserts (so a crash cannot leave quotes written without updating bounds, or vice-versa).

Concurrency / dedup:
- Prevent overlapping sync work from multiple triggers:
  - Ensure only one in-flight sync pipeline per `asset_id` at a time (in-process keyed lock is sufficient for a single runtime; DB-backed locking if needed across processes).
  - Coalesce bursty triggers (activity edits/imports) into a single sync job per short interval.

## Migration / Rollout Plan

0. **Naming + API contract (asset IDs)**
   - Frontend: send canonical `assetIds` (not tickers) in “sync market data” requests.
   - Desktop (Tauri) + Web (server): rename request fields from `symbols` → `asset_ids`/`assetIds` end-to-end.
   - No compatibility layer (single-repo change): update all callers in the same PR and fail fast if any old payload shape is used.
     - Remove/rename any remaining `symbols` request fields at compile time where possible (TypeScript + Rust structs).
     - For runtime JSON payloads (events/HTTP), prefer renaming fields and updating all emitters/clients together.
   - Mechanical renames (representative, non-exhaustive):
     - Frontend adapter/hook: `syncMarketData(symbols, ...)` → `syncMarketData(assetIds, ...)`
     - Tauri command payload: `sync_market_data(symbols, ...)` → `sync_market_data(asset_ids, ...)`
     - Tauri event payload: `PortfolioRequestPayload.symbols` → `PortfolioRequestPayload.asset_ids`
     - Server job config: `PortfolioJobConfig.symbols` → `PortfolioJobConfig.asset_ids`
     - Core service API: `QuoteService::resync(symbols)` → `QuoteService::resync(asset_ids)`
     - Asset repo/service: `list_by_symbols` / `get_assets_by_symbols` → `list_by_asset_ids` / `get_assets_by_asset_ids`
     - Keep “symbol” only for true tickers (e.g., `Asset.symbol`) and provider search endpoints.
   - Mandatory audit checklist (must be green before merge):
     - Desktop: all `PortfolioRequestPayload` emitters updated (settings, market_data, asset pricing mode, listeners).
     - Web: all `PortfolioRequestBody` producers updated (market-data routes, portfolio routes, settings, activities/accounts triggers).
     - Frontend: all calls to `syncMarketData(...)` pass canonical `asset.id` (not `asset.symbol`).
     - FX targeting normalized to FX asset IDs (`BASE:QUOTE`) everywhere (no `BASE/QUOTE`, no `BASEQUOTE=X` in targeting lists).

1. **Unify fallback policy**
   - Ensure both modes fall back to `today - QUOTE_HISTORY_BUFFER_DAYS` when activity bounds are missing.
2. **Unify planning**
   - Implement a single internal sync function used by both `sync()` and `resync()`.
3. **Remove listener sync-state mutations**
   - Delete spawned `handle_activity_created/handle_activity_deleted` calls from `src-tauri/src/listeners.rs`.
4. **Planner uses aggregated bounds queries**
   - Add repository methods to fetch activity bounds in one query for a set of assets.
   - Use quote bounds from state; optionally add repair query when state is missing bounds.
5. **Deprecate per-sync refresh**
   - Remove `refresh_sync_states()` calls that update activity/quote dates from operational tables.
6. **(Optional) Schema cleanup**
   - Drop unused columns and dead code once stable.

## Acceptance Criteria

- Targeted sync is keyed by canonical `asset_id` (supports same ticker on different MICs).
- `resync()` and `sync()` request the same default window when activity bounds are unknown (45 days).
- Creating an activity and immediately triggering a sync never causes a 5-year fetch due to missing activity dates.
- Quote plan generation does not depend on spawned listener tasks.
- Sync planning does not run correlated-per-state refresh queries against `activities`/`quotes` on every sync.

## Test Plan

- Identifier correctness:
  - Two assets with same `symbol` but different `exchange_mic` can be targeted independently via `assetIds`.
- Unit tests for planning:
  - No activity + no quotes → fetch last 45 days (both modes).
  - Activity exists + no quotes → fetch from activity - 45.
  - Quotes exist + activity earlier than quote_min → backfill detected.
  - RefetchAll ignores last_quote_date and uses activity_min (or 45 days fallback).
- Integration-ish tests (where available):
  - Simulate activity creation followed immediately by sync trigger; ensure planner uses activity bounds correctly without relying on `handle_activity_created`.

## Observability

- Log (debug) per asset plan: `asset_id`, `mode`, `start_date`, `end_date`, and which inputs were used (state vs query).
- Log aggregated query durations for activity bounds to detect regressions.
