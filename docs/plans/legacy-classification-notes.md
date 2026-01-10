# Research Notes: Legacy Classification Cleanup

## Current State Analysis

### Where Legacy Fields Exist

#### 1. Database Layer

- **Assets table**: No longer has `asset_class`/`asset_sub_class` columns
  (removed in migration)
- **metadata.legacy**: JSON field stores legacy data for migration purposes
- **Taxonomy tables**: New system is in place and seeded

#### 2. Core Crate - Holdings Model (`holdings_model.rs:47-48`)

```rust
pub struct Instrument {
    // ... other fields
    pub asset_class: Option<String>,      // LEGACY - to remove
    pub asset_subclass: Option<String>,   // LEGACY - to remove
    pub classifications: Option<AssetClassifications>, // NEW - keep this
}
```

**Status**: Has both legacy AND new fields. Need to remove legacy.

#### 3. Core Crate - Assets Model (`assets_model.rs:282-300`)

```rust
pub struct ProviderProfile {
    pub asset_class: Option<String>,      // From market data providers
    pub asset_sub_class: Option<String>,  // From market data providers
    // ... used in From<ProviderProfile> for NewAsset
}
```

**Status**: Still receives data from providers. Stores in `metadata.legacy`.

#### 4. Market Data Crate - Profile Model (`profile.rs:43-48`)

```rust
pub struct AssetProfile {
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
}
```

**Status**: Returned by providers (Yahoo, Finnhub). Need to map to taxonomy.

#### 5. Connect Crate - Broker Service (`broker/service.rs:846-926`)

```rust
fn build_asset_metadata_with_legacy(
    activity: &AccountUniversalActivity,
    asset_class: Option<&str>,  // Puts in metadata.legacy
    isin: Option<&str>,
) -> Option<String>
```

**Status**: Still writing to `metadata.legacy`. Should create taxonomy
assignments instead.

#### 6. Frontend Types (`types.ts:325-326`)

```typescript
export interface Instrument {
  assetClass?: string | null; // LEGACY - to remove
  assetSubclass?: string | null; // LEGACY - to remove
  classifications?: AssetClassifications | null; // NEW - keep this
}
```

**Status**: Both legacy and new. Frontend charts may depend on legacy fields.

---

## Taxonomy Mapping Tables

### type_of_security (from taxonomy seed data)

| ID     | Key    | Name                       |
| ------ | ------ | -------------------------- |
| STOCK  | STOCK  | Stock                      |
| FUND   | FUND   | Fund                       |
| ETF    | ETF    | Exchange Traded Fund (ETF) |
| BOND   | BOND   | Bond                       |
| OPTION | OPTION | Option                     |
| CASH   | CASH   | Cash                       |
| CRYPTO | CRYPTO | Cryptocurrency             |

### asset_classes (from taxonomy seed data)

| ID          | Key         | Name        |
| ----------- | ----------- | ----------- |
| CASH        | CASH        | Cash        |
| EQUITY      | EQUITY      | Equity      |
| DEBT        | DEBT        | Debt        |
| REAL_ESTATE | REAL_ESTATE | Real Estate |
| COMMODITY   | COMMODITY   | Commodity   |

### industries_gics (sector level only)

| ID  | Key | Name                   |
| --- | --- | ---------------------- |
| 10  | 10  | Energy                 |
| 15  | 15  | Materials              |
| 20  | 20  | Industrials            |
| 25  | 25  | Consumer Discretionary |
| 30  | 30  | Consumer Staples       |
| 35  | 35  | Health Care            |
| 40  | 40  | Financials             |
| 45  | 45  | Information Technology |
| 50  | 50  | Communication Services |
| 55  | 55  | Utilities              |
| 60  | 60  | Real Estate            |

---

## Provider Mappings

### Yahoo Finance quoteType → type_of_security

Current mapping in `crates/market-data/src/provider/yahoo/mod.rs:755-780`:

```rust
fn parse_asset_class(quote_type: &str, short_name: &str) -> (String, String) {
    match qt.as_str() {
        "cryptocurrency" => ("Cryptocurrency", "Cryptocurrency"),
        "equity" => ("Equity", "Stock"),
        "etf" => ("Equity", "ETF"),
        "mutualfund" => ("Equity", "Mutual Fund"),
        "future" => ("Commodity", "Commodity|Precious Metal"),
        "index" => ("Index", "Index"),
        "currency" => ("Currency", "FX"),
        _ => ("Alternative", "Alternative"),
    }
}
```

**New taxonomy mapping needed:** | Yahoo quoteType | type_of_security |
asset_classes | |-----------------|------------------|---------------| | equity
| STOCK | EQUITY | | etf | ETF | EQUITY | | mutualfund | FUND | EQUITY | |
cryptocurrency | CRYPTO | (none) | | future | (none) | COMMODITY | | index |
(skip) | (skip) | | currency | (skip) | (skip) | | option | OPTION | (none) |

### Yahoo Finance sector → industries_gics

| Yahoo Sector           | GICS Sector ID |
| ---------------------- | -------------- |
| Technology             | 45             |
| Healthcare             | 35             |
| Financial Services     | 40             |
| Consumer Cyclical      | 25             |
| Consumer Defensive     | 30             |
| Communication Services | 50             |
| Industrials            | 20             |
| Basic Materials        | 15             |
| Energy                 | 10             |
| Utilities              | 55             |
| Real Estate            | 60             |

### Broker symbol_type → type_of_security

| Broker Symbol Type   | Taxonomy Category ID   |
| -------------------- | ---------------------- |
| EQUITY               | STOCK                  |
| STOCK                | STOCK                  |
| ETF                  | ETF                    |
| EXCHANGE_TRADED_FUND | ETF                    |
| CRYPTOCURRENCY       | CRYPTO                 |
| CRYPTO               | CRYPTO                 |
| EQUITY_OPTION        | OPTION                 |
| OPTION               | OPTION                 |
| OPTIONS              | OPTION                 |
| MUTUAL_FUND          | FUND                   |
| FUND                 | FUND                   |
| BOND                 | BOND                   |
| FIXED_INCOME         | BOND                   |
| COMMODITY            | (skip - use AssetKind) |

---

## Implementation Strategy

### Approach A: Inline Mapping Functions (Recommended)

Create mapping functions in a dedicated module that can be used by:

- Broker sync service
- Provider enrichment
- Manual migration commands

```rust
// crates/core/src/taxonomies/mapping.rs
pub fn quote_type_to_security_type(quote_type: &str) -> Option<&'static str> {
    match quote_type.to_uppercase().as_str() {
        "EQUITY" | "STOCK" => Some("STOCK"),
        "ETF" => Some("ETF"),
        "MUTUALFUND" | "MUTUAL_FUND" => Some("FUND"),
        "CRYPTOCURRENCY" | "CRYPTO" => Some("CRYPTO"),
        "OPTION" | "EQUITY_OPTION" => Some("OPTION"),
        "BOND" | "FIXED_INCOME" => Some("BOND"),
        _ => None,
    }
}

pub fn sector_to_gics_id(sector: &str) -> Option<&'static str> {
    match sector.to_lowercase().as_str() {
        "technology" | "information technology" => Some("45"),
        "healthcare" | "health care" => Some("35"),
        "financial services" | "financials" => Some("40"),
        "consumer cyclical" | "consumer discretionary" => Some("25"),
        "consumer defensive" | "consumer staples" => Some("30"),
        "communication services" => Some("50"),
        "industrials" => Some("20"),
        "basic materials" | "materials" => Some("15"),
        "energy" => Some("10"),
        "utilities" => Some("55"),
        "real estate" => Some("60"),
        _ => None,
    }
}
```

### Approach B: Broker Sync Changes

Instead of:

```rust
let metadata = build_asset_metadata_with_legacy(&activity, asset_class, isin);
AssetDB { metadata, ... }
```

Do:

```rust
// 1. Create asset without legacy metadata
let asset_db = AssetDB { ... };
asset_rows.push(asset_db);

// 2. Queue taxonomy assignments
if let Some(type_id) = quote_type_to_security_type(symbol_type_code) {
    taxonomy_assignments.push(TaxonomyAssignment {
        asset_id: asset_id.clone(),
        taxonomy_id: "type_of_security".to_string(),
        category_id: type_id.to_string(),
        weight: 10000,
        source: "broker_sync".to_string(),
    });
}
```

---

## Files to Delete/Clean

### Code to Remove

1. `build_asset_metadata_with_legacy()` function in broker service
2. `build_asset_metadata()` function (if unused)
3. Legacy field population in holdings service
4. Frontend legacy field references in charts

### Fields to Remove

1. `Instrument.asset_class` / `Instrument.asset_subclass`
2. `ProviderProfile.asset_class` / `ProviderProfile.asset_sub_class` (or
   deprecate)
3. Frontend `Instrument.assetClass` / `Instrument.assetSubclass`

---

## Risk Assessment

### Low Risk Changes

- Removing unused legacy fields from Instrument struct
- Adding mapping functions (additive)
- Creating taxonomy assignments in broker sync

### Medium Risk Changes

- Changing provider profile handling
- Frontend chart updates (need to verify data flow)

### High Risk Changes

- Removing ProviderProfile fields entirely (may break existing flows)

### Mitigation

- Keep `metadata.legacy` storage as fallback during transition
- Add feature flag for new taxonomy flow if needed
- Comprehensive testing of broker sync + provider enrichment
