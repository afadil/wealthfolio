# Migration Plan: Unify on `pricingMode`

Complete migration to remove `DataSource`/`assetDataSource` and use `pricingMode` everywhere.

## Summary

| Old (Remove) | New (Use) |
|--------------|-----------|
| `DataSource.YAHOO` | `PricingMode.MARKET` |
| `DataSource.MANUAL` | `PricingMode.MANUAL` |
| `assetDataSource` (activity field) | `pricingMode` (activity field) |
| `update_asset_data_source()` | `update_pricing_mode()` |

---

## 1. Frontend Changes

### 1.1 `src-front/lib/constants.ts`

**Remove:**
```typescript
export const DataSource = {
  YAHOO: "YAHOO",
  MANUAL: "MANUAL",
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export const dataSourceSchema = z.enum([DataSource.YAHOO, DataSource.MANUAL]);
```

**Add:**
```typescript
export const PricingMode = {
  MARKET: "MARKET",
  MANUAL: "MANUAL",
  DERIVED: "DERIVED",
  NONE: "NONE",
} as const;

export type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];

export const pricingModeSchema = z.enum([
  PricingMode.MARKET,
  PricingMode.MANUAL,
  PricingMode.DERIVED,
  PricingMode.NONE,
]);
```

---

### 1.2 `src-front/lib/types.ts`

**Change in `Activity` interface (~line 79):**
```typescript
// Remove:
assetDataSource?: DataSource;

// Add:
pricingMode?: PricingMode;
```

**Change in `ActivityDetails` interface (~line 181):**
```typescript
// Remove:
assetDataSource?: DataSource;

// Add:
pricingMode?: PricingMode;
```

**Change in `ActivityCreate` interface (~line 220):**
```typescript
// Remove:
assetDataSource?: DataSource;

// Add:
pricingMode?: PricingMode;
```

**Change in `ActivityUpdate` interface (~line 250):**
```typescript
// Remove:
assetDataSource?: DataSource;

// Add:
pricingMode?: PricingMode;
```

**Update imports:**
```typescript
// Remove DataSource from imports
// Add PricingMode to imports from constants
```

---

### 1.3 `src-front/pages/activity/components/forms/schemas.ts`

**Update schema:**
```typescript
// Remove:
assetDataSource: dataSourceSchema.optional(),

// Add:
pricingMode: pricingModeSchema.optional(),
```

---

### 1.4 `src-front/pages/activity/components/forms/common.tsx`

**Update state and logic (~lines 45-60):**
```typescript
// Remove:
const [skipSymbolLookup, setSkipSymbolLookup] = useState(
  defaultValues?.assetDataSource === DataSource.MANUAL
);

// Add:
const [manualPricing, setManualPricing] = useState(
  defaultValues?.pricingMode === PricingMode.MANUAL
);
```

**Update checkbox (~line 49):**
```tsx
// Remove:
<Checkbox
  checked={skipSymbolLookup}
  onCheckedChange={(checked) => {
    setSkipSymbolLookup(!!checked);
    if (checked) {
      form.setValue("assetDataSource", DataSource.MANUAL);
    } else {
      form.setValue("assetDataSource", undefined);
    }
  }}
/>
<Label>Skip Symbol Lookup</Label>

// Add:
<Checkbox
  checked={manualPricing}
  onCheckedChange={(checked) => {
    setManualPricing(!!checked);
    form.setValue("pricingMode", checked ? PricingMode.MANUAL : PricingMode.MARKET);
  }}
/>
<Label>Manual Pricing</Label>
<p className="text-xs text-muted-foreground">
  I'll manage prices myself
</p>
```

**Update ticker search callback (~line 226-228):**
```typescript
// Remove:
if (quoteSummary.dataSource === DataSource.MANUAL) {
  setSkipSymbolLookup(true);
  form.setValue("assetDataSource", DataSource.MANUAL);
}

// Add:
if (quoteSummary.dataSource === "MANUAL") {
  setManualPricing(true);
  form.setValue("pricingMode", PricingMode.MANUAL);
}
```

---

### 1.5 `src-front/pages/activity/components/forms/trade-form.tsx`

**Update default values:**
```typescript
// Change assetDataSource references to pricingMode
```

---

### 1.6 `src-front/pages/activity/components/forms/income-form.tsx`

**Update default values:**
```typescript
// Change assetDataSource references to pricingMode
```

---

### 1.7 `src-front/pages/activity/components/forms/other-form.tsx`

**Update default values:**
```typescript
// Change assetDataSource references to pricingMode
```

---

### 1.8 `src-front/pages/activity/components/forms/holdings-form.tsx`

**Update default values:**
```typescript
// Change assetDataSource references to pricingMode
```

---

### 1.9 `src-front/pages/activity/components/forms/bulk-holdings-form.tsx`

**Update (~line 121):**
```typescript
// Remove:
assetDataSource: quoteSummary.dataSource === "MANUAL" ? DataSource.MANUAL : undefined,

// Add:
pricingMode: quoteSummary.dataSource === "MANUAL" ? PricingMode.MANUAL : PricingMode.MARKET,
```

---

### 1.10 `src-front/pages/activity/components/forms/bulk-holdings-modal.tsx`

**Update references to `assetDataSource`:**
```typescript
// Change to pricingMode
```

---

### 1.11 `src-front/pages/activity/hooks/use-activity-mutations.ts`

**Update createQuoteFromActivity (~line 28-76):**
```typescript
// Remove:
if (activity.assetDataSource === DataSource.MANUAL && ...) {

// Add:
if (activity.pricingMode === PricingMode.MANUAL && ...) {
```

---

### 1.12 `src-front/pages/activity/components/activity-data-grid/types.ts`

**Update `LocalTransaction` type:**
```typescript
// Remove:
assetDataSource?: DataSource;

// Add:
pricingMode?: PricingMode;
```

---

### 1.13 `src-front/pages/activity/components/activity-data-grid/activity-utils.ts`

**Update `createDraftTransaction`:**
```typescript
// Remove:
assetDataSource: undefined,

// Add:
pricingMode: PricingMode.MARKET,  // Default to MARKET
```

**Update `buildSavePayload`:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.14 `src-front/pages/activity/components/activity-data-grid/activity-data-grid.tsx`

**Update any references to assetDataSource:**
```typescript
// Change to pricingMode
```

---

### 1.15 `src-front/pages/activity/components/activity-data-grid/use-activity-columns.tsx`

**Optional: Add pricingMode column for visibility:**
```typescript
// Add column to show/edit pricing mode in datagrid
```

---

### 1.16 `src-front/pages/activity/components/mobile-forms/mobile-activity-form.tsx`

**Update references:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.17 `src-front/pages/activity/components/mobile-forms/mobile-details-step.tsx`

**Update references:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.18 `src-front/pages/activity/components/activity-detail-sheet.tsx`

**Update display:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.19 `src-front/pages/activity/activity-manager-page.tsx`

**Update any references:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.20 `src-front/pages/asset/asset-edit-sheet.tsx`

**Already uses `pricingMode` correctly - no changes needed.**

---

### 1.21 `src-front/components/ticker-search.tsx`

**Check if DataSource is used:**
```typescript
// Update any DataSource references
```

---

### 1.22 `src-front/adapters/web/index.ts`

**Update any references:**
```typescript
// Change assetDataSource to pricingMode
```

---

### 1.23 `src-front/commands/market-data.ts`

**Check Quote type usage:**
```typescript
// dataSource on Quote is different - it's the source of the quote data (YAHOO, MANUAL)
// This is correct and should stay as-is
```

---

### 1.24 `packages/addon-sdk/src/data-types.ts`

**Update activity types:**
```typescript
// Change assetDataSource to pricingMode
```

---

## 2. Backend Changes

### 2.1 `crates/core/src/activities/activities_model.rs`

**Update `ActivityCreate` struct (~line 193):**
```rust
// Remove:
pub asset_data_source: Option<String>,

// Add:
pub pricing_mode: Option<String>,  // "MARKET", "MANUAL"
```

**Update `ActivityUpdate` struct (~line 256):**
```rust
// Remove:
pub asset_data_source: Option<String>,

// Add:
pub pricing_mode: Option<String>,
```

**Update `Activity` struct if it has asset_data_source:**
```rust
// Remove asset_data_source field if present
```

---

### 2.2 `crates/core/src/activities/activities_service.rs`

**Update create_activity (~line 188-198):**
```rust
// Remove:
if let Some(requested_source) = activity.asset_data_source.as_ref() {
    let requested = requested_source.to_uppercase();
    let current_provider = asset.preferred_provider.clone().unwrap_or_default();
    if !requested.is_empty() && current_provider != requested {
        self.asset_service
            .update_asset_data_source(&asset.id, requested)
            .await?;
    }
}

// Add:
if let Some(mode) = activity.pricing_mode.as_ref() {
    let pricing_mode = match mode.to_uppercase().as_str() {
        "MANUAL" => PricingMode::Manual,
        _ => PricingMode::Market,
    };
    if asset.pricing_mode != pricing_mode {
        self.asset_service
            .update_pricing_mode(&asset.id, pricing_mode)
            .await?;
    }
}
```

**Update update_activity (~line 271-282):**
```rust
// Same change as above
```

**Update import_activities (~line 610):**
```rust
// Remove:
asset_data_source: None,

// Add:
pricing_mode: None,
```

---

### 2.3 `crates/core/src/assets/assets_service.rs`

**Remove `update_asset_data_source` method (~line 290):**
```rust
// Remove entire method
```

**Add `update_pricing_mode` method:**
```rust
async fn update_pricing_mode(&self, asset_id: &str, pricing_mode: PricingMode) -> Result<Asset> {
    self.asset_repository
        .update_pricing_mode(asset_id, pricing_mode)
        .await
}
```

---

### 2.4 `crates/core/src/assets/assets_traits.rs`

**Update trait (~line 35):**
```rust
// Remove:
async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset>;

// Add:
async fn update_pricing_mode(&self, asset_id: &str, pricing_mode: PricingMode) -> Result<Asset>;
```

---

### 2.5 `crates/storage-sqlite/src/assets/repository.rs`

**Remove `update_data_source` method.**

**Add `update_pricing_mode` method:**
```rust
pub async fn update_pricing_mode(&self, asset_id: &str, pricing_mode: PricingMode) -> Result<Asset> {
    let mode_str = pricing_mode.as_db_str();
    sqlx::query("UPDATE assets SET pricing_mode = ?, updated_at = ? WHERE id = ?")
        .bind(mode_str)
        .bind(Utc::now().to_rfc3339())
        .bind(asset_id)
        .execute(&self.pool)
        .await?;

    self.get_by_id(asset_id).await
}
```

---

### 2.6 `crates/storage-sqlite/src/activities/model.rs`

**Update ActivityDb mapping (~line 268):**
```rust
// Remove:
asset_data_source: "MANUAL".to_string(),

// This field may not be needed in the DB model at all
```

---

### 2.7 `crates/connect/src/broker/service.rs`

**Update (~line 496):**
```rust
// Remove:
asset_data_source: None,

// Add:
pricing_mode: None,
```

---

### 2.8 `crates/core/src/activities/activities_service_tests.rs`

**Update all test cases:**
```rust
// Change asset_data_source: None to pricing_mode: None
```

---

### 2.9 `crates/core/src/activities/activities_model_tests.rs`

**Update all test cases:**
```rust
// Change asset_data_source: None to pricing_mode: None
```

---

### 2.10 `src-tauri/src/commands/asset.rs`

**Check for any assetDataSource usage:**
```rust
// Update if needed
```

---

### 2.11 `src-tauri/src/lib.rs`

**Check for any assetDataSource in command registrations:**
```rust
// Update if needed
```

---

### 2.12 `src-server/src/api/assets.rs`

**Update if web API uses assetDataSource:**
```rust
// Change to pricingMode
```

---

## 3. Addons

### 3.1 `addons/swingfolio-addon/src/lib/trade-matcher-test.ts`

**Update test data:**
```typescript
// Change assetDataSource to pricingMode
```

---

## 4. Database Migration

**No schema changes needed** - the `assets` table already has `pricing_mode` column.

The migration at `2026-01-01-000001_core_schema_redesign/up.sql` already:
- Creates `pricing_mode TEXT NOT NULL DEFAULT 'MARKET'`
- Sets `MANUAL` for assets with `data_source = 'MANUAL'`
- Sets `NONE` for cash assets

---

## 5. Search & Replace Summary

### Frontend Files (TypeScript/TSX)

| File | Changes |
|------|---------|
| `src-front/lib/constants.ts` | Remove `DataSource`, add `PricingMode` |
| `src-front/lib/types.ts` | `assetDataSource` → `pricingMode` |
| `src-front/pages/activity/components/forms/schemas.ts` | Update schema |
| `src-front/pages/activity/components/forms/common.tsx` | Major update - checkbox + state |
| `src-front/pages/activity/components/forms/trade-form.tsx` | Field rename |
| `src-front/pages/activity/components/forms/income-form.tsx` | Field rename |
| `src-front/pages/activity/components/forms/other-form.tsx` | Field rename |
| `src-front/pages/activity/components/forms/holdings-form.tsx` | Field rename |
| `src-front/pages/activity/components/forms/bulk-holdings-form.tsx` | Field rename |
| `src-front/pages/activity/components/forms/bulk-holdings-modal.tsx` | Field rename |
| `src-front/pages/activity/hooks/use-activity-mutations.ts` | Condition update |
| `src-front/pages/activity/components/activity-data-grid/types.ts` | Type update |
| `src-front/pages/activity/components/activity-data-grid/activity-utils.ts` | Field rename |
| `src-front/pages/activity/components/activity-data-grid/activity-data-grid.tsx` | Field rename |
| `src-front/pages/activity/components/mobile-forms/mobile-activity-form.tsx` | Field rename |
| `src-front/pages/activity/components/mobile-forms/mobile-details-step.tsx` | Field rename |
| `src-front/pages/activity/components/activity-detail-sheet.tsx` | Field rename |
| `src-front/pages/activity/activity-manager-page.tsx` | Field rename |
| `src-front/adapters/web/index.ts` | Field rename |
| `packages/addon-sdk/src/data-types.ts` | Type update |
| `addons/swingfolio-addon/src/lib/trade-matcher-test.ts` | Test data |

### Backend Files (Rust)

| File | Changes |
|------|---------|
| `crates/core/src/activities/activities_model.rs` | `asset_data_source` → `pricing_mode` |
| `crates/core/src/activities/activities_service.rs` | Logic update + method rename |
| `crates/core/src/assets/assets_service.rs` | Remove old method, add new |
| `crates/core/src/assets/assets_traits.rs` | Trait update |
| `crates/storage-sqlite/src/assets/repository.rs` | Method update |
| `crates/storage-sqlite/src/activities/model.rs` | Remove field |
| `crates/connect/src/broker/service.rs` | Field rename |
| `crates/core/src/activities/activities_service_tests.rs` | Test updates |
| `crates/core/src/activities/activities_model_tests.rs` | Test updates |
| `src-tauri/src/commands/asset.rs` | Check/update |
| `src-server/src/api/assets.rs` | Check/update |

---

## 6. Testing Checklist

After migration:

- [ ] Activity form: "Manual Pricing" checkbox creates asset with `pricing_mode=MANUAL`
- [ ] Activity form: Unchecked creates asset with `pricing_mode=MARKET`
- [ ] Ticker search: Selecting manual result sets `pricing_mode=MANUAL`
- [ ] Bulk holdings: Manual pricing toggle works
- [ ] DataGrid: Can create activities (check default pricing mode)
- [ ] CSV Import: Works (defaults to MARKET)
- [ ] Asset edit sheet: Toggle still works
- [ ] Quote sync: Manual assets not synced
- [ ] Quote sync: Market assets synced
- [ ] Build passes: `cargo build`, `pnpm build`
- [ ] Tests pass: `cargo test`, `pnpm test`
- [ ] Type check: `pnpm type-check`

---

## 7. UX Improvements (Post-Migration)

### 7.1 Rename UI Label

Change "Skip Symbol Lookup" to "Manual Pricing" with helper text explaining the difference.

### 7.2 Add Visual Indicator

Show pricing mode badge in holdings list:
- `[AUTO]` for `pricing_mode=MARKET`
- `[MANUAL]` for `pricing_mode=MANUAL`

### 7.3 Add DataGrid Column (Optional)

Allow toggling pricing mode in activity datagrid for bulk operations.

### 7.4 CSV Import (Future)

Add optional `pricingMode` column mapping:
```typescript
export const ImportFormat = {
  // ... existing
  PRICING_MODE: "pricingMode",  // Optional: MARKET or MANUAL
} as const;
```

---

## 8. Execution Order

1. **Backend first**: Update Rust code (models, services, traits, repository)
2. **Tests**: Update all test files
3. **Frontend types**: Update `constants.ts` and `types.ts`
4. **Frontend forms**: Update all form components
5. **Frontend hooks**: Update mutation hooks
6. **Frontend datagrid**: Update datagrid types and utils
7. **Addons**: Update addon SDK and tests
8. **Build & Test**: Verify everything compiles and tests pass
