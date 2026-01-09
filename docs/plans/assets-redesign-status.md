# Assets Redesign - Implementation Status

> Based on the `docs/assets-redisign.md` specification
> Last Updated: 2026-01-09

---

## Overview

This document tracks the implementation progress of the Asset Model + Market Data Provider Redesign as specified in `docs/assets-redisign.md`.

---

## Implementation Summary

| Component | Status | Completion |
|-----------|--------|------------|
| Asset ID System | **COMPLETE** | 100% |
| Asset Model (Enums, Structs) | **COMPLETE** | 100% |
| Alternative Assets System | **COMPLETE** | 100% |
| Database Schema & Migrations | **COMPLETE** | 100% |
| Market Data Crate - Models | **COMPLETE** | 100% |
| Market Data Crate - Providers | **COMPLETE** | 100% |
| Market Data Crate - Resolver | **COMPLETE** | 100% |
| Market Data Crate - Registry | **COMPLETE** | 100% |
| Storage Layer (Repository) | **COMPLETE** | 100% |
| Classification Service | **PARTIAL** | 80% |
| Taxonomy Migration (Backend) | **PARTIAL** | 70% |
| Frontend Updates | **NOT STARTED** | 0% |

---

## Part 1: Data Model - COMPLETE

### 1.1 Asset ID System
**File:** `crates/core/src/assets/asset_id.rs` (909 lines)

- [x] Uniform `{primary}:{qualifier}` ID format
- [x] ID constructors: `security_id()`, `crypto_id()`, `fx_id()`, `cash_id()`, `alternative_id()`
- [x] ID parsing with `parse_asset_id()` → `ParsedAssetId`
- [x] Alternative asset ID generation (8-char random alphanumeric)
- [x] Validation functions: `is_valid_alternative_asset_id()`, `get_kind_from_asset_id()`
- [x] Comprehensive test suite (35+ tests)

**ID Format Examples:**
```
Security:  SHOP:XTSE, AAPL:XNAS
Crypto:    BTC:USD, ETH:CAD
FX:        EUR:USD, GBP:CAD
Cash:      CASH:USD, CASH:CAD
Property:  PROP:ABC12345
Vehicle:   VEH:XYZ98765
```

### 1.2 Asset Kinds & Pricing Modes
**File:** `crates/core/src/assets/assets_model.rs` (534 lines)

- [x] `AssetKind` enum (13 variants):
  - Security, Crypto, Cash, FxRate, Option, Commodity
  - PrivateEquity, Property, Vehicle, Collectible, PhysicalPrecious, Liability, Other
- [x] `PricingMode` enum (4 variants): Market, Manual, Derived, None
- [x] Helper methods: `is_alternative()`, `is_investment()`, `is_liability()`, `as_db_str()`

### 1.3 Asset Struct
**File:** `crates/core/src/assets/assets_model.rs`

- [x] All spec fields implemented:
  ```rust
  pub struct Asset {
      pub id: String,
      pub kind: AssetKind,
      pub name: Option<String>,
      pub symbol: String,                    // Canonical ticker (no provider suffix)
      pub exchange_mic: Option<String>,      // ISO 10383 MIC
      pub currency: String,
      pub pricing_mode: PricingMode,
      pub preferred_provider: Option<String>,
      pub provider_overrides: Option<Value>, // JSON
      pub notes: Option<String>,
      pub metadata: Option<Value>,           // JSON
      pub is_active: bool,
      pub created_at: NaiveDateTime,
      pub updated_at: NaiveDateTime,
  }
  ```
- [x] `NewAsset` input model
- [x] `UpdateAssetProfile` update model
- [x] `to_instrument_id()` conversion method

### 1.4 Database Schema
**File:** `crates/storage-sqlite/src/schema.rs`

- [x] Assets table matches spec:
  - `id`, `kind`, `symbol`, `exchange_mic`, `currency`
  - `pricing_mode`, `preferred_provider`, `provider_overrides`
  - `metadata`, `notes`, `is_active`
  - `created_at`, `updated_at`
- [x] Removed legacy columns: `isin`, `asset_class`, `asset_sub_class`, `profile`

### 1.5 Migrations
**Directory:** `crates/storage-sqlite/migrations/`

- [x] `2025-12-14-150000_core_schema_redesign` - Complete assets table transformation
- [x] `2025-12-15-000001_quotes_market_data` - New quotes schema
- [x] `2025-12-16-000001_taxonomies` - Taxonomy tables and seed data

**Migration handles:**
- ID format conversion (PROP-x → PROP:x, SHOP.TO → SHOP:XTSE)
- Legacy data backup to `metadata.legacy`
- Proper enum value mapping

---

## Part 2: Market Data Crate - COMPLETE

### 2.1 Core Types
**Files:** `crates/market-data/src/models/`

- [x] `InstrumentId` enum (Equity, Crypto, Fx, Metal)
- [x] `ProviderInstrument` enum with all variants
- [x] `ProviderOverrides` struct
- [x] `QuoteContext` struct
- [x] `Quote` struct with OHLCV + source
- [x] `AssetProfile` struct (20+ fields)
- [x] Type aliases: `ProviderId`, `Mic`, `Currency`, `ProviderSymbol`

### 2.2 Provider System
**Files:** `crates/market-data/src/provider/`

- [x] `MarketDataProvider` trait
- [x] `ProviderCapabilities` struct
- [x] `RateLimit` struct
- [x] **Yahoo Finance provider** - Full implementation
- [x] **Alpha Vantage provider** - Full implementation
- [x] **Finnhub provider** - Full implementation
- [x] **MarketData.app provider** - Full implementation
- [x] **MetalPriceAPI provider** - Full implementation

### 2.3 Resolver System
**Files:** `crates/market-data/src/resolver/`

- [x] `Resolver` trait (chain link)
- [x] `SymbolResolver` trait (main interface)
- [x] `ResolverChain` composite
- [x] `AssetResolver` (override-based resolution)
- [x] `RulesResolver` (MIC→suffix deterministic rules)
- [x] `ExchangeMap` with comprehensive mappings:
  - North America (NYSE, NASDAQ, TSX, etc.)
  - Europe (XETR, XPAR, XLON, etc.)
  - Asia (XTKS, XHKG, XSHG, etc.)
  - 40+ exchanges covered

### 2.4 Registry System
**Files:** `crates/market-data/src/registry/`

- [x] `ProviderRegistry` orchestration
- [x] `RateLimiter` (token bucket per provider)
- [x] `CircuitBreaker` (Closed/Open/HalfOpen states)
- [x] `QuoteValidator` (OHLC invariants, staleness)
- [x] `SkipReason` enum for diagnostics

### 2.5 Error Handling
**File:** `crates/market-data/src/errors/`

- [x] `MarketDataError` enum with all variants
- [x] `RetryClass` enum (Never, WithBackoff, NextProvider, CircuitOpen)
- [x] `retry_class()` method implementation

---

## Part 3: Storage Layer - COMPLETE

### 3.1 Asset Repository
**Files:** `crates/storage-sqlite/src/assets/`

- [x] `AssetDB` Diesel model with all columns
- [x] `From<AssetDB> for Asset` conversion
- [x] `From<NewAsset> for AssetDB` conversion
- [x] Repository methods:
  - `get_by_id()`, `list()`, `create()`, `update_profile()`
  - `delete()`, `list_cash_assets()`, `list_by_symbols()`

### 3.2 Alternative Assets Repository
**File:** `crates/storage-sqlite/src/assets/alternative_repository.rs`

- [x] Transactional delete (unlinks liabilities, deletes quotes, deletes asset)
- [x] Proper error handling via `StorageError`

---

## Part 4: Alternative Assets System - COMPLETE

### 4.1 Models
**File:** `crates/core/src/assets/alternative_assets_model.rs`

- [x] `CreateAlternativeAssetRequest`
- [x] `UpdateValuationRequest`
- [x] `LinkLiabilityRequest`
- [x] `AlternativeHolding` (for display)

### 4.2 Service
**File:** `crates/core/src/assets/alternative_assets_service.rs`

- [x] Asset kind validation
- [x] Metadata building with purchase info
- [x] Coordinated creation (asset + initial quote)
- [x] Liability linking/unlinking
- [x] Valuation updates

---

## Part 5: Classification Service - PARTIAL (80%)

### 5.1 Implemented
**File:** `crates/core/src/assets/classification_service.rs`

- [x] `AssetClassifications` struct
- [x] `CategoryWithWeight` struct
- [x] Basic taxonomy assignment retrieval

### 5.2 Remaining Work

- [ ] **BE-1:** Full integration with holdings service
- [ ] **BE-2:** Update `Instrument` model to include `classifications` field
- [ ] **BE-3:** Populate classifications when building holdings

---

## Part 6: Taxonomy Migration - PARTIAL (70%)

### 6.1 Implemented

- [x] Taxonomy tables created (taxonomies, taxonomy_categories, asset_taxonomy_assignments)
- [x] Seed data for 6 taxonomies (type_of_security, risk_category, asset_classes, industries_gics, regions, custom_groups)
- [x] Legacy data backup to `metadata.legacy` in migration SQL

### 6.2 Remaining Work

See `docs/plans/taxonomy-migration-plan.md` for detailed tasks.

**Backend:**
- [ ] **DB-1:** Auto-migration SQL for asset_class → asset_classes
- [ ] **DB-2:** Auto-migration SQL for asset_sub_class → type_of_security
- [ ] **BE-4:** Tauri command `migrate_legacy_classifications`
- [ ] **BE-5:** Tauri command `get_migration_status`

**Frontend:**
- [ ] **MIG-1:** MigrationBanner component
- [ ] **MIG-2:** useMigrationStatus hook
- [ ] **FORM-1:** Remove legacy fields from asset-form.tsx
- [ ] **PROF-1:** Remove legacy fields from asset-profile-page.tsx
- [ ] **CHART-1-5:** Update analytics charts to use taxonomy data

---

## Part 7: Frontend Updates - NOT STARTED (0%)

### Files Requiring Updates

See `docs/plans/taxonomy-migration-plan.md` for detailed task breakdown.

**Asset Forms:**
- [ ] `src-front/pages/asset/asset-form.tsx`
- [ ] `src-front/pages/asset/asset-profile-page.tsx`

**Analytics:**
- [ ] `src-front/pages/holdings/components/sectors-chart.tsx`
- [ ] `src-front/pages/holdings/components/country-chart.tsx`
- [ ] `src-front/pages/holdings/components/classes-chart.tsx`

**Tables:**
- [ ] `src-front/pages/asset/assets-table.tsx`
- [ ] `src-front/pages/holdings/components/holdings-table.tsx`

**Types:**
- [ ] `src-front/lib/types.ts` - Add `AssetClassifications`, `CategoryWithWeight`

---

## Acceptance Criteria Status

### Must Have (from spec)

| Criteria | Status |
|----------|--------|
| No provider-specific symbols in `assets.symbol` | **DONE** |
| Switching provider does not require rewriting assets | **DONE** |
| FX works with AlphaVantage (`FX_DAILY` endpoint) | **DONE** |
| Crypto works with AlphaVantage (`DIGITAL_CURRENCY_DAILY`) | **DONE** |
| Manual-priced assets never trigger provider calls | **DONE** |
| Manual quotes are never overwritten by provider refresh | **DONE** |
| Dual-listed tickers supported via `exchange_mic` | **DONE** |

### Should Have (from spec)

| Criteria | Status |
|----------|--------|
| `provider_overrides` allows explicit per-provider symbols | **DONE** |
| Resolver chain: overrides → rules | **DONE** |
| Rate limiting per provider | **DONE** |
| Circuit breaker per provider | **DONE** |

### Nice to Have (from spec)

| Criteria | Status |
|----------|--------|
| Data validation (OHLC invariants, staleness) | **DONE** |
| Session type awareness (24/7 vs exchange hours) | **PARTIAL** |

---

## Next Steps (Priority Order)

### Phase 1: Complete Backend Integration
1. Add taxonomy auto-migration SQL (DB-1, DB-2)
2. Connect classification service to holdings (BE-1, BE-2, BE-3)
3. Add migration Tauri commands (BE-4, BE-5)

### Phase 2: Frontend Migration
1. Update TypeScript types (FE-1)
2. Remove legacy form fields (FORM-1, PROF-1)
3. Create migration banner (MIG-1)

### Phase 3: Analytics Update
1. Update chart components (CHART-1-5)
2. Update table filters (TABLE-1-3)

### Phase 4: Testing & Cleanup
1. End-to-end migration testing
2. Remove deprecated code
3. Update documentation

---

## File Reference

### Backend (Implemented)

```
crates/core/src/assets/
├── mod.rs
├── asset_id.rs                    ✅ Complete
├── assets_model.rs                ✅ Complete
├── assets_service.rs              ✅ Complete
├── assets_traits.rs               ✅ Complete
├── alternative_assets_model.rs    ✅ Complete
├── alternative_assets_service.rs  ✅ Complete
├── alternative_assets_traits.rs   ✅ Complete
└── classification_service.rs      ⚠️ Partial

crates/market-data/src/
├── lib.rs
├── models/                        ✅ Complete (7 files)
├── provider/                      ✅ Complete (8 files)
├── resolver/                      ✅ Complete (6 files)
├── registry/                      ✅ Complete (5 files)
└── errors/                        ✅ Complete

crates/storage-sqlite/src/assets/
├── mod.rs
├── model.rs                       ✅ Complete
├── repository.rs                  ✅ Complete
└── alternative_repository.rs      ✅ Complete
```

### Frontend (Not Started)

```
src-front/
├── lib/types.ts                   ❌ Needs update
├── pages/asset/
│   ├── asset-form.tsx             ❌ Needs update
│   ├── asset-profile-page.tsx     ❌ Needs update
│   └── assets-table.tsx           ❌ Needs update
└── pages/holdings/components/
    ├── sectors-chart.tsx          ❌ Needs update
    ├── country-chart.tsx          ❌ Needs update
    └── classes-chart.tsx          ❌ Needs update
```

---

## Related Documentation

- `docs/assets-redisign.md` - Original specification
- `docs/plans/taxonomy-migration-plan.md` - Detailed taxonomy migration tasks
- `docs/plans/consolidated-migration-plan.md` - Database migration strategy
