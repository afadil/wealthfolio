# FX Currency Pair Registration - Design Review

## Overview

This document analyzes all places where FX (foreign exchange) currency pairs are registered in Wealthfolio, evaluates the current design, and proposes improvements.

---

## Currency Levels in Wealthfolio

The application handles currencies at **four distinct levels**:

| Level | Description | Example |
|-------|-------------|---------|
| **Base Currency** | Primary currency for portfolio reporting. All aggregated reports shown in this currency. | CAD |
| **Account Currency** | Currency in which an account is denominated. | USD brokerage, EUR bank |
| **Asset Currency** | Currency in which an asset is traded/valued. | JPY for Tokyo Stock Exchange stocks |
| **Activity Currency** | Currency of a specific transaction. | Buying USD stocks from CAD account |

### Example Scenario
```
Base Currency:     CAD (Canadian Dollar)
Account:           US Brokerage (USD)
Asset:             Toyota (TYO:7203) - trades in JPY
Activity:          Buy Toyota, paid in USD

Required FX Conversions:
├── Account → Base:    USD → CAD (for cash balance reporting)
├── Asset → Base:      JPY → CAD (for holding valuation)
├── Activity → Account: (same as account in this case)
└── Asset → Account:   JPY → USD (for cost basis in account currency)
```

---

## Current State: FX Registration Points

### 1. Account Creation (`AccountService::create_account`)
**File:** `crates/core/src/accounts/accounts_service.rs:44-50`

```rust
if new_account.currency != base_currency {
    self.fx_service
        .register_currency_pair(
            new_account.currency.as_str(),
            base_currency.as_str(),
        )
        .await?;
}
```

**Trigger:** When creating an account with currency different from base currency
**FX Pair:** `{account_currency}{base_currency}=X` (e.g., `USDCAD=X`)

---

### 2. Activity Creation/Update (`ActivityService`)
**File:** `crates/core/src/activities/activities_service.rs:69-95, 132-158`

```rust
// FX pair for activity currency ≠ account currency
if activity.currency != account.currency {
    self.fx_service
        .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
        .await?;
}

// FX pair for asset currency ≠ account currency
if asset.currency != account.currency && asset.currency != activity.currency {
    self.fx_service
        .register_currency_pair(account.currency.as_str(), asset.currency.as_str())
        .await?;
}
```

**Trigger:** Creating or updating an activity
**FX Pairs:**
- `{account_currency}{activity_currency}=X`
- `{account_currency}{asset_currency}=X`

---

### 3. Activity Import (`ActivityService::check_activities_import`)
**File:** `crates/core/src/activities/activities_service.rs:348-364`

```rust
if activity.currency != account.currency {
    self.fx_service
        .register_currency_pair(
            account.currency.as_str(),
            activity.currency.as_str(),
        )
        .await
}
```

**Trigger:** Importing activities from CSV/file
**FX Pair:** `{account_currency}{activity_currency}=X`

---

### 4. Base Currency Change (`SettingsService::update_base_currency`)
**File:** `crates/core/src/settings/settings_service.rs:61-88`

```rust
let all_currencies = self.settings_repository
    .get_distinct_currencies_excluding_base(new_base_currency)?;

for currency_code in all_currencies {
    self.fx_service
        .register_currency_pair(currency_code.as_str(), new_base_currency)
        .await;
}
```

**Trigger:** User changes base currency in settings
**FX Pairs:** `{each_existing_currency}{new_base_currency}=X`

---

### 5. Event Listeners (Legacy/Redundant)
**File:** `src-tauri/src/listeners.rs:237-250, 524-530`

```rust
// Account resource change
let symbol = format!("{}{}=X", currency, base_currency);
payload_builder = payload_builder.symbols(Some(vec![symbol]));

// Activity resource change
symbols.insert(format!("{}{}=X", account.currency, currency));
```

**Trigger:** Resource change events (account created, activity created)
**Purpose:** Adds FX symbols to market data sync payload
**Note:** This doesn't call `register_currency_pair` - just adds to sync list

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FX Registration Entry Points                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Account    │  │   Activity   │  │   Activity   │  │   Settings  │ │
│  │   Creation   │  │   Create/    │  │   Import     │  │   (Base     │ │
│  │              │  │   Update     │  │              │  │   Currency) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │                 │        │
│         ▼                 ▼                 ▼                 ▼        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     FxService.register_currency_pair()           │  │
│  │                                                                  │  │
│  │  - Normalizes currency codes                                     │  │
│  │  - Checks if rate already exists                                 │  │
│  │  - Creates FX asset (e.g., USDCAD=X) if not exists              │  │
│  │  - Sets data_source = "YAHOO" for auto-sync                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     FxRepository.create_fx_asset()               │  │
│  │                                                                  │  │
│  │  - INSERT INTO assets (id, symbol, name, asset_type='Currency') │  │
│  │  - data_source = 'YAHOO' (for automatic quote fetching)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ▼ (Separate Process)

┌─────────────────────────────────────────────────────────────────────────┐
│                      Market Data Sync (Periodic)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  - Fetches all assets with data_source != 'MANUAL'                      │
│  - Downloads quotes from Yahoo Finance                                  │
│  - Stores in quotes table                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Problems with Current Design

### 1. **Missing Base Currency Registration**
The `AccountService` registers `{account_currency}{base_currency}` but NOT `{base_currency}{account_currency}`. The valuation service may need the inverse rate.

**Example:** Account is USD, base is CAD
- Registered: `USDCAD=X` ✓
- May need: `CADUSD=X` (for inverse lookups) ✗

### 2. **No Registration for Asset Currency → Base Currency**
When an asset has a different currency than both the account and base currency, no direct FX pair to base is registered.

**Example:**
- Base: CAD
- Account: USD
- Asset: EUR
- Registered: `USDEUR=X` (account→asset)
- Missing: `EURCAD=X` (asset→base for portfolio totals)

### 3. **Duplicate Code**
The same FX registration logic is repeated in:
- `prepare_new_activity()`
- `prepare_update_activity()`
- `check_activities_import()`

### 4. **Event Listener Redundancy**
`listeners.rs` adds FX symbols to sync payload but doesn't call `register_currency_pair`. This is:
- Redundant (services already register)
- Inconsistent (different mechanism)
- Fragile (event might be missed)

### 5. **No Centralized FX Requirement Calculation**
Each service independently determines what FX pairs are needed. There's no single place that understands all currency relationships.

---

## Proposed Better Design

### Option A: Centralized FX Manager (Recommended)

Create a dedicated `FxRequirementService` that calculates ALL required FX pairs based on current data state, considering all four currency levels:

```rust
pub trait FxRequirementService {
    /// Calculate all FX pairs needed based on accounts, assets, activities, and base currency
    async fn ensure_required_fx_pairs(&self) -> Result<Vec<String>>;

    /// Called after any currency-affecting change
    async fn refresh_fx_requirements(&self) -> Result<()>;
}

impl FxRequirementService {
    async fn ensure_required_fx_pairs(&self) -> Result<Vec<String>> {
        let base_currency = self.settings.get_base_currency()?;
        let mut required_pairs: HashSet<(String, String)> = HashSet::new();

        // ═══════════════════════════════════════════════════════════════════
        // Level 1: Account Currency → Base Currency
        // Needed for: Cash balance reporting in base currency
        // ═══════════════════════════════════════════════════════════════════
        for account in self.accounts.get_all()? {
            if account.currency != base_currency {
                required_pairs.insert((account.currency.clone(), base_currency.clone()));
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Level 2: Asset Currency → Base Currency
        // Needed for: Holding valuation in base currency
        // ═══════════════════════════════════════════════════════════════════
        for asset in self.assets.get_all_with_holdings()? {
            if asset.currency != base_currency {
                required_pairs.insert((asset.currency.clone(), base_currency.clone()));
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Level 3: Activity Currency → Account Currency
        // Needed for: Recording activity impact on account balance
        // ═══════════════════════════════════════════════════════════════════
        let distinct_activity_currencies = self.activities.get_distinct_currencies()?;
        for (activity_currency, account_id) in distinct_activity_currencies {
            let account = self.accounts.get_by_id(&account_id)?;
            if activity_currency != account.currency {
                required_pairs.insert((activity_currency, account.currency.clone()));
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Level 4: Asset Currency → Account Currency
        // Needed for: Cost basis calculation in account currency
        // ═══════════════════════════════════════════════════════════════════
        for holding in self.holdings.get_all()? {
            let asset = self.assets.get_by_id(&holding.asset_id)?;
            let account = self.accounts.get_by_id(&holding.account_id)?;
            if asset.currency != account.currency {
                required_pairs.insert((asset.currency.clone(), account.currency.clone()));
            }
        }

        // Register all missing pairs
        let mut registered = Vec::new();
        for (from, to) in required_pairs {
            self.fx_service.register_currency_pair(&from, &to).await?;
            registered.push(format!("{}{}=X", from, to));
        }

        Ok(registered)
    }
}
```

### Required FX Pairs Matrix

Given the four currency levels, here are ALL the FX pairs that may be needed:

| From | To | Purpose | When Needed |
|------|-----|---------|-------------|
| Account | Base | Cash balance in portfolio reports | Always (if different) |
| Asset | Base | Holding value in portfolio reports | Always (if different) |
| Activity | Account | Record transaction in account | When activity currency ≠ account |
| Asset | Account | Cost basis in account currency | When asset currency ≠ account |
| Activity | Base | Activity reporting in base | Optional (can chain via account) |

### Visualization

```
                          ┌─────────────────┐
                          │  BASE CURRENCY  │
                          │     (CAD)       │
                          └────────▲────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────┴─────────┐ ┌───────┴────────┐ ┌────────┴────────┐
    │ ACCOUNT CURRENCY  │ │ ASSET CURRENCY │ │ (via Account)   │
    │      (USD)        │ │     (JPY)      │ │                 │
    └─────────▲─────────┘ └───────▲────────┘ └─────────────────┘
              │                   │
              │         ┌─────────┴─────────┐
              │         │                   │
    ┌─────────┴─────────┴───────┐           │
    │   ACTIVITY CURRENCY       │           │
    │        (GBP)              │───────────┘
    └───────────────────────────┘

Required FX Pairs for this example:
  • USDCAD=X  (Account → Base)
  • JPYCAD=X  (Asset → Base)
  • GBPUSD=X  (Activity → Account)
  • JPYUSD=X  (Asset → Account, for cost basis)
```

**Benefits:**
- Single source of truth for FX requirements
- Covers all four currency levels
- Can be called on startup, after imports, after base currency change
- Easy to audit and test
- No duplicate registration logic

---

### Option B: Lazy Registration with Fallback

Instead of registering FX pairs proactively, register them on-demand when needed:

```rust
impl FxService {
    /// Get rate, registering pair if missing
    async fn get_or_register_rate(&self, from: &str, to: &str, date: NaiveDate) -> Result<Decimal> {
        match self.get_exchange_rate_for_date(from, to, date) {
            Ok(rate) => Ok(rate),
            Err(_) => {
                // Register and fetch
                self.register_currency_pair(from, to).await?;
                self.trigger_quote_sync(from, to).await?;
                self.get_exchange_rate_for_date(from, to, date)
            }
        }
    }
}
```

**Benefits:**
- Only registers what's actually needed
- Self-healing (missing pairs get created)
- Simpler registration points

**Drawbacks:**
- First calculation might fail/delay while rates are fetched
- Need to handle async quote fetching

---

### Option C: Database Trigger/Materialized View

Use database constraints to automatically maintain FX pairs:

```sql
-- Trigger on account insert
CREATE TRIGGER ensure_account_fx_pair
AFTER INSERT ON accounts
BEGIN
    INSERT OR IGNORE INTO assets (id, symbol, asset_type, data_source)
    SELECT
        NEW.currency || (SELECT value FROM settings WHERE key = 'base_currency') || '=X',
        NEW.currency || (SELECT value FROM settings WHERE key = 'base_currency') || '=X',
        'Currency',
        'YAHOO'
    WHERE NEW.currency != (SELECT value FROM settings WHERE key = 'base_currency');
END;
```

**Benefits:**
- Guaranteed consistency at DB level
- No application code needed

**Drawbacks:**
- Logic split between app and DB
- Harder to test
- SQLite trigger limitations

---

## Recommended Implementation Plan

### Phase 1: Clean Up (Short-term)
1. Remove FX symbol logic from `listeners.rs` (redundant with service layer)
2. Extract common FX registration logic into a helper method in `ActivityService`
3. Add asset_currency → base_currency registration in activity creation

### Phase 2: Centralize (Medium-term)
1. Create `FxRequirementService` with `ensure_required_fx_pairs()`
2. Call it:
   - On application startup
   - After base currency change
   - After bulk import
3. Remove individual registration calls from services (keep as backup)

### Phase 3: Optimize (Long-term)
1. Add `get_or_register_rate()` for lazy registration
2. Add background job to clean up unused FX pairs
3. Consider caching FX requirements to avoid recalculation

---

## Summary

### Current Coverage by Currency Level

| Currency Level | Current Registration | Gap |
|----------------|---------------------|-----|
| **Account → Base** | ✅ `AccountService::create_account` | None |
| **Asset → Base** | ❌ Not registered | **MISSING** - causes valuation failures |
| **Activity → Account** | ✅ `ActivityService` (create/update/import) | None |
| **Asset → Account** | ✅ `ActivityService` | None |

### Registration Points Summary

| Location | What it Registers | Issue | Fix |
|----------|------------------|-------|-----|
| AccountService | `{account}→{base}` | ✓ Works | Keep |
| ActivityService (3 places) | `{account}→{activity}`, `{account}→{asset}` | Missing `{asset}→{base}` | Add asset→base |
| SettingsService | `{all_currencies}→{new_base}` | ✓ Works | Keep |
| listeners.rs | Adds to sync payload | Redundant with services | Remove |
| (Missing) | No startup validation | May have gaps | Add FxRequirementService |

### Root Cause of Alpaca Issue

The Alpaca account issue was caused by:
1. Account created with USD currency, base is CAD
2. `AccountService` should have registered `USDCAD=X`
3. But `SyncService` bypassed `AccountService` and called repository directly
4. No FX rate → valuation skipped → $0.00 displayed

### Recommended Implementation

1. **Short-term (already done):** Make `SyncService` use `AccountService`
2. **Medium-term:** Add `FxRequirementService` for startup validation
3. **Long-term:** Add `{asset}→{base}` registration for complete coverage

The biggest gap is the lack of a **centralized FX requirement calculation** that can verify all needed pairs exist across all four currency levels. This would prevent issues like the Alpaca account problem where a missing FX rate blocked valuations.
