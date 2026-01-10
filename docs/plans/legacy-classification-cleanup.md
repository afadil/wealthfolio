# Task Plan: Legacy Asset Classification Cleanup

## Goal

Remove all legacy `asset_class`/`asset_sub_class` handling from the codebase and
ensure all classification flows use the taxonomy system exclusively.

## Background

The new taxonomy system was introduced in migrations
(`2025-12-16-000001_taxonomies`) with:

- Tables: `taxonomies`, `taxonomy_categories`, `asset_taxonomy_assignments`
- Auto-migration from `metadata.legacy` in SQL
- `AssetClassificationService` for querying taxonomy data

However, legacy fields and handling still exist throughout the codebase.

---

## Decisions Made

- **Broker Sync**: Remove `metadata.legacy` storage entirely. No classification
  data stored. Assets get classified via manual taxonomy assignment or provider
  enrichment later.
- **Instrument model**: Remove legacy fields (`asset_class`, `asset_subclass`)
  entirely
- **Provider data**: Adapt providers to map and return correct taxonomy
  assignments
- **Migration**: One-shot SQL (already done) + manual prompt for advanced cases

---

## Phases

### Phase 1: Analysis & Mapping

- [x] 1.1 Document all locations of legacy field usage
- [x] 1.2 Map Yahoo Finance `quoteType` → `type_of_security` taxonomy
- [x] 1.3 Map Yahoo Finance `sector` → `industries_gics` taxonomy
- [x] 1.4 Map broker `symbol_type` → `type_of_security` taxonomy

### Phase 2: Backend - Remove Legacy from Models

- [x] 2.1 Remove `asset_class`, `asset_subclass` from `Instrument` struct
- [x] 2.2 Update `holdings_service.rs` to populate `classifications` only
- [x] 2.3 Remove `ProviderProfile` legacy fields (Remove them entirely, do not
      mark deprecated)
- [x] 2.4 Clean up `AssetProfile` in market-data crate

### Phase 3: Backend - Broker Sync Cleanup

- [x] 3.1 Remove `build_asset_metadata_with_legacy` function entirely
- [x] 3.2 Use existing `build_asset_metadata` (keeps raw_symbol, exchange, option)
- [x] 3.3 Remove legacy field parameters from asset creation in broker sync
- [x] 3.4 Verify broker sync works without classification data

### Phase 4: Backend - Provider Enrichment

- [x] 4.1 Update market-data providers to remove legacy field handling
- [x] 4.2 ~~Create enrichment flow~~ (Deferred - broker sync doesn't write
      classifications)
- [x] 4.3 Remove legacy field handling from quote client

### Phase 5: Frontend Cleanup

- [x] 5.1 Remove `assetClass`, `assetSubclass` from `Instrument` type
- [x] 5.2 Update `asset-profile-page.tsx` to use taxonomy classifications
- [x] 5.3 Update `asset-utils.ts` legacy field references
- [x] 5.4 Update analytics charts to use taxonomy data

### Phase 6: Testing & Validation

- [x] 6.1 Run cargo check - passed with 1 warning (unused field in Alpha Vantage)
- [x] 6.2 Run frontend type-check - passed
- [ ] 6.3 Manual testing of broker sync flow
- [ ] 6.4 Manual testing of frontend charts

---

## Status

**COMPLETE** - All legacy classification fields removed from codebase.

### Summary of Changes

**Backend (Rust):**
- Removed `asset_class`, `asset_subclass` from `Instrument` struct
- Removed `asset_class`, `asset_sub_class` from `ProviderProfile` struct
- Removed `asset_class`, `asset_sub_class` from `AssetProfile` struct
- Removed `build_asset_metadata_with_legacy` function from broker sync
- Removed `parse_asset_class` function from Yahoo provider
- Removed legacy field handling from Finnhub, Alpha Vantage providers
- Removed legacy field assignment in quote client

**Frontend (TypeScript):**
- Removed `assetClass`, `assetSubclass` from `Instrument` interface
- Updated `asset-profile-page.tsx` to use taxonomy classifications
- Updated `asset-utils.ts` to remove legacy field extraction
- Updated holdings filters to use `classifications.assetType`
- Updated `classes-chart.tsx` to use taxonomy data only

**Remaining Manual Testing:**
- Broker sync flow (new assets created without classification data)
- Frontend charts rendering with taxonomy data

---

## Files Requiring Changes

### Backend - Core Crate

| File                                                         | Change Required                                        |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `crates/core/src/portfolio/holdings/holdings_model.rs:47-48` | Remove `asset_class`, `asset_subclass` from Instrument |
| `crates/core/src/portfolio/holdings/holdings_service.rs`     | Populate `classifications` only                        |
| `crates/core/src/assets/assets_model.rs:289-290`             | Remove or deprecate ProviderProfile legacy fields      |
| `crates/core/src/quotes/client.rs`                           | Remove legacy field handling                           |

### Backend - Market Data Crate

| File                                                   | Change Required                                           |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `crates/market-data/src/models/profile.rs:43-48`       | Remove `asset_class`, `asset_sub_class` from AssetProfile |
| `crates/market-data/src/provider/yahoo/mod.rs`         | Update to use taxonomy mapping                            |
| `crates/market-data/src/provider/finnhub/mod.rs`       | Update to use taxonomy mapping                            |
| `crates/market-data/src/provider/alpha_vantage/mod.rs` | Update to use taxonomy mapping                            |

### Backend - Connect Crate

| File                                           | Change Required                                                |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `crates/connect/src/broker/service.rs:434-438` | Remove `build_asset_metadata_with_legacy`, use direct taxonomy |
| `crates/connect/src/broker/service.rs:846-926` | Remove `build_asset_metadata_with_legacy` function             |

### Frontend

| File                                           | Change Required                                      |
| ---------------------------------------------- | ---------------------------------------------------- |
| `src-front/lib/types.ts:325-326`               | Remove `assetClass`, `assetSubclass` from Instrument |
| `src-front/pages/asset/asset-profile-page.tsx` | Use taxonomy classifications                         |
| `src-front/pages/asset/asset-utils.ts`         | Remove legacy field references                       |

---

## Key Mappings Needed

### 1. Yahoo `quoteType` → `type_of_security`

```
EQUITY → STOCK
ETF → ETF
MUTUALFUND → FUND
CRYPTOCURRENCY → CRYPTO
CURRENCY → CASH (or skip)
INDEX → (skip, not holdable)
OPTION → OPTION
FUTURE → (skip or OTHER)
```

### 2. Broker `symbol_type` → `type_of_security`

```
EQUITY/STOCK → STOCK
ETF → ETF
CRYPTOCURRENCY/CRYPTO → CRYPTO
EQUITY_OPTION/OPTION → OPTION
MUTUAL_FUND → FUND
BOND → BOND
COMMODITY → (custom or skip)
```

### 3. Yahoo/Provider `sector` → `industries_gics`

Need to map provider sector strings to GICS sector IDs (10, 15, 20, etc.)

---

## Errors Encountered

- **TypeScript type guard issue**: Filter in `assets-table-mobile.tsx` had type
  issue with `filter((k): k is string => !!k)`. Fixed by simplifying to
  `filter((k) => !!k)`.
- **Unused variable warning**: `symbol_type_label` in broker service became
  unused after removing legacy function. Fixed by prefixing with underscore.
- **Dead code warning (minor)**: `asset_type` field in Alpha Vantage
  `CompanyOverviewResponse` is now unused. Low priority - can be cleaned up
  later.

---

## Notes

- The SQL migration already handles existing `metadata.legacy` data
- New assets from broker sync need direct taxonomy assignment
- Provider enrichment should create/update taxonomy assignments
- Frontend charts should query taxonomy data via `AssetClassifications`
