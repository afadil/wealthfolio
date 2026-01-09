# Consolidated Migration Plan: From Old Assets to Taxonomy System

## Overview

This document outlines a consolidated approach to migrate from the original database schema directly to the final target state. Since the 4 pending migrations are NOT yet in production, we can consolidate them into a cleaner structure.

---

## Current Schema Analysis

### Original Assets Table (Before Migrations)

The `2023-11-08-162221_init_db` migration created the original assets table, with one modification in `2025-03-18-222805_add_amount_field_and_use_decimal` (renamed `comment` to `notes`):

```sql
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT,
    "name" TEXT,
    "asset_type" TEXT,
    "symbol" TEXT NOT NULL,
    "symbol_mapping" TEXT,
    "asset_class" TEXT,        -- LEGACY: to migrate to asset_classes taxonomy
    "asset_sub_class" TEXT,    -- LEGACY: to migrate to type_of_security taxonomy
    "notes" TEXT,              -- renamed from comment
    "countries" TEXT,          -- LEGACY: JSON array, to migrate to regions taxonomy
    "categories" TEXT,         -- LEGACY: unused, can DROP
    "classes" TEXT,            -- LEGACY: unused, can DROP
    "attributes" TEXT,         -- LEGACY: unused, can DROP
    "created_at" DATETIME,
    "updated_at" DATETIME,
    "currency" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,
    "sectors" TEXT,            -- LEGACY: JSON array, to migrate to industries_gics taxonomy
    "url" TEXT
);
```

### 4 Pending Migrations

| Migration | Purpose | Lines |
|-----------|---------|-------|
| `2025-12-14-150000_activity_system_redesign` | Major redesign: new assets schema with profile/metadata JSON, activities redesign | 542 |
| `2026-01-06-000001_quote_schema_refactor` | New quotes table, quote_sync_state table | 135 |
| `2026-01-07-000001_add_finnhub_provider` | Adds Finnhub to market_data_providers | 5 |
| `2026-01-07-120000_taxonomies` | Taxonomy tables + seed data + partial auto-migration | 823 |

### Target Final State

After all migrations, we need:

**1. New assets table:**
```sql
CREATE TABLE assets (
    id TEXT NOT NULL PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT,
    asset_type TEXT NOT NULL DEFAULT 'Security',
    asset_sub_type TEXT,
    symbol_mapping TEXT,
    notes TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    data_source TEXT NOT NULL DEFAULT 'MANUAL',
    data_source_symbol TEXT,
    asset_class TEXT,         -- LEGACY: kept for backward compatibility
    asset_sub_class TEXT,     -- LEGACY: kept for backward compatibility
    profile TEXT,             -- JSON: contains legacy sectors, countries, url
    metadata TEXT,            -- JSON: contains legacy backup
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, data_source)
);
```

**2. Taxonomy tables:**
- `taxonomies` - Classification schemes
- `taxonomy_categories` - Hierarchical categories with parent/child relationships
- `asset_taxonomy_assignments` - Asset-to-category mappings with weights

**3. New quotes system:**
- `quotes` - New schema with composite primary key
- `quote_sync_state` - Tracks sync status per symbol

**4. Market data providers:**
- Includes Finnhub alongside existing providers

---

## Consolidation Strategy

### Option A: Keep 4 Separate Migrations (Recommended)

**Rationale:** Each migration has a distinct purpose and can be tested independently. The migrations are already written and working.

**Action:** Ensure all 4 migrations have complete data migration logic:

1. **`2025-12-14-150000_activity_system_redesign`** - Already handles:
   - Assets table transformation
   - Moving sectors/countries/url into profile JSON
   - Preserving asset_class, asset_sub_class columns

2. **`2026-01-06-000001_quote_schema_refactor`** - Already complete

3. **`2026-01-07-000001_add_finnhub_provider`** - Already complete

4. **`2026-01-07-120000_taxonomies`** - Needs enhancement:
   - Add legacy data backup to metadata.legacy BEFORE creating assignments
   - Add auto-migration for asset_class → asset_classes
   - Add auto-migration for asset_sub_class → type_of_security
   - User-initiated migration for sectors → industries_gics
   - User-initiated migration for countries → regions

### Option B: Consolidate into 2 Migrations

**Rationale:** Reduce migration count, simpler upgrade path.

**Migration 1:** `2025-12-14-150000_activity_and_quotes_redesign`
- Combine activity_system_redesign + quote_schema_refactor + finnhub provider

**Migration 2:** `2026-01-07-120000_taxonomies`
- Keep as-is with full auto-migration

**Downside:** Large, complex migrations are harder to debug.

---

## Recommended Action: Enhance Option A

### Step 1: Verify `2025-12-14-150000_activity_system_redesign`

This migration already does the heavy lifting. Verify it:

1. **Transforms old assets → new assets format:**
```sql
-- Creates new assets table with profile/metadata JSON columns
-- Migrates data from old format:
INSERT INTO assets (id, symbol, name, asset_type, ...)
SELECT
    id,
    symbol,
    COALESCE(name, ''),
    CASE
        WHEN asset_type = 'Stock' THEN 'Security'
        WHEN asset_type = 'ETF' THEN 'Security'
        WHEN asset_type = 'Cryptocurrency' THEN 'Crypto'
        ...
    END,
    ...,
    -- Profile JSON contains sectors, countries, url
    json_object(
        'sectors', sectors,     -- Original JSON string preserved
        'countries', countries, -- Original JSON string preserved
        'url', url
    ),
    ...
FROM assets_old;
```

2. **Preserves asset_class and asset_sub_class columns** (kept for backward compatibility)

### Step 2: Enhance `2026-01-07-120000_taxonomies`

The current migration creates taxonomy tables and seed data. Enhance it to:

**A. Backup legacy data to metadata.legacy FIRST:**

```sql
-- ============================================================================
-- STEP 0: PRESERVE LEGACY DATA IN METADATA (Run BEFORE creating assignments)
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

**B. Auto-migrate asset_class → asset_classes taxonomy:**

```sql
-- ============================================================================
-- STEP 1: AUTO-MIGRATE asset_class TO asset_classes TAXONOMY
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
        ELSE NULL
    END,
    10000, -- 100% weight in basis points
    'migrated'
FROM assets a
WHERE a.asset_class IS NOT NULL
  AND CASE
        WHEN a.asset_class = 'Equity' THEN 'EQUITY'
        WHEN a.asset_class = 'Cash' THEN 'CASH'
        WHEN a.asset_class = 'Commodity' THEN 'COMMODITY'
        WHEN a.asset_class LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN a.asset_class LIKE '%Bond%' OR a.asset_class LIKE '%Debt%' THEN 'DEBT'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'asset_classes'
  );
```

**C. Auto-migrate asset_sub_class → type_of_security taxonomy:**

```sql
-- ============================================================================
-- STEP 2: AUTO-MIGRATE asset_sub_class TO type_of_security TAXONOMY
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
        ELSE NULL
    END,
    10000, -- 100% weight in basis points
    'migrated'
FROM assets a
WHERE a.asset_sub_class IS NOT NULL
  AND CASE
        WHEN a.asset_sub_class = 'Stock' THEN 'STOCK'
        WHEN a.asset_sub_class = 'ETF' THEN 'ETF'
        WHEN a.asset_sub_class = 'Mutual Fund' THEN 'FUND'
        WHEN a.asset_sub_class = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN a.asset_sub_class = 'Cash' THEN 'CASH'
        WHEN a.asset_sub_class LIKE '%Bond%' THEN 'BOND'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'type_of_security'
  );
```

### Step 3: User-Initiated Migration (Sectors & Countries)

Sectors and countries require JSON parsing and fuzzy name matching that SQLite can't handle well. This is handled by the Rust backend with user initiation.

**Already implemented in:**
- `src-tauri/src/commands/taxonomy.rs` - `migrate_legacy_classifications` command
- `src-front/pages/settings/taxonomies/migration-banner.tsx` - UI trigger

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OLD DATABASE                                    │
│                                                                              │
│  assets table:                                                               │
│  ├── asset_class: "Equity"                                                   │
│  ├── asset_sub_class: "Stock"                                                │
│  ├── sectors: '[{"name":"Technology","weight":0.5},...]'                     │
│  └── countries: '[{"name":"United States","weight":0.6},...]'                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           Migration 1: activity_system_redesign                              │
│                                                                              │
│  - Transforms assets table structure                                         │
│  - Moves sectors/countries/url into profile JSON                             │
│  - Keeps asset_class, asset_sub_class columns                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           Migrations 2-3: quote_schema_refactor + finnhub                    │
│                                                                              │
│  - New quotes table structure                                                │
│  - Add Finnhub provider                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           Migration 4: taxonomies                                            │
│                                                                              │
│  1. Create taxonomy tables + seed data                                       │
│  2. Backup legacy data to metadata.legacy                                    │
│  3. AUTO-MIGRATE:                                                            │
│     - asset_class → asset_classes taxonomy (100% weight)                     │
│     - asset_sub_class → type_of_security taxonomy (100% weight)              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           User-Initiated Migration (Rust Backend)                            │
│                                                                              │
│  User clicks "Start Migration" in Settings:                                  │
│  - profile.sectors → industries_gics taxonomy (with weights)                 │
│  - profile.countries → regions taxonomy (with weights)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FINAL STATE                                     │
│                                                                              │
│  assets table:                                                               │
│  ├── profile: {"sectors": [...], "countries": [...]}  (legacy backup)        │
│  ├── metadata: {"legacy": {...}}                       (migration backup)    │
│  └── asset_class, asset_sub_class: (kept for compatibility)                  │
│                                                                              │
│  asset_taxonomy_assignments:                                                 │
│  ├── asset_classes: EQUITY (100%)                                            │
│  ├── type_of_security: STOCK (100%)                                          │
│  ├── industries_gics: TECH (50%), HEALTHCARE (30%), ...                      │
│  └── regions: country_US (60%), country_CA (20%), ...                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Action Items

### 1. Update `2026-01-07-120000_taxonomies/up.sql`

Add the following SQL blocks after the seed data insertion:

```sql
-- ============================================================================
-- PART 7: DATA MIGRATION - PRESERVE LEGACY AND AUTO-MIGRATE
-- ============================================================================

-- Step 0: Backup legacy data to metadata.legacy
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

-- Step 1: Auto-migrate asset_class → asset_classes
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
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE a.asset_class IS NOT NULL
  AND CASE
        WHEN a.asset_class = 'Equity' THEN 'EQUITY'
        WHEN a.asset_class = 'Cash' THEN 'CASH'
        WHEN a.asset_class = 'Commodity' THEN 'COMMODITY'
        WHEN a.asset_class LIKE '%Real Estate%' THEN 'REAL_ESTATE'
        WHEN a.asset_class LIKE '%Bond%' OR a.asset_class LIKE '%Debt%' THEN 'DEBT'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'asset_classes'
  );

-- Step 2: Auto-migrate asset_sub_class → type_of_security
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
        ELSE NULL
    END,
    10000,
    'migrated'
FROM assets a
WHERE a.asset_sub_class IS NOT NULL
  AND CASE
        WHEN a.asset_sub_class = 'Stock' THEN 'STOCK'
        WHEN a.asset_sub_class = 'ETF' THEN 'ETF'
        WHEN a.asset_sub_class = 'Mutual Fund' THEN 'FUND'
        WHEN a.asset_sub_class = 'Cryptocurrency' THEN 'CRYPTO'
        WHEN a.asset_sub_class = 'Cash' THEN 'CASH'
        WHEN a.asset_sub_class LIKE '%Bond%' THEN 'BOND'
        ELSE NULL
      END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_taxonomy_assignments ata
    WHERE ata.asset_id = a.id AND ata.taxonomy_id = 'type_of_security'
  );
```

### 2. Verify Existing Implementation

The following components are already implemented:
- [x] Taxonomy tables and seed data
- [x] `migrate_legacy_classifications` Tauri command
- [x] `get_migration_status` Tauri command
- [x] MigrationBanner component
- [x] Frontend hooks for migration

### 3. Test Migration Path

Test with a database that has legacy data:
1. Run all 4 migrations
2. Verify asset_class/asset_sub_class are auto-migrated
3. Verify metadata.legacy contains backup
4. Test user-initiated sectors/countries migration

---

## Summary

The consolidation strategy is to **enhance the existing 4 migrations** rather than consolidate them:

1. **Keep migrations separate** - easier to test and debug
2. **Add complete auto-migration** - asset_class and asset_sub_class migrate automatically in SQL
3. **Preserve legacy data** - backup to metadata.legacy before migration
4. **User-initiated complex migration** - sectors and countries via Rust backend

This approach ensures:
- Clean upgrade path from original schema to final state
- No data loss (legacy backup preserved)
- Automatic migration where possible
- User control over complex migrations
