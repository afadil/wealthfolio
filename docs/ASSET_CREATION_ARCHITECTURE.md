# Asset Creation Architecture & Design Analysis

## Executive Summary

This document provides a comprehensive analysis of all asset creation paths in Wealthfolio. Assets are central to the portfolio tracking system, and they can be created through multiple entry points. Understanding these paths is crucial for maintaining data consistency and identifying potential issues.

---

## Table of Contents

1. [Asset Model Overview](#1-asset-model-overview)
2. [Asset ID Generation](#2-asset-id-generation)
3. [Asset Creation Paths](#3-asset-creation-paths)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Issues and Bugs](#5-issues-and-bugs)
6. [Recommendations](#6-recommendations)

---

## 1. Asset Model Overview

### 1.1 Asset Kinds (13 types)

```
Investment Assets (included in TWR/IRR):
- Security     - Stocks, ETFs, bonds, mutual funds
- Crypto       - Cryptocurrencies
- Option       - Stock options
- Commodity    - Commodities (futures)
- PrivateEquity - Private equity investments

Alternative Assets (excluded from investment returns, included in net worth):
- Property        - Real estate
- Vehicle         - Cars, boats, RVs
- Collectible     - Art, wine, watches
- PhysicalPrecious - Physical gold/silver
- Liability       - Debts (mortgages, loans)
- Other           - Catch-all category

System Assets:
- Cash    - Cash balances (per currency)
- FxRate  - Currency exchange rate pairs
```

### 1.2 Pricing Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `MARKET` | Prices fetched from market data providers | Stocks, ETFs, crypto |
| `MANUAL` | User enters valuations as quotes | Alternative assets, custom assets |
| `NONE` | No price tracking needed | Cash assets |
| `DERIVED` | Price calculated from other data | FX rates (inverse) |

### 1.3 Canonical Asset ID Format

All assets use typed prefix format: `{TYPE}:{symbol}:{qualifier}`

| Asset Kind | Prefix | Format | Example |
|------------|--------|--------|---------|
| Security | `SEC` | `SEC:{symbol}:{mic}` | `SEC:AAPL:XNAS` |
| Crypto | `CRYPTO` | `CRYPTO:{symbol}:{quote}` | `CRYPTO:BTC:USD` |
| FX Rate | `FX` | `FX:{base}:{quote}` | `FX:EUR:USD` |
| Cash | `CASH` | `CASH:{currency}` | `CASH:CAD` |
| Option | `OPT` | `OPT:{symbol}:{mic}` | `OPT:AAPL240119C00150000:XNAS` |
| Commodity | `CMDTY` | `CMDTY:{symbol}` | `CMDTY:GC` |
| Private Equity | `PEQ` | `PEQ:{random}` | `PEQ:a1b2c3d4` |
| Property | `PROP` | `PROP:{random}` | `PROP:a1b2c3d4` |
| Vehicle | `VEH` | `VEH:{random}` | `VEH:x9y8z7w6` |
| Collectible | `COLL` | `COLL:{random}` | `COLL:m3n4o5p6` |
| Precious Metal | `PREC` | `PREC:{random}` | `PREC:g1h2i3j4` |
| Liability | `LIAB` | `LIAB:{random}` | `LIAB:q7r8s9t0` |
| Other | `ALT` | `ALT:{random}` | `ALT:u1v2w3x4` |

---

## 2. Asset ID Generation

### 2.1 Core Functions

**File:** `crates/core/src/assets/asset_id.rs`

```rust
// Generate canonical ID for market assets
canonical_asset_id(kind, symbol, exchange_mic, currency) -> String

// Generate random ID for alternative assets
generate_asset_id(kind) -> String  // e.g., "PROP:a1b2c3d4"

// Parse existing ID
parse_canonical_asset_id(id) -> Option<ParsedAssetId>

// Infer kind from ID prefix
kind_from_asset_id(id) -> Option<AssetKind>
```

### 2.2 ID Generation Rules

1. **Securities**: `SEC:{SYMBOL}:{MIC}` - MIC defaults to "UNKNOWN" if not provided
2. **Crypto**: `CRYPTO:{BASE}:{QUOTE}` - Extracts base from pair symbols like "BTC-USD"
3. **Cash**: `CASH:{CURRENCY}` - Currency code only
4. **FX**: `FX:{BASE}:{QUOTE}` - Currency pair
5. **Alternative**: `{PREFIX}:{RANDOM_8}` - 8-char alphanumeric suffix

---

## 3. Asset Creation Paths

### 3.1 Path Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ASSET CREATION ENTRY POINTS                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Activity   │  │   CSV Bulk   │  │   Broker    │  │  Alternative │    │
│  │  (Manual)    │  │   Import     │  │    Sync     │  │    Assets    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                  │            │
│         ▼                 ▼                 ▼                  ▼            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     ActivityService                                   │  │
│  │  - prepare_new_activity()                                            │  │
│  │  - resolve_asset_id()                                                │  │
│  │  - infer_asset_kind()                                                │  │
│  └───────────────────────────┬──────────────────────────────────────────┘  │
│                              │                                              │
│         ┌────────────────────┼────────────────────┐                        │
│         ▼                    ▼                    ▼                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐                  │
│  │ AssetService │  │   FxService      │  │ AlternativeAsset│               │
│  │              │  │                  │  │    Service    │                  │
│  │ get_or_create│  │ register_currency│  │               │                  │
│  │ _minimal_    │  │ _pair()          │  │ create_       │                  │
│  │ asset()      │  │                  │  │ alternative_  │                  │
│  │              │  │ create_fx_asset()│  │ asset()       │                  │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘                  │
│         │                   │                   │                          │
│         └───────────────────┴───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                    ┌──────────────────┐                                    │
│                    │ AssetRepository  │                                    │
│                    │    .create()     │                                    │
│                    └────────┬─────────┘                                    │
│                             │                                              │
│                             ▼                                              │
│                    ┌──────────────────┐                                    │
│                    │   SQLite DB      │                                    │
│                    │   (assets table) │                                    │
│                    └──────────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Path 1: Single Activity Creation (Manual Entry)

**Flow:** UI Form → Tauri Command → ActivityService → AssetService → Repository

**Files:**
- Frontend: `src-front/pages/activity/components/activity-form-v2.tsx`
- Hook: `src-front/pages/activity/hooks/use-activity-mutations.ts`
- Command: `src-tauri/src/commands/activity.rs::create_activity()`
- Service: `crates/core/src/activities/activities_service.rs::create_activity()`
- Asset: `crates/core/src/assets/assets_service.rs::get_or_create_minimal_asset()`

**Key Steps:**
1. Frontend extracts `symbol`, `exchangeMic`, `pricingMode`, `assetMetadata` from form
2. Builds `asset` object with symbol, not asset_id (backend generates canonical ID)
3. `ActivityService::prepare_new_activity()`:
   - Calls `resolve_asset_id(symbol, exchange_mic, kind_hint, activity_type, currency)`
   - If symbol provided: generates canonical ID via `canonical_asset_id()`
   - If cash activity without symbol: generates `CASH:{currency}`
4. `AssetService::get_or_create_minimal_asset()`:
   - Checks if asset exists by canonical ID
   - If not exists: creates minimal asset with inferred properties
   - Sets `pricing_mode` from hint or defaults based on kind
5. If `pricingMode=MANUAL`: creates manual quote from activity's unit_price
6. Registers FX pairs if activity currency differs from account currency

### 3.3 Path 2: Bulk CSV Import

**Flow:** CSV → Parser → Validation → ActivityService → AssetService → Repository

**Files:**
- Frontend: `src-front/pages/activity/import/activity-import-page-v2.tsx`
- Service: `crates/core/src/activities/activities_service.rs::import_activities()`
- Parser: `crates/core/src/activities/csv_parser.rs`

**Key Steps:**
1. User uploads CSV, maps columns
2. `ActivityService::check_activities_import()`:
   - Batch resolves symbols to exchange MICs via `resolve_symbols_batch()`
   - For each activity:
     - Infers kind from symbol pattern
     - Generates canonical asset ID
     - Creates minimal asset (if `dry_run=false`)
     - Validates currency codes
3. `ActivityService::import_activities()`:
   - Calls `check_activities_import(dry_run=false)` to create assets
   - Bulk upserts activities via `activity_repository.create_activities()`
   - Links transfer pairs by matching TRANSFER_IN/OUT on date+amount

**Symbol Resolution:**
```rust
async fn resolve_symbols_batch(symbols, currency) -> HashMap<String, Option<String>> {
    // 1. Check existing assets in DB (case-insensitive by symbol)
    // 2. For missing: query quote_service.search_symbol_with_currency()
    // Returns: symbol -> Option<exchange_mic>
}
```

### 3.4 Path 3: Broker Sync (SnapTrade)

**Flow:** Broker API → BrokerSyncService → Direct DB Insert (bypasses ActivityService)

**Files:**
- Service: `crates/connect/src/broker/service.rs::upsert_account_activities()`
- Orchestrator: `crates/connect/src/broker/orchestrator.rs`

**Key Differences from Other Paths:**
1. **Direct DB writes**: Bypasses `ActivityService` and `AssetService`
2. **Bulk processing**: Builds `AssetDB` and `ActivityDB` rows directly
3. **Asset creation inline**: Creates assets as side effect of activity sync

**Steps:**
1. Receives `AccountUniversalActivity[]` from broker API
2. For each activity:
   - Extracts symbol, currency, exchange_mic from broker data
   - Determines `AssetKind` via `broker_symbol_type_to_kind()`
   - Generates canonical ID via `canonical_asset_id()`
   - Builds `AssetDB` row (if not seen)
   - Builds `ActivityDB` row with idempotency key
3. Executes raw SQL inserts:
   - Assets: `INSERT ... ON CONFLICT DO NOTHING`
   - Activities: `INSERT ... ON CONFLICT DO UPDATE` (respects `is_user_modified`)
4. Emits `DomainEvent::ActivitiesChanged` and `DomainEvent::assets_created`

**Holdings Mode (Alternative):**
- `save_broker_holdings()`: Creates snapshot instead of activities
- Still creates assets directly via SQL

### 3.5 Path 4: Activity Data Grid (Bulk Edit)

**Flow:** Grid Changes → saveActivitiesMutation → Tauri Command → ActivityService

**Files:**
- Frontend: `src-front/pages/activity/components/activity-data-grid/`
- Hook: `use-save-activities.ts`
- Service: `crates/core/src/activities/activities_service.rs::bulk_mutate_activities()`

**Key Steps:**
1. Grid tracks creates/updates/deletes
2. For each create/update: same asset resolution as single activity
3. Batch symbol resolution for creates without exchange_mic
4. Processes in single transaction via `activity_repository.bulk_mutate_activities()`

### 3.6 Path 5: Bulk Holdings Modal (Quick Portfolio Entry)

**Flow:** Holdings Form → TRANSFER_IN Activities → Activity Data Grid Path

**Files:**
- Frontend: `src-front/pages/activity/components/forms/bulk-holdings-modal.tsx`

**Key Steps:**
1. User enters ticker + shares + average cost
2. Symbol search resolves exchange_mic and pricing_mode
3. Converts each holding to `ActivityCreate` with `type=TRANSFER_IN`
4. Uses same `saveActivitiesMutation` as data grid

### 3.7 Path 6: Alternative Assets

**Flow:** Modal → AlternativeAssetService → AssetRepository + QuoteService

**Files:**
- Frontend: `src-front/features/alternative-assets/components/`
- Service: `crates/core/src/assets/alternative_assets_service.rs`
- Repository: `crates/storage-sqlite/src/assets/alternative_repository.rs`

**Key Differences:**
- **No accounts or activities**: Just asset + valuation quotes
- **Random IDs**: `PROP:a1b2c3d4` (8-char alphanumeric suffix)
- **Always MANUAL pricing**: User enters valuations

**Steps:**
1. Validates kind is alternative (Property/Vehicle/Collectible/PhysicalPrecious/Liability/Other)
2. Generates unique ID via `generate_asset_id(kind)`
3. Builds metadata with purchase info, linked_asset_id (for liabilities)
4. Creates asset record
5. Creates purchase quote (if purchase_price + purchase_date provided)
6. Creates current valuation quote

### 3.8 Path 7: FX Rate Assets

**Flow:** Activity with foreign currency → FxService → FxRepository

**Files:**
- Service: `crates/core/src/fx/fx_service.rs::register_currency_pair()`
- Repository: `crates/storage-sqlite/src/fx/repository.rs::create_fx_asset()`

**Trigger Points:**
1. Activity currency != account currency
2. Asset currency != account currency (and != activity currency)

**Steps:**
1. `FxService::register_currency_pair(from, to)`:
   - Normalizes currency codes (GBp → GBP)
   - Checks if rate already exists
   - If not: calls `repository.create_fx_asset()`
2. `FxRepository::create_fx_asset()`:
   - Generates canonical ID: `FX:{BASE}:{QUOTE}`
   - Sets `provider_overrides` with Yahoo/AlphaVantage symbol format
   - Inserts with `ON CONFLICT DO UPDATE`

### 3.9 Path 8: Cash Assets

**Flow:** Cash activity or account creation → AssetService → Repository

**Files:**
- Service: `crates/core/src/assets/assets_service.rs::ensure_cash_asset()`

**Trigger Points:**
1. Cash activity (DEPOSIT, WITHDRAWAL, etc.) without symbol
2. `get_or_create_minimal_asset()` when kind is Cash

**Steps:**
1. `AssetService::ensure_cash_asset(currency)`:
   - Generates ID: `CASH:{CURRENCY}`
   - Checks if exists
   - If not: creates with `NewAsset::new_cash_asset()`
   - Assigns taxonomy categories: `CASH_BANK_DEPOSITS`, `CASH` instrument type

---

## 4. Data Flow Diagrams

### 4.1 Asset Creation Decision Tree

```
                        ┌─────────────────────┐
                        │   Asset Creation    │
                        │      Trigger        │
                        └──────────┬──────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       ┌────────────┐       ┌────────────┐       ┌────────────┐
       │  Activity  │       │   Broker   │       │Alternative │
       │   Based    │       │    Sync    │       │   Asset    │
       └─────┬──────┘       └─────┬──────┘       └─────┬──────┘
             │                    │                    │
             ▼                    ▼                    ▼
       ┌────────────┐       ┌────────────┐       ┌────────────┐
       │Has symbol? │       │Has symbol? │       │Generate ID │
       └─────┬──────┘       └─────┬──────┘       │PROP:xxxx   │
             │                    │              └─────┬──────┘
        ┌────┴────┐          ┌────┴────┐               │
        │         │          │         │               │
       Yes       No         Yes       No               │
        │         │          │         │               │
        ▼         ▼          ▼         ▼               │
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
   │Infer    │ │Cash     │ │Generate │ │CASH or  │    │
   │kind     │ │activity?│ │canonical│ │UNKNOWN  │    │
   │from     │ └────┬────┘ │ID       │ │placeholder    │
   │symbol   │      │      └────┬────┘ └─────────┘    │
   └────┬────┘ ┌────┴────┐      │                     │
        │     Yes       No      │                     │
        │      │         │      │                     │
        │      ▼         ▼      │                     │
        │  ┌─────────┐ ┌─────────┐                    │
        │  │CASH:USD │ │SEC:UNK: │                    │
        │  └────┬────┘ │UNKNOWN  │                    │
        │       │      └────┬────┘                    │
        │       │           │                         │
        └───────┴───────────┴─────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │get_or_create_   │
                   │minimal_asset()  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Asset Record   │
                   │    Created      │
                   └─────────────────┘
```

### 4.2 Asset Kind Inference Logic

```rust
fn infer_asset_kind(symbol, exchange_mic, hint) -> AssetKind {
    // 1. Explicit hint from user/API
    if hint.is_some() { return parse_hint(hint); }

    // 2. Exchange MIC present → Security
    if exchange_mic.is_some() { return Security; }

    // 3. Common crypto symbols
    if symbol in ["BTC", "ETH", "XRP", ...] { return Crypto; }

    // 4. Crypto pair pattern (e.g., "BTC-USD")
    if symbol matches "{BASE}-{QUOTE}" { return Crypto; }

    // 5. Default: Security (enrichment will correct)
    return Security;
}
```

---

## 5. Issues and Bugs

### 5.1 Critical Issues

#### Issue 1: Broker Sync Bypasses Service Layer
**Location:** `crates/connect/src/broker/service.rs:289-847`

**Problem:** Broker sync writes directly to the database, bypassing `AssetService`. This means:
- No domain events for asset creation (only `DomainEvent::assets_created` after bulk insert)
- No taxonomy assignment for cash assets
- No consistent validation

**Impact:** Assets created via broker sync may have inconsistent metadata compared to other paths.

**Code:**
```rust
// Broker sync creates assets directly
let asset_db = AssetDB {
    id: asset_id.clone(),
    symbol,
    name: ...,
    // ... builds DB model directly
};
diesel::insert_into(schema::assets::table)
    .values(&asset_db)
    .on_conflict(schema::assets::id)
    .do_nothing()  // Doesn't update existing assets
    .execute(conn)
```

**Recommendation:** Route through `AssetService::get_or_create_minimal_asset()` or create a bulk version.

---

#### Issue 2: Inconsistent Exchange MIC Handling for Securities Without MIC
**Location:** `crates/core/src/assets/asset_id.rs:297-302`

**Problem:** When `exchange_mic` is `None`, the canonical ID uses "UNKNOWN":
```rust
let mic = exchange_mic
    .map(|m| m.trim().to_uppercase())
    .unwrap_or_else(|| "UNKNOWN".to_string());
format!("{}:{}:{}", SECURITY_PREFIX, sym, mic)  // "SEC:AAPL:UNKNOWN"
```

This creates a problem: If a user later imports the same symbol with an exchange MIC, a **duplicate asset** is created:
- First activity: `SEC:AAPL:UNKNOWN`
- Second activity with MIC: `SEC:AAPL:XNAS`

**Impact:** Same security appears twice with different IDs, fragmenting holdings.

**Recommendation:**
1. During import validation, if symbol exists with "UNKNOWN" MIC, update the existing asset's exchange_mic
2. Or: generate a migration/merge path for UNKNOWN → resolved MIC

---

#### Issue 3: Empty Exchange MIC vs None
**Location:** `crates/core/src/assets/asset_id.rs:1454-1468`

**Problem:** The behavior differs between `Some("")` and `None`:
```rust
// Some("") → empty MIC
canonical_asset_id(&AssetKind::Security, "AAPL", Some(""), "USD")
// Returns: "SEC:AAPL:"  (empty qualifier)

// None → UNKNOWN
canonical_asset_id(&AssetKind::Security, "AAPL", None, "USD")
// Returns: "SEC:AAPL:UNKNOWN"
```

This inconsistency can cause duplicate assets if the frontend sends `Some("")` vs `None`.

**Recommendation:** Normalize empty strings to None before ID generation.

---

#### Issue 4: Legacy Asset ID Validation Missing
**Location:** `crates/core/src/assets/alternative_assets_service.rs:380`

**Problem:** Liability link validation uses legacy format check:
```rust
if !request.liability_id.starts_with("LIAB-") {  // OLD format with dash
    return Err(...)
}
```

But the current format uses colon: `LIAB:xxxxxxxx`

**Impact:** Cannot link liabilities created with the new ID format.

**Recommendation:** Update to check `LIAB:` prefix or use `is_valid_alternative_asset_id()`.

---

### 5.2 Moderate Issues

#### Issue 5: Symbol Resolution Cache Not Persisted
**Location:** `crates/core/src/activities/activities_service.rs:89-133`

**Problem:** `resolve_symbols_batch()` queries the quote service for missing symbols but doesn't persist the resolution:
```rust
// Existing assets → use cached MIC
// Missing symbols → query quote service, but result is only in-memory
```

If the same symbol is imported twice in different sessions, the quote service is queried again.

**Recommendation:** Consider persisting symbol → MIC mappings or caching in a separate table.

---

#### Issue 6: Cash Asset Taxonomy Assignment Inconsistent
**Location:** `crates/core/src/assets/assets_service.rs:115-163` vs `crates/connect/src/broker/service.rs:455-461`

**Problem:**
- `AssetService::create_cash_asset()` assigns taxonomy categories
- Broker sync creates cash assets without taxonomy assignment

**Impact:** Cash assets from broker sync lack proper classification.

---

#### Issue 7: No Asset Deduplication for Broker Sync
**Location:** `crates/connect/src/broker/service.rs:662-668`

**Problem:** Asset insert uses `ON CONFLICT DO NOTHING`:
```rust
diesel::insert_into(schema::assets::table)
    .values(&asset_db)
    .on_conflict(schema::assets::id)
    .do_nothing()  // Existing asset's name/metadata never updated
```

**Impact:** If broker provides updated asset name or metadata, it's ignored.

**Recommendation:** Use `DO UPDATE` for non-critical fields (name, metadata) while preserving user customizations.

---

### 5.3 Minor Issues

#### Issue 8: Pricing Mode Hint Parsing Case Sensitivity
**Location:** `crates/core/src/assets/assets_service.rs:327-342`

**Problem:** Pricing mode hint parsing is case-sensitive after uppercase conversion, but the fallback defaults may not match user intent:
```rust
match hint.to_uppercase().as_str() {
    "MANUAL" => PricingMode::Manual,
    // ...
    _ => {
        // Falls back to kind-based default
        // If user misspells "MANUAK", gets MARKET pricing
    }
}
```

**Recommendation:** Log a warning for unrecognized pricing modes.

---

#### Issue 9: Alternative Asset ID Validation Regex Doesn't Include PEQ
**Location:** `crates/core/src/assets/asset_id.rs:142-143`

**Problem:** The regex excludes `PEQ` (Private Equity):
```rust
static ALTERNATIVE_ASSET_ID_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$").unwrap());
```

`PEQ` is not in the pattern, so `is_valid_alternative_asset_id("PEQ:a1b2c3d4")` returns `false`.

**Impact:** Private Equity assets may fail validation in some paths.

---

#### Issue 10: Manual Quote Date Parsing Ambiguity
**Location:** `crates/core/src/activities/activities_service.rs:145-155`

**Problem:** Quote creation tries RFC3339 first, then `%Y-%m-%d`:
```rust
let timestamp = if let Ok(dt) = DateTime::parse_from_rfc3339(activity_date) {
    dt.with_timezone(&Utc)
} else if let Ok(date) = NaiveDate::parse_from_str(activity_date, "%Y-%m-%d") {
    Utc.from_utc_datetime(&date.and_hms_opt(12, 0, 0).unwrap())
} else {
    // Silently skips quote creation
    return Ok(());
}
```

**Impact:** If date format doesn't match, quote creation silently fails.

**Recommendation:** Return an error or log a warning.

---

### 5.4 Architecture Concerns

#### Concern 1: Multiple Asset Creation Code Paths

The codebase has multiple places that create assets:
1. `AssetService::get_or_create_minimal_asset()` - Standard path
2. `AssetService::create_asset()` - Direct creation
3. `AssetService::create_cash_asset()` - Cash-specific
4. `AssetService::ensure_cash_asset()` - Idempotent cash
5. `FxRepository::create_fx_asset()` - FX-specific
6. `AlternativeAssetService::create_alternative_asset()` - Alternative assets
7. `BrokerSyncService::upsert_account_activities()` - Direct SQL for broker sync
8. `BrokerSyncService::save_broker_holdings()` - Direct SQL for holdings

**Recommendation:** Consider a unified `AssetFactory` or consolidating to fewer entry points.

---

#### Concern 2: Event Emission Inconsistency

Not all paths emit `DomainEvent::assets_created`:
- ✅ `AssetService::get_or_create_minimal_asset()` - Emits
- ✅ `AssetService::create_asset()` - Emits
- ✅ `AssetService::create_cash_asset()` - Emits
- ✅ `BrokerSyncService` - Emits after bulk insert
- ❌ `AlternativeAssetService::create_alternative_asset()` - Does NOT emit
- ❌ `FxRepository::create_fx_asset()` - Does NOT emit

**Impact:** Downstream listeners (enrichment, UI refresh) may miss new assets.

---

#### Concern 3: No Transaction Boundary Across Services

Activity creation involves multiple service calls:
1. `AssetService::get_or_create_minimal_asset()`
2. `AssetService::update_pricing_mode()` (maybe)
3. Quote creation (maybe)
4. `FxService::register_currency_pair()` (maybe)
5. `ActivityRepository::create_activity()`

If step 5 fails, assets and FX pairs are already created (orphaned).

**Recommendation:** Implement saga pattern or pass connection for transactional boundaries.

---

## 6. Recommendations

### 6.1 High Priority

1. **Fix Liability Link Validation**: Update `LIAB-` to `LIAB:` check
2. **Handle UNKNOWN MIC Migration**: Add logic to merge `SEC:SYM:UNKNOWN` with `SEC:SYM:MIC`
3. **Normalize Empty Exchange MIC**: Treat `Some("")` as `None` in `canonical_asset_id()`
4. **Route Broker Sync Through Service Layer**: At minimum, call `get_or_create_minimal_asset()` for taxonomy assignment

### 6.2 Medium Priority

5. **Add Event Emission to All Paths**: AlternativeAssetService and FxRepository should emit creation events
6. **Update Alternative Asset ID Regex**: Include `PEQ` prefix
7. **Add Transactional Boundaries**: Implement unit of work pattern for activity creation

### 6.3 Low Priority

8. **Log Unrecognized Pricing Modes**: Add warning for invalid pricing mode hints
9. **Persist Symbol→MIC Cache**: Consider a lookup table for resolved symbols
10. **Unify Asset Creation Paths**: Consider `AssetFactory` pattern

---

## Appendix: File Reference

### Core Asset Files
- `crates/core/src/assets/asset_id.rs` - ID generation and parsing
- `crates/core/src/assets/assets_model.rs` - Asset domain model
- `crates/core/src/assets/assets_service.rs` - Main asset service
- `crates/core/src/assets/assets_traits.rs` - Service traits
- `crates/core/src/assets/alternative_assets_service.rs` - Alternative assets
- `crates/core/src/assets/auto_classification.rs` - Taxonomy auto-assignment

### Activity Files
- `crates/core/src/activities/activities_service.rs` - Activity processing and asset creation

### FX Files
- `crates/core/src/fx/fx_service.rs` - FX service
- `crates/storage-sqlite/src/fx/repository.rs` - FX repository with asset creation

### Broker Sync Files
- `crates/connect/src/broker/service.rs` - Broker sync with direct asset creation
- `crates/connect/src/broker/orchestrator.rs` - Sync orchestration

### Storage Files
- `crates/storage-sqlite/src/assets/repository.rs` - Asset repository
- `crates/storage-sqlite/src/assets/alternative_repository.rs` - Alternative asset operations

### Frontend Files
- `src-front/pages/activity/hooks/use-activity-mutations.ts` - Activity mutation hooks
- `src-front/features/alternative-assets/` - Alternative assets UI
