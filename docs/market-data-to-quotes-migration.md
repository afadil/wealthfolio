# Market Data to Quotes Module Migration

## Overview

This document describes the migration from the legacy `market_data/` module to the new `quotes/` module.

## Current State

```
crates/core/src/
├── market_data/                    # LEGACY - to be deleted
│   ├── mod.rs                      # Re-exports from quotes (migration shim)
│   ├── market_data_service.rs      # 1962 lines - contains sync logic + fill_missing_quotes
│   ├── market_data_traits.rs       # MarketDataServiceTrait, MarketDataRepositoryTrait
│   ├── market_data_model.rs        # Re-exports from quotes
│   ├── market_data_errors.rs       # MarketDataError
│   ├── market_data_constants.rs    # Constants
│   └── quote_sync_state_traits.rs  # QuoteSyncStateRepositoryTrait
│
└── quotes/                         # NEW - target module
    ├── mod.rs
    ├── model.rs                    # Quote, SymbolSearchResult, LatestQuotePair, DataSource
    ├── store.rs                    # QuoteStore, ProviderSettingsStore traits
    ├── service.rs                  # QuoteService, QuoteServiceTrait
    ├── sync.rs                     # QuoteSyncService
    ├── sync_state.rs               # QuoteSyncState, SyncStateStore
    ├── import.rs                   # QuoteImport, QuoteValidator, QuoteConverter
    ├── client.rs                   # MarketDataClient (facade)
    ├── provider.rs                 # MarketDataProvider trait
    ├── registry.rs                 # ProviderRegistry
    ├── provider_settings.rs        # MarketDataProviderSetting
    ├── constants.rs                # Configuration constants
    ├── types.rs                    # AssetId, Day, QuoteSource strong types
    └── service_tests.rs            # Contract tests
```

## Target State

Delete `market_data/` entirely. All consumers use `quotes/` directly.

## Service Trait Mapping

### MarketDataServiceTrait -> QuoteServiceTrait

| Old Method                              | New Method                   | Notes                        |
|-----------------------------------------|------------------------------|------------------------------|
| `get_latest_quote_for_symbol`           | `get_latest_quote`           | Same behavior                |
| `get_latest_quotes_for_symbols`         | `get_latest_quotes`          | Same behavior                |
| `get_latest_quotes_pair_for_symbols`    | `get_latest_quotes_pair`     | Same behavior                |
| `get_historical_quotes_for_symbol`      | `get_historical_quotes`      | Same behavior                |
| `get_all_historical_quotes`             | `get_all_historical_quotes`  | Same behavior                |
| `get_historical_quotes_for_symbols_in_range` | `get_quotes_in_range`   | **SEE CRITICAL ISSUE**       |
| `get_daily_quotes`                      | `get_daily_quotes`           | Same behavior                |
| `search_symbol`                         | `search_symbol`              | Same behavior                |
| `get_asset_profile`                     | `get_asset_profile`          | Same behavior                |
| `get_historical_quotes_from_provider`   | `fetch_quotes_from_provider` | Same behavior                |
| `sync_market_data`                      | `sync`                       | Returns `SyncResult`         |
| `resync_market_data`                    | `resync`                     | Returns `SyncResult`         |
| `refresh_sync_state`                    | `refresh_sync_state`         | Same behavior                |
| `get_sync_plan`                         | `get_sync_plan`              | Same behavior                |
| `handle_new_activity`                   | `handle_activity_created`    | Same behavior                |
| `handle_activity_deleted`               | `handle_activity_deleted`    | Same behavior                |
| `delete_sync_state`                     | `delete_sync_state`          | Same behavior                |
| `get_symbols_needing_sync`              | `get_symbols_needing_sync`   | Same behavior                |
| `get_market_data_providers_info`        | `get_providers_info`         | Returns `Vec<ProviderInfo>`  |
| `get_market_data_providers_settings`    | -                            | Internal use only, removed   |
| `update_market_data_provider_settings`  | `update_provider_settings`   | Same behavior                |
| `import_quotes_from_csv`                | `import_quotes`              | Same behavior                |
| `bulk_upsert_quotes`                    | `bulk_upsert_quotes`         | Same behavior                |
| `add_quote`                             | `add_quote`                  | Same behavior                |
| `update_quote`                          | `update_quote`               | Same behavior                |
| `delete_quote`                          | `delete_quote`               | Same behavior                |
| `handle_activity_date_change`           | `handle_activity_created`    | Use same method              |

### Repository Trait Mapping

| Old Trait                          | New Trait              |
|------------------------------------|------------------------|
| `MarketDataRepositoryTrait`        | `QuoteStore`           |
| `QuoteSyncStateRepositoryTrait`    | `SyncStateStore`       |

## CRITICAL ISSUE: fill_missing_quotes

### Problem

The old `MarketDataService.get_historical_quotes_for_symbols_in_range()` internally calls `fill_missing_quotes()` to fill gaps for weekends and holidays. The new `QuoteService.get_quotes_in_range()` does NOT do this.

### Impact

Without gap filling, portfolio valuation will show **$0 on weekends and holidays** because there are no quotes for those days.

### Affected Consumers

Based on audit, these services call `get_historical_quotes_for_symbols_in_range`:

1. **NetWorthService** - calculates daily net worth history
2. **ValuationService** - calculates historical valuations
3. **PerformanceService** - calculates returns and performance
4. **HoldingsValuationService** - via get_daily_quotes (indirectly)

### Solution Options

**Option A: Add `fill_missing_quotes` to QuoteServiceTrait (Recommended)**

```rust
/// Get quotes in range with gap filling for weekends/holidays.
fn get_quotes_in_range_filled(
    &self,
    symbols: &HashSet<String>,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<Vec<Quote>>;
```

Pros:
- Maintains single source of truth for gap filling logic
- Backward compatible behavior
- Consumers don't need to change

Cons:
- Service has knowledge of market calendars

**Option B: Move gap filling to consumers**

Each consumer calls `get_quotes_in_range()` and then `fill_missing_quotes()` utility.

Pros:
- QuoteService stays "pure" (only returns actual data)
- Consumers can customize gap filling

Cons:
- Code duplication
- Easy to forget and cause bugs

### Recommendation

**Option A** - Add `get_quotes_in_range_filled()` to `QuoteServiceTrait` alongside the raw `get_quotes_in_range()`. This preserves the existing behavior while making it explicit.

### Algorithm (from MarketDataService:1233-1300)

```rust
fn fill_missing_quotes(
    quotes: &[Quote],
    required_symbols: &HashSet<String>,
    start_date: NaiveDate,
    end_date: NaiveDate,
) -> Vec<Quote> {
    // 1. Build quotes_by_date map
    let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = ...;

    // 2. Initialize last_known_quotes by looking back up to 10 years
    let mut last_known_quotes: HashMap<String, Quote> = HashMap::new();
    // Look back from start_date to find initial quotes for each symbol

    // 3. For each day in range
    for current_date in days_between(start_date, end_date) {
        // Update last_known_quotes with actual quotes for this day
        if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
            for (symbol, quote) in daily_quotes {
                last_known_quotes.insert(symbol.clone(), quote.clone());
            }
        }

        // Output last known quote for each symbol (with today's timestamp)
        for symbol in required_symbols {
            if let Some(last_quote) = last_known_quotes.get(symbol) {
                let mut filled = last_quote.clone();
                filled.timestamp = Utc.from_utc_datetime(&current_date.and_hms(12, 0, 0));
                all_filled_quotes.push(filled);
            }
        }
    }

    all_filled_quotes
}
```

## Actual Usage Audit

Methods with actual usages across the codebase:

| Method                                | Usage Count | Main Callers                           |
|---------------------------------------|-------------|----------------------------------------|
| `get_latest_quotes_for_symbols`       | 4           | AlternativeAssetsService               |
| `get_historical_quotes_for_symbols_in_range` | 4    | NetWorthService, ValuationService      |
| `get_latest_quotes_pair_for_symbols`  | 2           | HoldingsValuationService               |
| `get_daily_quotes`                    | 3           | HoldingsValuationService               |
| `search_symbol`                       | 2           | AssetsService, commands                |
| `get_asset_profile`                   | 3           | AssetsService, commands                |
| `sync_market_data`                    | 2           | listeners, commands                    |
| `resync_market_data`                  | 1           | commands                               |
| `refresh_sync_state`                  | 1           | commands                               |
| `import_quotes_from_csv`              | 1           | commands                               |
| `handle_new_activity`                 | 1           | listeners                              |

Methods with NO actual usages (can be deprioritized):

- `get_all_historical_quotes`
- `get_latest_quote_for_symbol` (singular)
- `get_historical_quotes_for_symbol` (singular)
- `add_quote`, `update_quote`, `delete_quote`
- `get_market_data_providers_info`
- `get_market_data_providers_settings`
- `update_market_data_provider_settings`
- `get_sync_plan`, `handle_activity_date_change`, etc.

## Migration Steps

### Phase 1: Add fill_missing_quotes to QuoteService

1. Add `get_quotes_in_range_filled()` method to `QuoteServiceTrait`
2. Implement `fill_missing_quotes()` as private helper in `QuoteService`
3. Add tests for gap filling edge cases

### Phase 2: Update ServiceContext

1. Replace `MarketDataServiceTrait` with `QuoteServiceTrait` in `ServiceContext`
2. Update `providers.rs` to create `QuoteService` instead of `MarketDataService`

### Phase 3: Update Portfolio Services

Update each service to use new trait:

1. **NetWorthService**
   - Import `QuoteServiceTrait` instead of `MarketDataServiceTrait`
   - Change `get_historical_quotes_for_symbols_in_range` -> `get_quotes_in_range_filled`

2. **HoldingsValuationService**
   - Import `QuoteServiceTrait`
   - Change `get_latest_quotes_pair_for_symbols` -> `get_latest_quotes_pair`
   - Change `get_daily_quotes` call (same name)

3. **ValuationService**
   - Import `QuoteServiceTrait`
   - Change method calls

4. **PerformanceService**
   - Import `QuoteServiceTrait`
   - Change method calls

5. **AlternativeAssetsService**
   - Import `QuoteServiceTrait`
   - Change `get_latest_quotes_for_symbols` -> `get_latest_quotes`

6. **AssetsService**
   - Import `QuoteServiceTrait`
   - Change method calls (same names)

### Phase 4: Update Commands and Listeners

1. Update `src-tauri/src/commands/asset.rs`
2. Update `src-tauri/src/commands/market_data.rs`
3. Update `src-tauri/src/listeners.rs`

### Phase 5: Update Storage Layer

1. Implement `QuoteStore` for SQLite repository
2. Implement `SyncStateStore` for SQLite repository
3. Implement `ProviderSettingsStore` for SQLite repository

### Phase 6: Delete Legacy Code

1. Delete `crates/core/src/market_data/` folder entirely
2. Update `crates/core/src/lib.rs` to remove market_data exports
3. Run `cargo check` and fix any remaining import errors

## Testing Strategy

### Unit Tests (service_tests.rs)

- [x] Quote CRUD operations
- [x] Date range queries
- [x] Latest quote pair (with/without previous)
- [x] Empty symbols handling
- [x] Missing symbol handling
- [x] Duplicate detection
- [x] Bulk upsert replace behavior
- [x] Delete quotes for asset

### Integration Tests (needed)

- [ ] Gap filling with real weekend dates
- [ ] Gap filling with holiday gaps
- [ ] Gap filling with no prior quotes (edge case)
- [ ] Sync operation with mock provider
- [ ] Provider settings change refreshes client

### Migration Verification

- [ ] Run existing holdings_valuation_service_tests
- [ ] Run existing net_worth_service_tests
- [ ] Verify portfolio page shows correct weekend values
- [ ] Verify net worth chart is continuous (no $0 dips)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing fill_missing_quotes | **HIGH** | Add to QuoteServiceTrait before migration |
| Method signature differences | Medium | Comprehensive mapping table above |
| Sync behavior changes | Medium | SyncResult struct provides detailed feedback |
| Provider settings refresh | Low | Already implemented in QuoteService |

## Files to Modify (Complete List)

### Create
- `crates/core/src/quotes/service_tests.rs` - DONE

### Modify
- `crates/core/src/quotes/service.rs` - Add fill_missing_quotes
- `crates/core/src/context/service_context.rs` - Use QuoteServiceTrait
- `src-tauri/src/context/providers.rs` - Create QuoteService
- `crates/core/src/portfolio/net_worth/net_worth_service.rs`
- `crates/core/src/portfolio/holdings/holdings_valuation_service.rs`
- `crates/core/src/portfolio/valuation/valuation_service.rs`
- `crates/core/src/portfolio/performance/performance_service.rs`
- `crates/core/src/portfolio/alternative_assets/alternative_assets_service.rs`
- `crates/core/src/assets/assets_service.rs`
- `src-tauri/src/commands/asset.rs`
- `src-tauri/src/commands/market_data.rs`
- `src-tauri/src/listeners.rs`
- `crates/storage-sqlite/src/market_data/repository.rs` - Implement new traits
- `crates/core/src/lib.rs` - Update exports

### Delete
- `crates/core/src/market_data/` - Entire folder

## Appendix: Return Type Changes

### sync_market_data / sync

Old: `Result<((), Vec<(String, String)>)>` - tuple with errors
New: `Result<SyncResult>` - structured result

```rust
pub struct SyncResult {
    pub synced_count: usize,
    pub failed_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<SyncError>,
    pub details: Vec<AssetSyncResult>,
}
```

Consumers can extract the same info but get more detail.

### get_market_data_providers_info / get_providers_info

Old: `Result<Vec<MarketDataProviderInfo>>`
New: `Result<Vec<ProviderInfo>>`

`ProviderInfo` is richer - includes `requires_api_key` and `has_api_key`.
