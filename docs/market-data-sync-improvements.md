# Market Data Sync System - Analysis & Improvement Plan

## Executive Summary

After comprehensive analysis of the market data sync system, I identified **4 key issues** that cause quote fetching failures and unreliable sync behavior. This document outlines each issue, its root cause, and the recommended fix.

---

## Issue 1: `get_quote_symbol_from_asset()` Returns None for Securities

### Problem
The function `get_quote_symbol_from_asset()` in `market_data_service.rs:41-66` only returns a value if:
1. The asset has `provider_overrides` with a symbol, OR
2. The asset is `AssetKind::Crypto`

For regular securities (stocks, ETFs) without custom `provider_overrides`, the function returns `None`.

### Impact
- Confusing logs showing `quote_symbol=None` for assets like AAPL
- While the code has a fallback at line 993 (`unwrap_or(req.symbol.as_str())`), the None propagates through `SymbolSyncPlan` causing confusion

### Root Cause
```rust
fn get_quote_symbol_from_asset(asset: &Asset) -> Option<String> {
    // Only checks provider_overrides and crypto
    // NO fallback to asset.symbol for securities
    None  // Returns None for regular securities
}
```

### Recommended Fix
```rust
fn get_quote_symbol_from_asset(asset: &Asset) -> Option<String> {
    // 1. Try provider_overrides first
    if let Some(override_symbol) = asset.provider_overrides.as_ref().and_then(|overrides| {
        // ... existing logic
    }) {
        return Some(override_symbol);
    }

    // 2. For CRYPTO assets, construct Yahoo-compatible symbol
    if asset.kind == AssetKind::Crypto && !asset.currency.is_empty() {
        return Some(format!("{}-{}", asset.symbol, asset.currency));
    }

    // 3. For FX_RATE assets, the symbol is already in Yahoo format via provider_overrides
    // If we get here for FX, return None and let the caller handle it
    if asset.kind == AssetKind::FxRate {
        return None;
    }

    // 4. For securities (stocks, ETFs, funds), use the ticker symbol directly
    // Yahoo Finance accepts standard tickers like AAPL, MSFT, etc.
    if !asset.symbol.is_empty() {
        return Some(asset.symbol.clone());
    }

    None
}
```

### Files to Modify
- `crates/core/src/market_data/market_data_service.rs` (lines 41-66)

---

## Issue 2: `is_active` Flag Based Only on Snapshots, Not Activities

### Problem
The quote sync state's `is_active` flag is determined by whether there's an open position in the latest snapshot. However:
- A user might add a NEW activity for an asset never held before
- The asset won't have a snapshot yet
- The system categorizes it as `RecentlyClosed` instead of `New` or `NeedsBackfill`

### Observed Behavior (from logs)
```
AAPL categorized as RecentlyClosed because is_active=false
But user just added a BUY activity - should be categorized as New
```

### Root Cause
The `determine_category()` function in `QuoteSyncState` only checks:
- `is_active` (from snapshots)
- Days since last activity

It doesn't distinguish between:
- Asset with activities but no quotes yet (NEW)
- Asset that was held and sold (RECENTLY_CLOSED)

### Recommended Fix

Add logic to distinguish new assets from closed positions:

```rust
impl QuoteSyncState {
    pub fn determine_category(&self, grace_period_days: i64) -> SyncCategory {
        let today = Utc::now().date_naive();

        // NEW: Asset with activities but no quotes yet
        if self.first_activity_date.is_some() && self.earliest_quote_date.is_none() {
            return SyncCategory::New;
        }

        // NEEDS_BACKFILL: Activities before earliest quote
        if let (Some(first_activity), Some(earliest_quote)) =
            (self.first_activity_date, self.earliest_quote_date)
        {
            if first_activity < earliest_quote - Duration::days(QUOTE_HISTORY_BUFFER_DAYS) {
                return SyncCategory::NeedsBackfill;
            }
        }

        // ACTIVE: Currently held position
        if self.is_active {
            return SyncCategory::Active;
        }

        // RECENTLY_CLOSED: Sold within grace period
        if let Some(last_activity) = self.last_activity_date {
            let days_since = (today - last_activity).num_days();
            if days_since <= grace_period_days {
                return SyncCategory::RecentlyClosed;
            }
        }

        SyncCategory::Closed
    }
}
```

### Files to Modify
- `crates/core/src/market_data/quote_sync_state_model.rs`

---

## Issue 3: FX Pair Direction Inconsistency

### Problem
When registering currency pairs:
```rust
// In activities_service.rs
.register_currency_pair(account.currency.as_str(), activity.currency.as_str())
```

If account is CAD and activity is USD, this creates `CAD/USD` (rate to convert CAD→USD).

But for portfolio valuation, we need to convert USD assets to CAD account currency, which requires `USD/CAD` rate.

### Current Workaround
The `FxService::load_latest_exchange_rate()` tries both directions:
```rust
// If CAD/USD not found, try inverse USD/CAD and invert the rate
```

### Problem with Workaround
1. Extra database lookups
2. Potential data inconsistency if only one direction is populated
3. Confusing data model - users see `CAD/USD` in settings but need `USD/CAD` for conversions

### Recommended Fix

**Option A (Minimal Change)**: Document the convention and ensure both directions are synced
- When creating `CAD/USD`, also ensure inverse lookups work correctly
- No code changes, just ensure the inverse lookup is robust

**Option B (Convention Change)**: Always store in "source→target" format where:
- `source` = the currency being converted FROM (asset currency)
- `target` = the currency being converted TO (account/base currency)

```rust
// In activities_service.rs - change the order
// FROM asset/activity currency TO account currency
.register_currency_pair(activity.currency.as_str(), account.currency.as_str())
```

**Recommendation**: Option A is safer as it avoids breaking existing data. The inverse lookup already works.

### Files to Potentially Modify (if Option B)
- `crates/core/src/activities/activities_service.rs`
- `crates/core/src/settings/settings_service.rs`

---

## Issue 4: Single-Day Fetch Range Fragility

### Problem
When syncing, if `start_date == end_date == today` and Yahoo has no data for today (e.g., market hasn't opened, weekend, holiday), the fetch returns empty results.

### Observed Behavior
```
start=2026-01-04, end=2026-01-04 (both today)
Yahoo returns 0 quotes
Sync "succeeds" with 0 quotes
Asset has no price data
```

### Recommended Fix

Add a minimum lookback window:

```rust
const MIN_SYNC_LOOKBACK_DAYS: i64 = 3;

// When determining start_date
let start_date = calculated_start_date
    .max(today - Duration::days(MIN_SYNC_LOOKBACK_DAYS));
```

Or skip sync if start == end == today:

```rust
// In get_sync_plan()
if start_date >= today && !state.has_quotes() {
    // Use a default lookback for new assets
    start_date = today - Duration::days(DEFAULT_HISTORY_DAYS);
}
```

### Files to Modify
- `crates/core/src/market_data/market_data_service.rs` (in `get_sync_plan()`)

---

## Implementation Priority

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | Issue 2: is_active logic | High - breaks new asset sync | Medium |
| 2 | Issue 4: Single-day fetch | High - common failure case | Low |
| 3 | Issue 1: quote_symbol None | Medium - confusing, has fallback | Low |
| 4 | Issue 3: FX direction | Low - workaround exists | Medium |

---

## Test Cases to Add

### Unit Tests

1. **`get_quote_symbol_from_asset()` tests**
   ```rust
   #[test]
   fn test_quote_symbol_security_without_overrides() {
       let asset = Asset { kind: AssetKind::Security, symbol: "AAPL".into(), .. };
       assert_eq!(get_quote_symbol_from_asset(&asset), Some("AAPL".into()));
   }

   #[test]
   fn test_quote_symbol_crypto() {
       let asset = Asset { kind: AssetKind::Crypto, symbol: "BTC".into(), currency: "USD".into(), .. };
       assert_eq!(get_quote_symbol_from_asset(&asset), Some("BTC-USD".into()));
   }

   #[test]
   fn test_quote_symbol_fx_with_override() {
       let overrides = json!({"YAHOO": {"type": "fx_symbol", "symbol": "EURCAD=X"}});
       let asset = Asset { kind: AssetKind::FxRate, provider_overrides: Some(overrides), .. };
       assert_eq!(get_quote_symbol_from_asset(&asset), Some("EURCAD=X".into()));
   }
   ```

2. **`QuoteSyncState::determine_category()` tests**
   ```rust
   #[test]
   fn test_new_asset_no_quotes() {
       let state = QuoteSyncState {
           first_activity_date: Some(today),
           earliest_quote_date: None,
           is_active: false,
           ..
       };
       assert_eq!(state.determine_category(30), SyncCategory::New);
   }

   #[test]
   fn test_recently_closed_within_grace() {
       let state = QuoteSyncState {
           last_activity_date: Some(today - Duration::days(5)),
           is_active: false,
           ..
       };
       assert_eq!(state.determine_category(30), SyncCategory::RecentlyClosed);
   }
   ```

3. **Sync date range tests**
   ```rust
   #[test]
   fn test_sync_plan_minimum_lookback() {
       // New asset with activity today should still have lookback
       let plan = service.get_sync_plan_for_symbol("AAPL");
       assert!(plan.start_date <= today - Duration::days(MIN_SYNC_LOOKBACK_DAYS));
   }
   ```

### Integration Tests

1. **End-to-end new asset sync**
   - Create account
   - Add BUY activity for new asset
   - Trigger sync
   - Verify quotes are fetched

2. **FX rate sync for new currency**
   - Create EUR account (base currency CAD)
   - Verify EUR/CAD or CAD/EUR FX asset created
   - Trigger sync
   - Verify FX quotes fetched and conversion works

---

## Conclusion

The market data sync system has solid foundations but needs refinements in:
1. Symbol resolution for different asset types
2. Category determination for new vs closed assets
3. Resilient date range handling

Implementing these fixes will significantly improve reliability and reduce confusion from cryptic error messages.
