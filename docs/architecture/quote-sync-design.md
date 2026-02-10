# Quote Sync Design & Architecture

Companion to [market-data-quotes.md](./market-data-quotes.md) which covers the
provider/registry layer. This document focuses on **sync orchestration**,
**triggers**, and **known issues**.

---

## Sync Flow

```
User Action / Domain Event
    |
    v
Event Queue Worker (1s debounce, apps/tauri/src/domain_events/queue_worker.rs)
    |
    v
Planner (planner.rs) --> PortfolioRequestPayload w/ MarketSyncMode
    |
    v
run_portfolio_job()
    |--- Market Sync --> QuoteSyncService.sync(mode, asset_ids?)
    |       |--- Filter: skip cash, manual-priced, inactive assets
    |       |--- Build sync plans (activity bounds + quote bounds)
    |       |--- For each asset: sync_asset()
    |       |       |--- Per-asset lock (RAII SyncLockGuard, skip if locked)
    |       |       |--- MarketDataClient.fetch_historical_quotes()
    |       |       |--- QuoteStore.upsert_quotes() (REPLACE INTO, 1K chunks)
    |       |       |--- Update sync state (mark_synced / mark_sync_failed)
    |       |
    |       v
    |--- FxService.initialize()
    |--- Portfolio Recalc: snapshots -> valuations -> position status
```

---

## Sync Triggers

### Automatic (Domain Events)

| Event                 | Market Sync                          | Portfolio Recalc |
| --------------------- | ------------------------------------ | ---------------- |
| `ActivitiesChanged`   | Incremental for affected assets + FX | Yes              |
| `HoldingsChanged`     | Incremental for affected assets      | Yes              |
| `AccountsChanged`     | Incremental + FX for currency change | Yes              |
| `ManualSnapshotSaved` | None                                 | Yes              |
| `AssetsCreated`       | None (profile enrichment only)       | No               |
| `TrackingModeChanged` | None (broker sync only)              | No               |

### Manual (Frontend)

| UI Action                    | Mode                     | Scope        |
| ---------------------------- | ------------------------ | ------------ |
| "Update" (settings)          | Incremental              | All assets   |
| "Rebuild History" (settings) | BackfillHistory          | All assets   |
| "Refresh Quotes" (asset)     | Incremental              | Single asset |
| "Refetch Recent" (assets)    | RefetchRecent 45d        | All assets   |
| Pull-to-refresh (mobile)     | triggerPortfolioUpdate() | All assets   |

### Event Debouncing

- 1000ms debounce window collects events
- `is_processing` AtomicBool prevents concurrent batches
- Events arriving during processing are buffered for next batch

---

## Sync Modes

| Mode                       | Start Date                      | End Date | Use Case                    |
| -------------------------- | ------------------------------- | -------- | --------------------------- |
| `Incremental` (default)    | `quote_max - 5d` (overlap heal) | today    | Regular sync                |
| `RefetchRecent { days }`   | `today - days`                  | today    | Force refresh recent window |
| `BackfillHistory { days }` | `activity_min - 45d`            | today    | Full rebuild, resync        |

---

## Sync Categories

Assets are classified before each sync to determine date ranges:

```
Has activities but no quotes? --> NEW (priority 80)
    |                               Fetch from: activity_min - 45d
    No
    v
activity_min - 52d < quote_min? --> NEEDS_BACKFILL (priority 90)
    |                                Fetch gap before earliest quote
    No
    v
Has open position? -----------> ACTIVE (priority 100)
    |                               Continue from quote_max - 5d
    No
    v
Closed within 30d grace? -----> RECENTLY_CLOSED (priority 50)
    |                               Continue syncing
    No
    v
                                 CLOSED (priority 0, skip)
```

---

## Per-Asset Locking (US-012)

```rust
static SYNC_LOCKS: LazyLock<Mutex<HashSet<String>>>
```

- RAII `SyncLockGuard` prevents concurrent syncs for same asset
- `try_acquire()` returns `None` if already locked (non-blocking)
- Guard releases on drop (success, failure, or panic)
- Asset is skipped (not blocked) when lock unavailable

---

## FX Asset Handling (US-006)

FX pairs (e.g., `FX:EUR:USD`) have no activities. Special handling:

- **BackfillHistory**: Uses `get_first_activity_date_overall()` as global
  fallback start date
- **Incremental**: Falls through to `QUOTE_HISTORY_BUFFER_DAYS` (45d) if no
  existing quotes
- FX asset IDs are generated from currency changes:
  `format!("FX:{}:{}", currency, base_currency)`

---

## Profile Enrichment

Triggered by `AssetsCreated` events (spawned as background task):

1. `plan_asset_enrichment()` collects asset IDs from events
2. `asset_service.enrich_assets()` fetches profiles from providers
3. Updates: name, sector, industry, country, market cap, PE ratio, etc.
4. Tracked via `QuoteSyncState.profile_enriched_at`

---

## Constants

| Constant                            | Value | Purpose                                     |
| ----------------------------------- | ----- | ------------------------------------------- |
| `DEFAULT_HISTORY_DAYS`              | 1825  | 5yr fallback for new symbols                |
| `CLOSED_POSITION_GRACE_PERIOD_DAYS` | 30    | Days to keep syncing after close            |
| `QUOTE_HISTORY_BUFFER_DAYS`         | 45    | Days before first activity to fetch         |
| `BACKFILL_SAFETY_MARGIN_DAYS`       | 7     | Conservative backfill detection margin      |
| `MIN_SYNC_LOOKBACK_DAYS`            | 5     | Minimum window for weekends/holidays        |
| `OVERLAP_DAYS`                      | 5     | Incremental overlap for healing corrections |
| `MAX_SYNC_ERRORS`                   | 10    | Skip asset after N consecutive failures     |
| `DEBOUNCE_MS`                       | 1000  | Event debounce window                       |

---

## Known Edge Cases

### E1: Sequential sync execution

Assets sync sequentially in `execute_sync_plans()`. No parallelism. With many
assets and slow providers, total time = N \* avg_fetch_time.

### E2: NeedsBackfill creates two plans for same asset

When an active asset needs backfill, TWO plans are created: one for the gap, one
for recent data. Wastes API calls on overlapping data (harmless due to upsert,
but inefficient).

### E3: FX assets + Incremental + no quotes = 45d only

FX assets with no existing quotes get only 45d of history in Incremental mode.
May be insufficient for historical portfolio calculations.

### E4: Hardcoded "USD" currency in generate_sync_plan

`generate_sync_plan()` hardcodes `currency: "USD"` in SymbolSyncPlan. Comment
says "will be updated from asset" but the update path is unclear.

### E5: Asset.is_active vs QuoteSyncState.is_active desync

Two independent `is_active` flags can disagree. `should_sync_asset()` checks
`Asset.is_active`, sync planning checks `QuoteSyncState.is_active`. Reconciled
only after portfolio recalc updates position status from holdings snapshot.

### E6: Race between enrichment and sync

Profile enrichment runs as `tokio::spawn` background task while market sync runs
synchronously. If enrichment changes `preferred_provider`, current sync may use
wrong provider.

### E7: Market-effective-date timezone edge

`effective_market_today()` converts UTC to market-effective date. Users in
distant timezones may see 1-day delay in quote availability.

---

## Potential Improvements

### P1: Parallel asset sync with concurrency limit

Replace sequential loop with `futures::stream::buffer_unordered(N)`. Per-asset
locking already prevents duplicates.

### P2: Decouple market sync from portfolio recalc

Allow portfolio recalc with existing (stale) quotes while sync runs in
background. Emit "quotes updated" event for incremental refresh.

### P3: Profile enrichment TTL

Add staleness check: `profile_enriched_at + 30d < now`. Re-enrich stale profiles
during sync or on-demand.

### P4: Surface per-asset sync errors in UI

`MarketSyncResult` already carries per-asset failure data. Expose in a UI
component (expandable error section in market data settings).
