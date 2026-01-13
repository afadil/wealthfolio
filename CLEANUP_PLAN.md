# Asset & Quote Model Cleanup Plan

## Acceptance Criteria
- No legacy code or dead code (exception: taxonomy migration for agent-assisted classification)
- No naming confusion (`Quote.symbol` → `Quote.asset_id`)
- Structured identifiers in `metadata.identifiers` (not `metadata.legacy`)
- `exchange_mic` required for Securities with MARKET pricing
- All changes in existing 2026 migrations (no new migrations)

---

## Phase 1: Quote Identity Rename (`Quote.symbol` → `Quote.asset_id`)

### 1.1 Core Model Change
**File:** `crates/core/src/quotes/model.rs`

```rust
// Line 109-110: Change
pub id: String,
pub symbol: String,  // DELETE THIS

// To:
pub id: String,
pub asset_id: String,  // Canonical asset ID (e.g., "SEC:AAPL:XNAS")
```

Update docs at lines 96-97 to reflect this is the canonical asset ID, not a ticker.

### 1.2 DB Conversion Layer
**File:** `crates/storage-sqlite/src/market_data/model.rs`

Lines 178-193: Update `From<QuoteDB> for Quote`:
```rust
Quote {
    id: db.id,
    asset_id: db.asset_id,  // Direct mapping, no "symbol" indirection
    // ... rest unchanged
}
```

Lines 197-227: Update `From<&Quote> for QuoteDB`:
```rust
QuoteDB {
    id: quote.id.clone(),
    asset_id: quote.asset_id.clone(),  // Was quote.symbol.clone()
    // ... rest unchanged
}
```

### 1.3 Files to Update (Quote.symbol → Quote.asset_id)

| File | Lines | Change |
|------|-------|--------|
| `crates/core/src/quotes/sync.rs` | ~375 | `last_quote.data_source.as_str()` access |
| `crates/core/src/quotes/service.rs` | Multiple | All `quote.symbol` references |
| `crates/core/src/quotes/import.rs` | Multiple | Import/validation logic |
| `crates/core/src/quotes/client.rs` | Multiple | Market data client |
| `crates/core/src/quotes/service_tests.rs` | Multiple | Test fixtures |
| `crates/core/src/portfolio/holdings/holdings_service.rs` | Multiple | Holdings calculations |
| `crates/core/src/portfolio/valuation/valuation_service.rs` | Multiple | Valuation lookups |
| `crates/core/src/portfolio/net_worth/net_worth_service.rs` | Multiple | Net worth calculations |
| `crates/core/src/portfolio/income/income_service.rs` | Multiple | Income calculations |
| `crates/storage-sqlite/src/market_data/repository.rs` | Multiple | Repository methods |
| `src-tauri/src/commands/market_data.rs` | Multiple | Tauri commands |
| `src-server/src/api/market_data.rs` | Multiple | Server API |

### 1.4 Remove Deprecated QuoteStore Methods
**File:** `crates/core/src/quotes/store.rs`

Delete lines 178-278 (legacy string-based methods):
- `get_latest_quote(&self, symbol: &str)`
- `get_latest_quotes(&self, symbols: &[String])`
- `get_latest_quotes_pair(&self, symbols: &[String])`
- `get_quotes_in_range(&self, symbol: &str, ...)`
- `find_duplicate_quotes(&self, symbol: &str, ...)`

Update all callers to use strong-typed methods:
- `latest(&AssetId, Option<&QuoteSource>)`
- `latest_batch(&[AssetId], Option<&QuoteSource>)`
- `range(&AssetId, Day, Day, Option<&QuoteSource>)`

---

## Phase 2: Remove Dead Code

### 2.1 QuoteSummary Duplicate
**File:** `crates/core/src/assets/assets_model.rs`

Delete lines 575-588:
```rust
// DELETE ENTIRE STRUCT
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct QuoteSummary {
    pub exchange: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
}
```

Keep `crates/core/src/quotes/model.rs:150-173` as the canonical `QuoteSummary`.

### 2.2 Remove Dead Code Attributes (Keep Code, Remove Attribute)
These are used for deserialization from external APIs:

| File | Lines | Item | Action |
|------|-------|------|--------|
| `crates/market-data/src/provider/metal_price_api/mod.rs` | 40-44 | MetalPriceResponse fields | Remove `#[allow(dead_code)]` |
| `crates/connect/src/client.rs` | 37-49 | ApiConnection struct | Remove `#[allow(dead_code)]` |
| `crates/connect/src/client.rs` | 109-118 | ApiErrorResponse struct | Remove `#[allow(dead_code)]` |
| `src-server/src/error.rs` | 10-28 | ApiError enum | Remove `#[allow(dead_code)]` |
| `src-server/src/api/connect.rs` | 67-79 | Supabase token fields | Remove `#[allow(dead_code)]` |

### 2.3 Remove Unused Addon Functions
**File:** `crates/core/src/addons/models.rs`

Evaluate and either:
1. Make public if useful, OR
2. Delete lines 151-190:
   - `get_declared_functions()`
   - `get_detected_functions()`
   - `get_undeclared_detected_functions()`
   - `has_undeclared_detected_functions()`

### 2.4 Remove Test Helper Dead Code Attributes
These are intentionally unused test utilities - keep but remove the attribute:

| File | Lines | Action |
|------|-------|--------|
| `crates/core/src/quotes/service_tests.rs` | 44-65 | Remove `#[allow(dead_code)]` |
| `crates/core/src/portfolio/snapshot/holdings_calculator_tests.rs` | 139 | Remove `#[allow(dead_code)]` |
| `crates/core/src/portfolio/snapshot/snapshot_service_tests.rs` | 262-265 | Remove `#[allow(dead_code)]` |
| `crates/core/src/portfolio/net_worth/net_worth_service_tests.rs` | 496 | Remove `#[allow(dead_code)]` |

---

## Phase 3: Restructure Metadata (legacy → identifiers)

### 3.1 Change Metadata Structure

**Before:**
```json
{
  "legacy": {
    "old_id": "AAPL",
    "isin": "US0378331005",
    "asset_class": "Equity",
    "sectors": [...],
    "countries": [...],
    "website": "https://..."
  }
}
```

**After:**
```json
{
  "identifiers": {
    "isin": "US0378331005",
    "figi": "BBG000B9XRY4",
    "cusip": "037833100",
    "sedol": null
  }
}
```

**Removed entirely:**
- `old_id` - no migration tracking needed
- `migrated_at` - no migration tracking needed
- `asset_class`, `sectors`, `countries` - handled by taxonomy system
- `website` - not needed

### 3.2 Update Migration SQL
**File:** `crates/storage-sqlite/migrations/2026-01-01-000001_core_schema_redesign/up.sql`

Lines 318-330: Change metadata generation:
```sql
-- metadata: only identifiers (no legacy/migration tracking)
CASE
    WHEN isin IS NOT NULL THEN
        json_object('identifiers', json_object('isin', isin))
    ELSE NULL
END
```

This means:
- Assets with ISIN get `{"identifiers": {"isin": "..."}}`
- Assets without ISIN get `NULL` metadata (clean)

### 3.3 Add Helper Methods to Asset
**File:** `crates/core/src/assets/assets_model.rs`

Add after line 267:
```rust
impl Asset {
    /// Get ISIN identifier if available
    pub fn isin(&self) -> Option<&str> {
        self.metadata
            .as_ref()
            .and_then(|m| m.get("identifiers"))
            .and_then(|i| i.get("isin"))
            .and_then(|v| v.as_str())
    }

    /// Get FIGI identifier if available
    pub fn figi(&self) -> Option<&str> {
        self.metadata
            .as_ref()
            .and_then(|m| m.get("identifiers"))
            .and_then(|i| i.get("figi"))
            .and_then(|v| v.as_str())
    }

    /// Get CUSIP identifier if available
    pub fn cusip(&self) -> Option<&str> {
        self.metadata
            .as_ref()
            .and_then(|m| m.get("identifiers"))
            .and_then(|i| i.get("cusip"))
            .and_then(|v| v.as_str())
    }

    /// Get SEDOL identifier if available
    pub fn sedol(&self) -> Option<&str> {
        self.metadata
            .as_ref()
            .and_then(|m| m.get("identifiers"))
            .and_then(|i| i.get("sedol"))
            .and_then(|v| v.as_str())
    }
}
```

### 3.4 Update ProviderProfile Conversion
**File:** `crates/core/src/assets/assets_model.rs`

Lines 499-519: Update `From<ProviderProfile> for NewAsset`:
```rust
// Build metadata.identifiers from provider profile
let metadata = {
    let mut identifiers = serde_json::Map::new();
    if let Some(ref isin) = profile.isin {
        identifiers.insert("isin".to_string(), serde_json::Value::String(isin.clone()));
    }
    // Add figi, cusip, sedol if ProviderProfile gains those fields

    if identifiers.is_empty() {
        None
    } else {
        Some(serde_json::json!({ "identifiers": identifiers }))
    }
};
```

### 3.5 Update Doc Comments in Storage Models
**File:** `crates/storage-sqlite/src/assets/model.rs`

Lines 1-4: Update module doc:
```rust
//! Database model for assets.
//! Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)
//! Metadata contains: identifiers (isin, figi, etc.) and option spec for options
```

Lines 81-83: Update field comment:
```rust
// Metadata (identifiers + option spec)
pub notes: Option<String>,
pub metadata: Option<String>,  // JSON: { "identifiers": {...}, "option": {...} }
```

---

## Phase 4: Enforce exchange_mic for Securities

### 4.1 Add Validation
**File:** `crates/core/src/assets/assets_model.rs`

Update `NewAsset::validate()` (lines 397-409):
```rust
pub fn validate(&self) -> Result<()> {
    if self.symbol.trim().is_empty() {
        return Err(Error::Validation(ValidationError::InvalidInput(
            "Asset symbol cannot be empty".to_string(),
        )));
    }
    if self.currency.trim().is_empty() {
        return Err(Error::Validation(ValidationError::InvalidInput(
            "Currency cannot be empty".to_string(),
        )));
    }
    // NEW: Require exchange_mic for market-priced securities
    if self.kind == AssetKind::Security
        && self.pricing_mode == PricingMode::Market
        && self.exchange_mic.is_none()
    {
        return Err(Error::Validation(ValidationError::InvalidInput(
            "Market-priced securities require exchange_mic (MIC code)".to_string(),
        )));
    }
    Ok(())
}
```

### 4.2 Update Asset Creation in Services
Ensure all asset creation paths provide `exchange_mic`:

| File | Function | Change |
|------|----------|--------|
| `crates/core/src/assets/assets_service.rs` | `create_from_provider_profile` | Ensure MIC is set |
| `crates/connect/src/broker/service.rs` | Asset creation from broker | Map broker exchange to MIC |
| `src-tauri/src/commands/asset.rs` | Manual asset creation | Require MIC in UI |

---

## Phase 5: Remove Legacy Code (Except Taxonomy Migration)

### 5.1 Remove Legacy ID Parsing
**File:** `crates/core/src/assets/asset_id.rs`

Remove legacy format support (lines 576-649):
- `$CASH-USD` format → Only `CASH:USD`
- `EUR/USD` format → Only `FX:EUR:USD`
- `AAPL:XNAS` stays as canonical

Keep functions but remove legacy branches:
- `is_cash_asset_id()` - only check `CASH:` prefix
- `is_fx_asset_id()` - only check `FX:` prefix

### 5.2 Remove Legacy FX Parsing
**File:** `crates/core/src/fx/fx_model.rs`

Lines 55-69: Remove legacy format parsing:
```rust
// REMOVE legacy format handling:
// - "EUR/USD" format
// - "EURUSD" format
// - "EURUSD=X" format
// KEEP only canonical: FX:EUR:USD
```

### 5.3 Remove Legacy Broker Fields
**File:** `crates/connect/src/broker/models.rs`

Lines 76-99: Remove legacy fields if no longer needed:
- `name` field (legacy)
- `raw_type` field (legacy)
- Line 436: Remove fallback to `raw_type`

### 5.4 Remove Backward Compatibility Comments/Code
Search and remove throughout codebase:
- `// backward compat` comments with associated code
- `// legacy` comments with associated code (except taxonomy)
- `#[serde(alias = "...")]` for old field names

### 5.5 KEEP: Taxonomy Migration (Exception)
**File:** `src-tauri/src/commands/taxonomy.rs`

Lines 18-500+: KEEP these for agent-assisted migration:
- `MigrationStatus` struct
- `MigrationResult` struct
- `LegacySector` struct
- `LegacyCountry` struct
- `check_legacy_classification_migration_needed()`
- `migrate_legacy_classifications()`
- `parse_legacy_sectors()`
- `parse_legacy_countries()`

---

## Phase 6: Update 2026 Migration Files

### 6.1 Core Schema Migration
**File:** `crates/storage-sqlite/migrations/2026-01-01-000001_core_schema_redesign/up.sql`

Changes:
1. Lines 318-330: Update metadata structure (Phase 3.2) - only `identifiers`, no legacy
2. Remove ALL comments mentioning "legacy data" or "migration"
3. Update table comment: `metadata` is for `identifiers` and `option` spec only

### 6.2 Quotes Migration
**File:** `crates/storage-sqlite/migrations/2026-01-01-000002_quotes_market_data/up.sql`

Changes:
1. Add comment clarifying `asset_id` is canonical (not `symbol`)
2. No structural changes needed - already uses `asset_id`

---

## Implementation Order

1. **Phase 1.1-1.2**: Core Quote model rename
2. **Phase 1.3**: Update all Quote.symbol references (compile errors guide you)
3. **Phase 1.4**: Remove deprecated QuoteStore methods
4. **Phase 2**: Remove dead code
5. **Phase 3.2**: Update migration SQL for new metadata structure
6. **Phase 3.3-3.4**: Add helper methods and update conversions
7. **Phase 4**: Add exchange_mic validation
8. **Phase 5**: Remove legacy code
9. **Run tests**: `cargo test`
10. **Run build**: `cargo build`
11. **Manual testing**: Verify migration works on test database

---

## Verification Checklist

- [ ] `cargo build` succeeds with no warnings about dead code
- [ ] `cargo test` passes
- [ ] No `#[allow(dead_code)]` except in test helpers (if kept)
- [ ] No `metadata.legacy` references anywhere in code
- [ ] No `metadata.migration` references anywhere in code
- [ ] All `Quote.symbol` renamed to `Quote.asset_id`
- [ ] `NewAsset::validate()` enforces `exchange_mic` for market securities
- [ ] Grep for "legacy" returns only taxonomy migration code
- [ ] Grep for "backward compat" returns zero results
- [ ] Frontend updated for any API changes (if needed)
- [ ] Migration tested on sample database

---

## Files Summary

### Modified
- `crates/core/src/quotes/model.rs`
- `crates/core/src/quotes/store.rs`
- `crates/core/src/quotes/sync.rs`
- `crates/core/src/quotes/service.rs`
- `crates/core/src/quotes/import.rs`
- `crates/core/src/quotes/client.rs`
- `crates/core/src/assets/assets_model.rs`
- `crates/core/src/assets/asset_id.rs`
- `crates/core/src/fx/fx_model.rs`
- `crates/storage-sqlite/src/market_data/model.rs`
- `crates/storage-sqlite/src/market_data/repository.rs`
- `crates/storage-sqlite/migrations/2026-01-01-000001_core_schema_redesign/up.sql`
- `crates/connect/src/broker/models.rs`
- Multiple service files in `crates/core/src/portfolio/`
- Multiple command files in `src-tauri/src/commands/`

### Deleted (code sections)
- `crates/core/src/assets/assets_model.rs:575-588` (duplicate QuoteSummary)
- `crates/core/src/quotes/store.rs:178-278` (deprecated methods)
- Legacy ID parsing branches
- Legacy FX format parsing
- Various `#[allow(dead_code)]` attributes

### Kept (Exception)
- `src-tauri/src/commands/taxonomy.rs` - Legacy migration infrastructure
