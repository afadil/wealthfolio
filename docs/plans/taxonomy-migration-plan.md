# Taxonomy Migration Plan

## Executive Summary

This document outlines the migration from legacy asset classification attributes (`sectors`, `countries`, `asset_class`, `asset_sub_class`, `categories`) to the new hierarchical taxonomy system. The goal is to consolidate all classification logic into the taxonomy system while preserving existing data and maintaining backward compatibility during the transition.

---

## Current State Analysis

### Legacy Attribute Storage

The old asset classification system uses multiple fields stored in different ways:

| Field | Location | Format | Description |
|-------|----------|--------|-------------|
| `asset_class` | `assets.asset_class` | TEXT | Top-level classification (Equity, Bond, Cash) |
| `asset_sub_class` | `assets.asset_sub_class` | TEXT | Sub-classification (Stock, ETF, Fund) |
| `sectors` | `assets.profile->sectors` | JSON string | Array of `{name, weight}` objects |
| `countries` | `assets.profile->countries` | JSON string | Array of `{name, weight}` objects |
| `categories` | REMOVED | - | Was in old schema, already removed |
| `classes` | REMOVED | - | Was in old schema, already removed |

### Current Migration State

The `2025-12-14-150000_activity_system_redesign` migration already:
- Moved `sectors`, `countries`, `url` from separate columns into `profile` JSON field
- Converted `asset_type` to `kind` enum
- Kept `asset_class` and `asset_sub_class` as direct columns

### New Taxonomy System

The `2026-01-07-120000_taxonomies` migration creates:

**Tables:**
- `taxonomies` - Classification schemes
- `taxonomy_categories` - Hierarchical categories within taxonomies
- `asset_taxonomy_assignments` - Asset-to-category mappings with weights

**Seed Taxonomies (6 total):**
1. `type_of_security` - Single-select (Stock, ETF, Fund, Bond, etc.)
2. `risk_category` - Single-select (Low, Medium, High)
3. `asset_classes` - Multi-select (Equity, Debt, Cash, Real Estate, Commodity)
4. `industries_gics` - Multi-select (384 GICS categories)
5. `regions` - Multi-select (316 countries/regions)
6. `custom_groups` - Multi-select (user-defined)

---

## Migration Strategy

### Phase 1: Data Migration (Database Level)

**Objective:** Migrate existing `asset_class`, `asset_sub_class`, `sectors`, and `countries` data to taxonomy assignments while preserving legacy data in metadata.

#### Task 1.0: Preserve Legacy Data in Metadata

**CRITICAL:** Before migrating, store all legacy values in `metadata.legacy` JSON:

```sql
-- ============================================================================
-- STEP 1: PRESERVE LEGACY DATA IN METADATA
-- Store original values before migration for backward compatibility
-- ============================================================================

UPDATE assets
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.legacy',
    json_object(
        'asset_class', asset_class,
        'asset_sub_class', asset_sub_class,
        'profile_sectors', json_extract(profile, '$.sectors'),
        'profile_countries', json_extract(profile, '$.countries'),
        'migrated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
)
WHERE asset_class IS NOT NULL
   OR asset_sub_class IS NOT NULL
   OR json_extract(profile, '$.sectors') IS NOT NULL
   OR json_extract(profile, '$.countries') IS NOT NULL;
```

#### Task 1.1: Update `2026-01-07-120000_taxonomies` Migration

Add SQL to migrate existing data after creating seed taxonomies.

**Migrate asset_class -> asset_classes taxonomy:**
```sql
-- ============================================================================
-- STEP 2: MIGRATE asset_class TO asset_classes TAXONOMY
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'asset_classes',
    CASE
        WHEN a.asset_class = 'Equity' THEN 'EQUITY'
        WHEN a.asset_class = 'Cash' THEN 'CASH'
        WHEN a.asset_class = 'Commodity' THEN 'COMMODITY'
        WHEN a.asset_class LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN a.asset_class LIKE '%Bond%' OR a.asset_class LIKE '%Debt%' THEN 'DEBT'
    END,
    10000, -- 100%
    'migrated'
FROM assets a
WHERE a.asset_class IS NOT NULL
  AND (
    a.asset_class = 'Equity'
    OR a.asset_class = 'Cash'
    OR a.asset_class = 'Commodity'
    OR a.asset_class LIKE '%Real Estate%'
    OR a.asset_class LIKE '%Bond%'
    OR a.asset_class LIKE '%Debt%'
  )
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'asset_classes'
  );
```

**Migrate asset_sub_class -> type_of_security taxonomy:**
```sql
-- ============================================================================
-- STEP 3: MIGRATE asset_sub_class TO type_of_security TAXONOMY
-- ============================================================================

INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'type_of_security',
    CASE
        WHEN a.asset_sub_class = 'Stock' THEN 'STOCK'
        WHEN a.asset_sub_class = 'ETF' THEN 'ETF'
        WHEN a.asset_sub_class = 'Mutual Fund' THEN 'FUND'
        WHEN a.asset_sub_class = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN a.asset_sub_class = 'Cash' THEN 'CASH'
        WHEN a.asset_sub_class LIKE '%Bond%' THEN 'BOND'
    END,
    10000, -- 100%
    'migrated'
FROM assets a
WHERE a.asset_sub_class IS NOT NULL
  AND (
    a.asset_sub_class IN ('Stock', 'ETF', 'Mutual Fund', 'Cryptocurrency', 'Cash')
    OR a.asset_sub_class LIKE '%Bond%'
  )
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'type_of_security'
  );
```

**Files to modify:**
- `crates/storage-sqlite/migrations/2026-01-07-120000_taxonomies/up.sql`

#### Task 1.2: Create Rust Migration Service for Complex Data

For `sectors` and `countries` (JSON with weights), create a Rust service to handle the migration since SQL-only approach is complex:

**New file:** `crates/core/src/taxonomies/migration_service.rs`

```rust
pub async fn migrate_profile_sectors_to_taxonomies(
    conn: &SqliteConnection,
    taxonomy_repo: &TaxonomyRepository,
) -> Result<MigrationStats>;

pub async fn migrate_profile_countries_to_taxonomies(
    conn: &SqliteConnection,
    taxonomy_repo: &TaxonomyRepository,
) -> Result<MigrationStats>;
```

**Logic:**
1. Query all assets with non-null `profile->sectors` or `profile->countries`
2. Parse JSON array `[{name: "Technology", weight: 0.40}, ...]`
3. For each sector/country:
   - Find matching category in `industries_gics` or `regions` taxonomy by name
   - Create assignment with weight (converted to basis points)
4. Mark source as `"migrated_profile"`

---

### Phase 2: Backend Updates

#### Task 2.1: Remove Old Fields from Schema

**File:** `crates/storage-sqlite/src/schema.rs`

Remove or mark as deprecated:
- `asset_class` column (line ~113)
- `asset_sub_class` column (line ~114)

**Note:** Profile JSON with sectors/countries can remain as cache/import source but shouldn't be used directly.

#### Task 2.2: Update Asset Model

**File:** `crates/core/src/assets/assets_model.rs`

```rust
pub struct Asset {
    // ... keep existing fields

    // DEPRECATED - use taxonomy assignments instead
    #[deprecated(note = "Use taxonomy assignments instead")]
    pub asset_class: Option<String>,
    #[deprecated(note = "Use taxonomy assignments instead")]
    pub asset_sub_class: Option<String>,

    // profile.sectors and profile.countries are deprecated
}
```

#### Task 2.3: Create Asset Classification Service

**New file:** `crates/core/src/assets/classification_service.rs`

```rust
pub struct AssetClassificationService {
    taxonomy_service: Arc<TaxonomyService>,
}

impl AssetClassificationService {
    /// Get the primary type (from type_of_security taxonomy)
    pub fn get_asset_type(&self, asset_id: &str) -> Option<Category>;

    /// Get asset class allocations (from asset_classes taxonomy)
    pub fn get_asset_classes(&self, asset_id: &str) -> Vec<(Category, f64)>;

    /// Get sector allocations (from industries_gics taxonomy)
    pub fn get_sectors(&self, asset_id: &str) -> Vec<(Category, f64)>;

    /// Get regional allocations (from regions taxonomy)
    pub fn get_regions(&self, asset_id: &str) -> Vec<(Category, f64)>;

    /// Get all assignments for an asset grouped by taxonomy
    pub fn get_all_classifications(&self, asset_id: &str) -> AssetClassifications;
}

pub struct AssetClassifications {
    pub asset_type: Option<Category>,
    pub risk_category: Option<Category>,
    pub asset_classes: Vec<(Category, f64)>,
    pub sectors: Vec<(Category, f64)>,
    pub regions: Vec<(Category, f64)>,
    pub custom_groups: Vec<(Category, f64)>,
}
```

#### Task 2.4: Update HoldingView/Instrument Model

**File:** `crates/core/src/portfolio/holdings/holding_model.rs`

Add taxonomy-based classifications to `Instrument`:

```rust
pub struct Instrument {
    // ... existing fields

    // NEW: Taxonomy-based classifications
    pub classifications: Option<AssetClassifications>,
}
```

**File:** `crates/core/src/portfolio/holdings/holding_service.rs`

When building holdings, populate classifications from taxonomy service.

---

### Phase 3: Frontend Updates

#### Task 3.1: Update TypeScript Types

**File:** `src-front/lib/types.ts`

```typescript
// DEPRECATED - use AssetClassifications
export interface Sector { ... }
export interface Country { ... }

// NEW types
export interface AssetClassifications {
  assetType?: TaxonomyCategory | null;
  riskCategory?: TaxonomyCategory | null;
  assetClasses: CategoryWithWeight[];
  sectors: CategoryWithWeight[];
  regions: CategoryWithWeight[];
  customGroups: CategoryWithWeight[];
}

export interface CategoryWithWeight {
  category: TaxonomyCategory;
  weight: number; // 0-100 percentage
}

// Update Instrument
export interface Instrument {
  // ... existing

  // DEPRECATED
  sectors?: Sector[] | null;
  countries?: Country[] | null;
  assetClass?: string | null;
  assetSubclass?: string | null;

  // NEW
  classifications?: AssetClassifications | null;
}
```

#### Task 3.2: Update Asset Form

**File:** `src-front/pages/asset/asset-form.tsx`

**Current State:**
- Already imports `SingleSelectTaxonomy`, `MultiSelectTaxonomy`, `useTaxonomies`
- Has "Classifications" section at bottom that renders taxonomy components
- Still has legacy form fields: `assetClass`, `assetSubClass`, `sectors`, `countries`
- Uses `InputTags` for sectors/countries with "sector:weight%" format
- `buildAssetUpdatePayload()` still sends old fields to backend

**Changes Required:**

1. **Remove legacy form fields from schema:**
```typescript
// REMOVE these from assetFormSchema
const assetFormSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  // REMOVE: assetClass: z.string().optional(),
  // REMOVE: assetSubClass: z.string().optional(),
  currency: z.string().min(1),
  preferredProvider: z.enum([DataSource.YAHOO, DataSource.MANUAL]),
  notes: z.string().optional(),
  // REMOVE: sectors: z.array(z.string()),
  // REMOVE: countries: z.array(z.string()),
});
```

2. **Remove legacy form fields from JSX (lines 134-216):**
   - Remove `assetClass` Input field
   - Remove `assetSubClass` Input field
   - Remove `sectors` InputTags field
   - Remove `countries` InputTags field

3. **Update buildAssetUpdatePayload (line 280):**
```typescript
// BEFORE
export const buildAssetUpdatePayload = (values: AssetFormValues): UpdateAssetProfile => ({
  symbol: values.symbol,
  name: values.name || "",
  sectors: values.sectors.length ? JSON.stringify(tagsToBreakdown(values.sectors)) : "",
  countries: values.countries.length ? JSON.stringify(tagsToBreakdown(values.countries)) : "",
  notes: values.notes ?? "",
  assetSubClass: values.assetSubClass || "",
  assetClass: values.assetClass || "",
});

// AFTER
export const buildAssetUpdatePayload = (values: AssetFormValues): UpdateAssetProfile => ({
  symbol: values.symbol,
  name: values.name || "",
  notes: values.notes ?? "",
  // Legacy fields - keep empty, classifications handled by taxonomy system
  sectors: "",
  countries: "",
  assetSubClass: "",
  assetClass: "",
});
```

4. **Enhance Classifications section (lines 232-257):**
   - Move taxonomy components higher in the form (after name/currency)
   - Add section header explaining it replaces old classification fields
   - Consider making `type_of_security` and `risk_category` more prominent

**New Layout:**
```tsx
<Form>
  {/* Basic Info */}
  <div className="grid gap-4 md:grid-cols-2">
    <FormField name="symbol" ... />
    <FormField name="currency" ... />
    <FormField name="name" ... />
    <FormField name="preferredProvider" ... />
  </div>

  {/* Classifications (NEW - replaces old fields) */}
  <div className="space-y-4 pt-4 border-t">
    <h4 className="text-sm font-medium">Classifications</h4>

    {/* Single-select taxonomies in grid */}
    <div className="grid gap-4 md:grid-cols-2">
      {singleSelectTaxonomies.map((tax) => (
        <SingleSelectTaxonomy key={tax.id} taxonomyId={tax.id} assetId={asset.id} label={tax.name} />
      ))}
    </div>

    {/* Multi-select taxonomies */}
    {multiSelectTaxonomies.map((tax) => (
      <MultiSelectTaxonomy key={tax.id} taxonomyId={tax.id} assetId={asset.id} label={tax.name} />
    ))}
  </div>

  {/* Notes */}
  <FormField name="notes" ... />
</Form>
```

---

#### Task 3.3: Update Asset Profile Page

**File:** `src-front/pages/asset/asset-profile-page.tsx`

**Current State:**
- Has `ClassificationSheet` component integrated (line 1058-1064)
- Has "Classify Asset" button in header actions (line 706-714)
- Still has inline editing for legacy fields in "About" section (lines 849-1006)
- Stores form data with: `name`, `sectors`, `countries`, `assetClass`, `assetSubClass`, `notes`
- Calls `updateAssetProfileMutation.mutate()` with all legacy fields

**Changes Required:**

1. **Remove legacy fields from AssetProfileFormData (line 47-54):**
```typescript
// BEFORE
interface AssetProfileFormData {
  name: string;
  sectors: Sector[];
  countries: Country[];
  assetClass: string;
  assetSubClass: string;
  notes: string;
}

// AFTER
interface AssetProfileFormData {
  name: string;
  notes: string;
  // Legacy fields removed - use taxonomy system instead
}
```

2. **Remove legacy field initialization in useEffect (line 141-178):**
   - Remove `parseSectors` and `parseCountries` helper functions
   - Remove sectors/countries from `setFormData`
   - Remove assetClass/assetSubClass from `setFormData`

3. **Simplify handleSave (line 267-279):**
```typescript
const handleSave = useCallback(() => {
  if (!profile) return;
  updateAssetProfileMutation.mutate({
    symbol,
    name: formData.name,
    notes: formData.notes,
    // Keep empty for backward compatibility
    sectors: "",
    countries: "",
    assetSubClass: "",
    assetClass: "",
  });
  setIsEditing(false);
}, [profile, symbol, formData, updateAssetProfileMutation]);
```

4. **Replace "About" section inline editing (lines 849-1006):**

**BEFORE:** Complex inline editing with InputTags for sectors/countries

**AFTER:** Simple notes editing + prominent "Classify" button
```tsx
<div className="group relative">
  <div className="flex items-center justify-between">
    <h3 className="text-lg font-bold">About</h3>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setClassificationSheetOpen(true)}
    >
      <Icons.Tag className="mr-2 h-4 w-4" />
      Classify Asset
    </Button>
  </div>

  {/* Display current classifications (read-only summary) */}
  <AssetClassificationsSummary assetId={assetProfile?.id} />

  {/* Notes section */}
  <div className="mt-4">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-medium">Notes</span>
      {!isEditing && (
        <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-6 w-6">
          <Icons.Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
    {isEditing ? (
      <div className="space-y-2">
        <textarea ... value={formData.notes} ... />
        <div className="flex gap-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
        </div>
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">
        {formData.notes || "No description available."}
      </p>
    )}
  </div>
</div>
```

5. **Create new component: AssetClassificationsSummary**

**New file:** `src-front/pages/asset/asset-classifications-summary.tsx`
```tsx
import { useAssetTaxonomyAssignments, useTaxonomies } from "@/hooks/use-taxonomies";
import { Badge } from "@wealthfolio/ui";

interface Props {
  assetId?: string;
}

export function AssetClassificationsSummary({ assetId }: Props) {
  const { data: taxonomies = [] } = useTaxonomies();
  const { data: assignments = [] } = useAssetTaxonomyAssignments(assetId ?? "");

  if (!assetId || assignments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        No classifications assigned. Click "Classify Asset" to add.
      </p>
    );
  }

  // Group assignments by taxonomy
  const groupedAssignments = taxonomies.map((taxonomy) => ({
    taxonomy,
    assignments: assignments.filter((a) => a.taxonomyId === taxonomy.id),
  })).filter((g) => g.assignments.length > 0);

  return (
    <div className="flex flex-wrap gap-2 py-4">
      {groupedAssignments.map(({ taxonomy, assignments }) => (
        <div key={taxonomy.id} className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{taxonomy.name}:</span>
          {assignments.map((a) => (
            <Badge key={a.id} variant="secondary" style={{ backgroundColor: `${a.categoryColor}20` }}>
              {a.categoryName}
              {a.weight < 10000 && ` (${a.weight / 100}%)`}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  );
}
```

6. **Clean up imports:**
   - Remove `InputTags` import (no longer needed for classifications)
   - Remove `Separator` if only used for classification dividers
   - Keep `ClassificationSheet` import

7. **Update handleCancel to not reset legacy fields (line 294-332)**

---

#### Task 3.4: Update Analytics Charts

**File:** `src-front/pages/holdings/components/sectors-chart.tsx`

```typescript
// OLD
const sectorData = holdings.reduce((acc, holding) => {
  const sectors = holding.instrument?.sectors || [];
  // ...
}, {});

// NEW
const sectorData = holdings.reduce((acc, holding) => {
  const sectors = holding.instrument?.classifications?.sectors || [];
  sectors.forEach(({ category, weight }) => {
    const name = category.name;
    const weightedValue = holding.marketValue.base * (weight / 100);
    acc[name] = (acc[name] || 0) + weightedValue;
  });
  return acc;
}, {});
```

**File:** `src-front/pages/holdings/components/country-chart.tsx`

```typescript
// OLD
const countries = holding.instrument?.countries || [];

// NEW
const regions = holding.instrument?.classifications?.regions || [];
// Filter to leaf nodes (actual countries)
const countries = regions.filter(r => isCountryCategory(r.category));
```

**File:** `src-front/pages/holdings/components/classes-chart.tsx`

```typescript
// OLD
const assetSubclass = holding.instrument?.assetSubclass || "Other";

// NEW
const assetType = holding.instrument?.classifications?.assetType;
const label = assetType?.name || "Other";
```

#### Task 3.5: Update Holdings Table Filters

**File:** `src-front/pages/holdings/components/holdings-table.tsx`

Replace `assetSubclass` filter with taxonomy-based filter using `type_of_security` categories.

**File:** `src-front/pages/holdings/holdings-insights-page.tsx`

Update filter logic to use taxonomy categories instead of string matching.

#### Task 3.6: Update Assets Table

**File:** `src-front/pages/asset/assets-table.tsx`

Replace columns:
- `assetClass` column -> Show primary asset class from taxonomy
- `assetSubClass` column -> Show type from `type_of_security` taxonomy

---

### Phase 4: Cleanup

#### Task 4.1: Mark Deprecated Code (Backend) - DO NOT REMOVE

**IMPORTANT:** Keep `asset_class` and `asset_sub_class` columns for backward compatibility:
- Legacy data is preserved in `metadata.legacy`
- Columns remain for data providers that still populate them
- New code should read from taxonomy assignments, not these fields

**Files to update:**
- `crates/storage-sqlite/src/assets/model.rs` - Add deprecation comments
- `crates/core/src/assets/assets_model.rs` - Add deprecation comments/attributes

```rust
// In assets_model.rs
pub struct Asset {
    // ... other fields

    /// DEPRECATED: Use taxonomy assignments (asset_classes taxonomy) instead.
    /// Kept for backward compatibility and data provider imports.
    /// Original values preserved in metadata.legacy.asset_class
    #[deprecated(note = "Use taxonomy assignments (asset_classes taxonomy) instead")]
    pub asset_class: Option<String>,

    /// DEPRECATED: Use taxonomy assignments (type_of_security taxonomy) instead.
    /// Kept for backward compatibility and data provider imports.
    /// Original values preserved in metadata.legacy.asset_sub_class
    #[deprecated(note = "Use taxonomy assignments (type_of_security taxonomy) instead")]
    pub asset_sub_class: Option<String>,
}
```

**DO NOT drop columns** - they're still populated by market data providers and needed for import compatibility.

#### Task 4.2: Remove Deprecated Code (Frontend)

**Files to clean:**
- `src-front/pages/asset/asset-utils.ts` - Remove `parseJsonBreakdown`, `tagsToBreakdown`
- `src-front/lib/types.ts` - Remove `Sector`, `Country` interfaces (after ensuring no usage)
- `src-front/pages/asset/asset-form.tsx` - Remove sectors/countries tag inputs

#### Task 4.3: Update API Commands

**File:** `src-tauri/src/commands/asset.rs`

Update asset update command to not accept deprecated fields.

---

## Implementation Tasks for Parallel Execution

### Agent Group 1: Database Migration
**Dependencies:** None

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| DB-1 | Update taxonomy migration with sector/country data migration SQL | `migrations/2026-01-07-120000_taxonomies/up.sql` | Medium |
| DB-2 | Add migration stats tracking | `migrations/2026-01-07-120000_taxonomies/up.sql` | Low |

### Agent Group 2: Backend Services
**Dependencies:** DB-1

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| BE-1 | Create AssetClassificationService | `crates/core/src/assets/classification_service.rs` | Medium |
| BE-2 | Update Instrument model with classifications | `crates/core/src/portfolio/holdings/holding_model.rs` | Low |
| BE-3 | Update HoldingService to populate classifications | `crates/core/src/portfolio/holdings/holding_service.rs` | Medium |
| BE-4 | Add Tauri command for asset classifications | `src-tauri/src/commands/taxonomy.rs` | Low |

### Agent Group 3: Frontend Types & Hooks
**Dependencies:** BE-2

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| FE-1 | Update TypeScript types | `src-front/lib/types.ts` | Low |
| FE-2 | Create `useAssetClassifications` hook | `src-front/hooks/use-taxonomies.ts` | Low |

### Agent Group 4: Frontend - Asset Form & Profile Page
**Dependencies:** FE-1, FE-2

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| FE-3 | Remove legacy fields from asset-form.tsx schema | `src-front/pages/asset/asset-form.tsx` | Low |
| FE-4 | Remove legacy field JSX from asset-form.tsx | `src-front/pages/asset/asset-form.tsx` | Medium |
| FE-5 | Update buildAssetUpdatePayload | `src-front/pages/asset/asset-form.tsx` | Low |
| FE-6 | Enhance Classifications section layout | `src-front/pages/asset/asset-form.tsx` | Medium |
| FE-7 | Remove legacy fields from AssetProfileFormData | `src-front/pages/asset/asset-profile-page.tsx` | Low |
| FE-8 | Simplify handleSave/handleCancel | `src-front/pages/asset/asset-profile-page.tsx` | Medium |
| FE-9 | Replace "About" section inline editing | `src-front/pages/asset/asset-profile-page.tsx` | High |
| FE-10 | Create AssetClassificationsSummary component | `src-front/pages/asset/asset-classifications-summary.tsx` | Medium |
| FE-11 | Remove unused imports (InputTags, etc.) | Both files | Low |

### Agent Group 5: Frontend - Analytics
**Dependencies:** FE-1, FE-2

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| FE-12 | Update sectors-chart.tsx | `src-front/pages/holdings/components/sectors-chart.tsx` | Medium |
| FE-13 | Update country-chart.tsx | `src-front/pages/holdings/components/country-chart.tsx` | Medium |
| FE-14 | Update classes-chart.tsx | `src-front/pages/holdings/components/classes-chart.tsx` | Low |
| FE-15 | Update holdings-table.tsx filters | `src-front/pages/holdings/components/holdings-table.tsx` | Medium |
| FE-16 | Update holdings-insights-page.tsx | `src-front/pages/holdings/holdings-insights-page.tsx` | Medium |

### Agent Group 6: Frontend - Assets Table
**Dependencies:** FE-1, FE-2

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| FE-17 | Update assets-table.tsx columns | `src-front/pages/asset/assets-table.tsx` | Medium |
| FE-18 | Update assets-table.tsx filters | `src-front/pages/asset/assets-table.tsx` | Medium |
| FE-19 | Update assets-table-mobile.tsx | `src-front/pages/asset/assets-table-mobile.tsx` | Low |

### Agent Group 7: Cleanup (After All Above)
**Dependencies:** All above tasks

| Task ID | Description | Files | Estimated Complexity |
|---------|-------------|-------|---------------------|
| CL-1 | Remove deprecated fields from Rust models | Multiple | Low |
| CL-2 | Remove deprecated frontend code | `asset-utils.ts`, `types.ts` | Low |
| CL-3 | Update/add tests | Multiple | Medium |

---

## Data Migration Mapping

### IMPORTANT: Legacy Data Preservation

**All legacy data must be preserved in asset metadata as JSON for backward compatibility:**

```sql
-- Store legacy values in metadata before migration
UPDATE assets
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.legacy',
    json_object(
        'asset_class', asset_class,
        'asset_sub_class', asset_sub_class,
        'profile_sectors', json_extract(profile, '$.sectors'),
        'profile_countries', json_extract(profile, '$.countries'),
        'migrated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
)
WHERE asset_class IS NOT NULL
   OR asset_sub_class IS NOT NULL
   OR json_extract(profile, '$.sectors') IS NOT NULL
   OR json_extract(profile, '$.countries') IS NOT NULL;
```

### asset_class -> asset_classes Taxonomy

**Actual values from Yahoo/AlphaVantage providers:**

| Old Value (exact match) | New Category Key | Notes |
|------------------------|-----------------|-------|
| `Equity` | EQUITY | Most common |
| `Cryptocurrency` | (none - use type_of_security CRYPTO) | No direct asset_class match |
| `Commodity` | COMMODITY | Futures, precious metals |
| `Cash` | CASH | Cash positions |
| `Currency` | (none) | FX rates, skip |
| `Index` | (none) | Index data, skip |
| `Alternative` | (none) | Fallback, skip |

**Migration SQL:**
```sql
INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'asset_classes',
    CASE
        WHEN a.asset_class = 'Equity' THEN 'EQUITY'
        WHEN a.asset_class = 'Cash' THEN 'CASH'
        WHEN a.asset_class = 'Commodity' THEN 'COMMODITY'
        WHEN a.asset_class LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN a.asset_class LIKE '%Bond%' OR a.asset_class LIKE '%Debt%' OR a.asset_class LIKE '%Fixed%' THEN 'DEBT'
    END,
    10000,
    'migrated'
FROM assets a
WHERE a.asset_class IS NOT NULL
  AND a.asset_class IN ('Equity', 'Cash', 'Commodity')
  OR a.asset_class LIKE '%Real Estate%'
  OR a.asset_class LIKE '%Bond%'
  OR a.asset_class LIKE '%Debt%';
```

### asset_sub_class -> type_of_security Taxonomy

**Actual values from Yahoo/AlphaVantage providers:**

| Old Value (exact match) | New Category Key | Notes |
|------------------------|-----------------|-------|
| `Stock` | STOCK | Individual stocks |
| `ETF` | ETF | Exchange-traded funds |
| `Mutual Fund` | FUND | Mutual funds |
| `Cryptocurrency` | CRYPTO | Crypto assets |
| `Cash` | CASH | Cash holdings |
| `Commodity` | (none) | Map to STOCK or skip |
| `Precious Metal` | (none) | Map to STOCK or skip |
| `FX` | (none) | FX rates, skip |
| `Index` | (none) | Index, skip |
| `Alternative` | (none) | Fallback, skip |

**Migration SQL:**
```sql
INSERT INTO asset_taxonomy_assignments (id, asset_id, taxonomy_id, category_id, weight, source)
SELECT
    lower(hex(randomblob(16))),
    a.id,
    'type_of_security',
    CASE
        WHEN a.asset_sub_class = 'Stock' THEN 'STOCK'
        WHEN a.asset_sub_class = 'ETF' THEN 'ETF'
        WHEN a.asset_sub_class = 'Mutual Fund' THEN 'FUND'
        WHEN a.asset_sub_class = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN a.asset_sub_class = 'Cash' THEN 'CASH'
        WHEN a.asset_sub_class LIKE '%Bond%' THEN 'BOND'
    END,
    10000,
    'migrated'
FROM assets a
WHERE a.asset_sub_class IS NOT NULL
  AND a.asset_sub_class IN ('Stock', 'ETF', 'Mutual Fund', 'Cryptocurrency', 'Cash')
  OR a.asset_sub_class LIKE '%Bond%';
```

### profile.sectors -> industries_gics Taxonomy

**Common sector names from Yahoo Finance and their GICS mappings:**

| Sector Name | GICS Sector ID | GICS Sector Name |
|-------------|---------------|------------------|
| `Technology` | 45 | Information Technology |
| `Financial Services` / `Financial` | 40 | Financials |
| `Healthcare` / `Health Care` | 35 | Health Care |
| `Consumer Cyclical` | 25 | Consumer Discretionary |
| `Consumer Defensive` | 30 | Consumer Staples |
| `Communication Services` | 50 | Communication Services |
| `Industrials` | 20 | Industrials |
| `Energy` | 10 | Energy |
| `Basic Materials` / `Materials` | 15 | Materials |
| `Utilities` | 55 | Utilities |
| `Real Estate` | 60 | Real Estate |

**Note:** Sector migration requires Rust code to parse JSON and create weighted assignments.

### profile.countries -> regions Taxonomy

**Country name to category ID mapping:**

| Country Name | Category ID |
|-------------|-------------|
| `United States` / `USA` / `US` | country_US |
| `Canada` | country_CA |
| `United Kingdom` / `UK` / `Great Britain` | country_GB |
| `Germany` | country_DE |
| `France` | country_FR |
| `Japan` | country_JP |
| `China` | country_CN |
| `Hong Kong` | country_HK |
| `Australia` | country_AU |
| `Switzerland` | country_CH |
| `Netherlands` | country_NL |
| `Sweden` | country_SE |
| `India` | country_IN |
| `Brazil` | country_BR |
| `South Korea` | country_KR |
| `Taiwan` | country_TW |
| `Mexico` | country_MX |
| `Singapore` | country_SG |
| `Ireland` | country_IE |
| `Spain` | country_ES |
| `Italy` | country_IT |

**Note:** Country migration requires Rust code to:
1. Parse JSON `[{name: "United States", weight: 0.60}, ...]`
2. Match country names (with aliases) to `country_XX` IDs
3. Create weighted assignments (convert decimal weight to basis points)

---

## Risk Assessment

### Low Risk
- Data migration is additive (doesn't delete old data)
- UI changes are progressive (can show both during transition)

### Medium Risk
- Chart components heavily depend on current structure
- Multiple files need coordinated changes

### Mitigations
1. Keep deprecated fields readable during transition
2. Add feature flags if needed for gradual rollout
3. Add comprehensive tests before removing old code

---

## Testing Strategy

### Migration Tests
- [ ] Verify all existing sector data migrates correctly
- [ ] Verify all existing country data migrates correctly
- [ ] Verify asset_class values map to correct taxonomy
- [ ] Verify asset_sub_class values map to correct taxonomy
- [ ] Verify weights are correctly converted to basis points

### UI Tests
- [ ] Asset form shows classification sheet
- [ ] Charts display taxonomy-based allocations
- [ ] Filters work with new category structure
- [ ] Holdings table displays correct types

### Integration Tests
- [ ] End-to-end: create asset, assign categories, view in charts
- [ ] End-to-end: import data with old format, verify migration

---

## Appendix: File Reference

### Backend Files
```
crates/core/src/
├── assets/
│   ├── assets_model.rs         # Asset struct with deprecated fields
│   └── classification_service.rs # NEW: classification service
├── taxonomies/
│   ├── mod.rs
│   ├── taxonomy_model.rs       # Taxonomy, Category, Assignment models
│   ├── taxonomy_service.rs     # Taxonomy CRUD service
│   └── taxonomy_traits.rs      # Service/repository traits
└── portfolio/holdings/
    ├── holding_model.rs        # Instrument with classifications
    └── holding_service.rs      # Build holdings with classifications

crates/storage-sqlite/
├── migrations/
│   └── 2026-01-07-120000_taxonomies/
│       ├── up.sql              # Schema + seed data + migration
│       └── down.sql
├── src/
│   ├── schema.rs               # Diesel schema
│   ├── taxonomies/
│   │   ├── mod.rs
│   │   ├── model.rs
│   │   └── repository.rs
│   └── assets/
│       └── model.rs            # AssetDB struct
```

### Frontend Files
```
src-front/
├── lib/types.ts                # TypeScript interfaces
├── hooks/use-taxonomies.ts     # Taxonomy hooks
├── pages/
│   ├── asset/
│   │   ├── asset-form.tsx      # Asset editing form
│   │   ├── asset-profile-page.tsx
│   │   ├── asset-utils.ts      # Deprecated utilities
│   │   ├── assets-table.tsx    # Assets list
│   │   └── assets-table-mobile.tsx
│   └── holdings/
│       ├── holdings-page.tsx
│       ├── holdings-insights-page.tsx
│       └── components/
│           ├── sectors-chart.tsx
│           ├── country-chart.tsx
│           ├── classes-chart.tsx
│           └── holdings-table.tsx
└── components/classification/
    ├── classification-sheet.tsx    # Main classification UI
    ├── single-select-taxonomy.tsx  # Pill/radio selector
    └── multi-select-taxonomy.tsx   # Tree selector with weights
```
