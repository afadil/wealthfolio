# Asset Profile & Portfolio Allocation System Design

## Executive Summary

This document addresses three interconnected problems:
1. **Asset Profile Management** - Users need comprehensive tools to edit asset metadata
2. **Look-Through Allocation** - Users need accurate portfolio allocation views that account for the internal composition of diversified funds
3. **Multi-Dimensional Portfolio Analysis** - Users need to slice portfolios by multiple dimensions (asset mix, sectors, countries, risk, accounts)

**Key Design Principles:**
- IDs over labels (always aggregate by stable IDs, never strings)
- Basis points integers for weights (10000 = 100%, no float drift)
- Provenance tracking (as_of_date, source_type, confidence)
- Explicit semantics for incomplete data (no silent normalization)
- Conservative fallbacks (Unclassified over guessing)
- Compute-on-demand (no persistent cache - Rust is fast, React Query handles frontend)

---

## Related Work

### PR #472: Risk Attribute for Assets
**Author:** joostsijm | **Status:** Open | **Link:** https://github.com/afadil/wealthfolio/pull/472

This PR introduces risk classification as a portfolio dimension:
- Adds optional `risk` TEXT column to assets table
- Frontend shows color-coded badges (Low/Medium/High)
- New Risk Categories Card on Performance page with progress bars
- No breaking changes (field is optional)

**How it fits:** Risk is a **single-value dimension** (stored as column), not a weighted dimension. This design focuses on weighted dimensions via the exposure system.

---

## Part 1: Context & Problem Statement

### The User's Pain Point

> "I'd like a way to slice and dice total allocation more... doing 1:1 mapping between security and asset class is wrong for things like target date retirement funds"

A user holding **Vanguard Target Retirement 2050 (VFIFX)** sees their portfolio allocation as:

| Current Display | Reality |
|-----------------|---------|
| 100% Mutual Fund | 54% US Stocks, 36% Intl Stocks, 7% US Bonds, 3% Intl Bonds |

This misrepresentation compounds across a portfolio. A user with $500K in target date funds and $100K in individual stocks has no accurate view of their true stock/bond allocation.

### Why This Matters

1. **Risk Management** - Users can't assess true equity exposure
2. **Rebalancing** - Impossible to rebalance to target allocations
3. **Tax Planning** - Can't optimize asset location without knowing what's inside funds
4. **Retirement Planning** - Age-appropriate allocation requires accurate bond/stock split

---

## Part 2: State of the Art

### Industry Solutions

#### Morningstar X-Ray / Portfolio Manager
- **Approach**: Maintains database of fund holdings, provides "X-Ray" look-through analysis
- **Data Source**: Quarterly fund filings, proprietary database
- **Granularity**: Asset class, sector, geography, stock style (value/growth/blend)
- **Limitation**: Requires Morningstar subscription, data can be 1-3 months stale

#### Empower (Personal Capital)
- **Approach**: Automatic fund classification + manual override
- **Categories**: US Stocks, International, Bonds, Alternatives, Cash
- **Feature**: "You Index" shows personal allocation vs market benchmarks
- **Limitation**: Limited customization of allocation categories

#### Portfolio Visualizer
- **Approach**: User inputs allocation percentages per fund
- **Feature**: Backtest with look-through allocations
- **Limitation**: Manual data entry, no portfolio tracking

#### Kubera / Wealthica
- **Approach**: Simple asset class tagging (single class per asset)
- **Limitation**: No look-through, same problem as current Wealthfolio

### Common Allocation Taxonomies

**Morningstar Asset Allocation:**
```
├── US Stocks
│   ├── Large Cap (Value/Blend/Growth)
│   ├── Mid Cap (Value/Blend/Growth)
│   └── Small Cap (Value/Blend/Growth)
├── International Stocks
│   ├── Developed Markets
│   └── Emerging Markets
├── Bonds
│   ├── US Government
│   ├── US Corporate
│   ├── US Municipal
│   ├── International
│   └── High Yield
├── Alternatives
│   ├── Real Estate
│   ├── Commodities
│   └── Other
└── Cash & Equivalents
```

**Vanguard Simplified:**
```
├── Stocks (Domestic)
├── Stocks (International)
├── Bonds (Domestic)
├── Bonds (International)
├── Short-Term Reserves (Cash)
```

**Bogleheads Three-Fund:**
```
├── Total US Stock Market
├── Total International Stock Market
└── Total Bond Market
```

---

## Part 3: Current Wealthfolio Design

### Data Model

```
Asset
├── asset_class: String          # "Equity", "Fixed Income", "Cash"
├── asset_sub_class: String      # "Mutual Fund", "ETF", "Common Stock"
├── risk: String                 # PR #472: "Low", "Medium", "High"
├── profile: JSON
│   ├── sectors: [{name, weight}]    # Industry breakdown
│   └── countries: [{name, weight}]  # Geographic breakdown
```

### Allocation Calculation

```typescript
// Asset Class Allocation (current)
holdings.reduce((acc, holding) => {
  const assetSubClass = holding.instrument?.assetSubclass || "Other";
  acc[assetSubClass] += holding.marketValue.base;
  return acc;
}, {});
```

**Problem**: Uses `assetSubclass` (vehicle type) not actual asset allocation.

### Current Allocation Views

| View | Data Source | Calculation |
|------|-------------|-------------|
| Asset Class | `asset_sub_class` | Sum by vehicle type |
| Sectors | `profile.sectors` | Weighted sum by sector |
| Countries | `profile.countries` | Weighted sum by country |
| Accounts | Account ID | Sum by account |
| Risk *(PR #472)* | `risk` | Sum by risk level |

### Limitations

1. **No look-through for asset class** - Sectors/countries support weights, but asset class is single-value
2. **Vehicle vs Content confusion** - "Mutual Fund" tells you nothing about allocation
3. **No standard taxonomy** - Free-form text fields, no predefined categories
4. **No provenance** - Can't track where data came from or how fresh it is
5. **Float precision issues** - Weights stored as floats can cause drift
6. **No multi-taxonomy support** - Can't have GICS sectors AND custom sectors
7. **Manual data entry burden** - Users must research and enter all allocation data

---

## Part 3.5: Portfolio Dimension Framework

### Understanding Dimension Types

Portfolio analysis requires slicing data by multiple dimensions. These dimensions fall into two categories:

#### Single-Value Dimensions
Each holding maps to exactly ONE category. Simple aggregation. Stored as columns.

| Dimension | Source | Categories | Calculation |
|-----------|--------|------------|-------------|
| **Account** | `account_id` | User's accounts | `SUM(value) GROUP BY account` |
| **Risk** | `risk` | Low, Medium, High | `SUM(value) GROUP BY risk` |
| **Asset Kind** | `asset_kind` | Security, Crypto, Property... | `SUM(value) GROUP BY kind` |
| **Currency** | `currency` | USD, EUR, GBP... | `SUM(value) GROUP BY currency` |

#### Weighted Dimensions (Look-Through)
Each holding distributes across MULTIPLE categories by weight. Requires weighted aggregation. **Stored in `asset_exposures` table.**

| Dimension | Taxonomy | Categories | Calculation |
|-----------|----------|------------|-------------|
| **Asset Mix** | `wf_asset_mix_v1` | US Stocks, Intl Stocks, Bonds... | `SUM(value × weight_bps / 10000)` |
| **Sectors** | `gics_11_v1` | Technology, Healthcare, Financials... | `SUM(value × weight_bps / 10000)` |
| **Countries** | `country_iso_v1` | USA, Japan, Germany... | `SUM(value × weight_bps / 10000)` |

### The Unified Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PORTFOLIO ANALYSIS DIMENSIONS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SINGLE-VALUE (columns)              WEIGHTED (asset_exposures table)       │
│  ─────────────────────────           ────────────────────────────────       │
│                                                                             │
│  ┌─────────────┐                     ┌─────────────────────────┐            │
│  │   Account   │                     │    Asset Mix            │ ← NEW      │
│  │ ┌─────────┐ │                     │    (wf_asset_mix_v1)    │            │
│  │ │Brokerage│ │ $100K               │ ┌─────────────────────┐ │            │
│  │ │  401k   │ │ $200K               │ │ US Stocks    │ 6000 │ │ (60%)     │
│  │ │  IRA    │ │ $150K               │ │ Intl Stocks  │ 2500 │ │ (25%)     │
│  │ └─────────┘ │                     │ │ Bonds        │ 1000 │ │ (10%)     │
│  └─────────────┘                     │ │ Cash         │  500 │ │ (5%)      │
│                                      │ └─────────────────────┘ │            │
│  ┌─────────────┐                     └─────────────────────────┘            │
│  │    Risk     │ ← PR #472           ┌─────────────────────────┐            │
│  │ ┌─────────┐ │                     │    Sectors              │            │
│  │ │  Low    │ │ $200K               │    (gics_11_v1)         │            │
│  │ │ Medium  │ │ $180K               │ ┌─────────────────────┐ │            │
│  │ │  High   │ │ $70K                │ │ Technology   │ 4000 │ │ (40%)     │
│  │ └─────────┘ │                     │ │ Healthcare   │ 2500 │ │ (25%)     │
│  └─────────────┘                     │ │ Financials   │ 2000 │ │ (20%)     │
│                                      │ │ Other        │ 1500 │ │ (15%)     │
│  ┌─────────────┐                     │ └─────────────────────┘ │            │
│  │ Asset Kind  │                     └─────────────────────────┘            │
│  │ ┌─────────┐ │                     ┌─────────────────────────┐            │
│  │ │Security │ │ $400K               │    Countries            │            │
│  │ │Property │ │ $50K                │    (country_iso_v1)     │            │
│  │ └─────────┘ │                     │ ┌─────────────────────┐ │            │
│  └─────────────┘                     │ │ USA          │ 7000 │ │ (70%)     │
│                                      │ │ Europe       │ 1500 │ │ (15%)     │
│                                      │ │ Asia         │ 1000 │ │ (10%)     │
│                                      │ │ Emerging     │  500 │ │ (5%)      │
│                                      │ └─────────────────────┘ │            │
│                                      └─────────────────────────┘            │
│                                                                             │
│  Weights in BASIS POINTS (bps): 10000 = 100%                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Target Allocation Views (Holdings/Performance Pages)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ALLOCATION VIEWS                                                             │
├───────────┬──────────┬───────────┬─────────┬──────────┬────────┬────────────┤
│ Asset Mix │ Sectors  │ Countries │  Risk   │ Accounts │  Kind  │ [Taxonomy▼]│
│   (NEW)   │          │           │(PR #472)│          │        │            │
├───────────┴──────────┴───────────┴─────────┴──────────┴────────┴────────────┤
│  [Donut chart + breakdown table for selected dimension]                      │
│                                                                              │
│  Coverage: 87% of portfolio │ Stale: 3 assets >90 days │ [Fix Missing Data] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Risk Integration (PR #472)

The risk attribute from PR #472 fits naturally as a single-value dimension:

**Asset Model Addition:**
```rust
pub struct Asset {
    // ... existing fields ...
    pub risk: Option<String>,  // "Low", "Medium", "High" (free-form)
}
```

**Calculation:**
```typescript
// Risk allocation (single-value, like accounts)
function calculateRiskAllocation(holdings: Holding[]): AllocationBreakdown[] {
  const riskMap = new Map<string, number>();

  holdings.forEach((holding) => {
    const risk = holding.instrument?.risk || 'Unclassified';
    const value = holding.marketValue.base;
    riskMap.set(risk, (riskMap.get(risk) || 0) + value);
  });

  return Array.from(riskMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
```

**UI Considerations:**
- Color-coded badges: Low (green), Medium (yellow), High (red)
- Predefined options but allow custom values
- Show in profile edit sheet alongside other classifications

---

## Part 4: Target Design - Data Model

### Goals & Non-Goals

**Goals:**
- Weighted dimensions (look-through) for asset mix / sectors / countries / style / etc
- Deterministic aggregation in SQLite (no float drift)
- Provenance + freshness (as_of, source, confidence)
- Multi-taxonomy support (Morningstar-ish vs simplified vs custom)
- Fast portfolio rollups via cache tables
- Backward-compatible migration from `assets.profile` JSON

**Non-Goals (v1):**
- Full security-master / FIGI mapping pipeline
- Provider ingestion (just support storing provider outputs)
- Derivatives delta-notional exposure (design allows it, v1 can ignore)

### 4.1 Reference Tables

#### ref_dimensions
Defines a conceptual breakdown (sector, country, asset_mix…).

```sql
CREATE TABLE ref_dimensions (
  id              TEXT PRIMARY KEY,              -- 'sector_gics', 'country', 'asset_mix'
  name            TEXT NOT NULL,
  is_weighted     INTEGER NOT NULL DEFAULT 1,    -- 1 for exposures
  basis           TEXT NOT NULL DEFAULT 'market_value',  -- 'market_value'|'notional'|'delta_notional'
  description     TEXT
);
```

#### ref_taxonomies
A taxonomy belongs to a dimension (GICS vs custom sectors; multiple asset-mix taxonomies).

```sql
CREATE TABLE ref_taxonomies (
  id              TEXT PRIMARY KEY,         -- 'gics_11_v1', 'wf_asset_mix_v1', 'vanguard_simple_v1'
  dimension_id    TEXT NOT NULL REFERENCES ref_dimensions(id),
  name            TEXT NOT NULL,
  version         TEXT,
  owner_user_id   TEXT,                     -- NULL for system
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ref_taxonomies_dimension ON ref_taxonomies(dimension_id);
```

#### ref_categories
Stable category IDs + hierarchy + aliases. **Never aggregate by label.**

```sql
CREATE TABLE ref_categories (
  id              TEXT NOT NULL,            -- stable, e.g. 'us_large_cap'
  taxonomy_id     TEXT NOT NULL REFERENCES ref_taxonomies(id),
  parent_id       TEXT,                     -- references (taxonomy_id, id) for hierarchy
  label           TEXT NOT NULL,            -- display only
  sort_order      INTEGER NOT NULL DEFAULT 0,
  aliases_json    TEXT,                     -- JSON array of strings for fuzzy matching
  is_leaf         INTEGER NOT NULL DEFAULT 1,  -- 0 for parent nodes like 'stocks', 'bonds'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (taxonomy_id, id),            -- Composite PK for FK integrity
  FOREIGN KEY (taxonomy_id, parent_id) REFERENCES ref_categories(taxonomy_id, id)
);
CREATE INDEX idx_ref_categories_parent ON ref_categories(taxonomy_id, parent_id);
```

**Note:** `id` is unique within a taxonomy but may repeat across taxonomies (e.g., `us_large_cap` in both `wf_asset_mix_v1` and `vanguard_simple_v1`).

#### ref_source_priority
Configurable source precedence (avoids hardcoding).

```sql
CREATE TABLE ref_source_priority (
  source_type     TEXT PRIMARY KEY,         -- 'manual', 'provider', 'filing', 'community', 'inferred'
  priority        INTEGER NOT NULL,         -- lower = higher priority (1 = highest)
  label           TEXT NOT NULL
);

-- Default seed
INSERT INTO ref_source_priority VALUES
  ('manual', 1, 'Manual Entry'),
  ('provider', 2, 'Data Provider'),
  ('filing', 3, 'Regulatory Filing'),
  ('community', 4, 'Community Contributed'),
  ('inferred', 5, 'Auto-Inferred');
```

### 4.2 Exposure Table

#### asset_exposures
The canonical store for weighted dimension data.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE asset_exposures (
  asset_id        TEXT NOT NULL,   -- references assets.id
  dimension_id    TEXT NOT NULL REFERENCES ref_dimensions(id),
  taxonomy_id     TEXT NOT NULL,
  category_id     TEXT NOT NULL,

  weight_bps      INTEGER NOT NULL,   -- basis points; can exceed 10000 (leverage) or be negative (shorts)
  as_of_date      TEXT NOT NULL,      -- ISO date 'YYYY-MM-DD'
  source_type     TEXT NOT NULL REFERENCES ref_source_priority(source_type),
  source_ref      TEXT,               -- URL, filing id, provider key
  confidence      INTEGER,            -- 0..100
  is_inferred     INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (asset_id, dimension_id, taxonomy_id, category_id, as_of_date, source_type),

  -- Composite FK: category must exist in the specified taxonomy
  FOREIGN KEY (taxonomy_id, category_id) REFERENCES ref_categories(taxonomy_id, id),

  -- Constraints
  CHECK (weight_bps BETWEEN -50000 AND 50000),  -- allows shorts/leverage up to 5x
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  CHECK (length(as_of_date) = 10)               -- basic ISO date format check
);

CREATE INDEX idx_asset_exposures_lookup
  ON asset_exposures(asset_id, dimension_id, taxonomy_id, as_of_date);

CREATE INDEX idx_asset_exposures_dim_tax_date
  ON asset_exposures(dimension_id, taxonomy_id, as_of_date);

-- Trigger: Enforce taxonomy.dimension_id matches exposure.dimension_id
CREATE TRIGGER trg_exposure_dim_matches_tax
BEFORE INSERT ON asset_exposures
BEGIN
  SELECT
    CASE
      WHEN (SELECT dimension_id FROM ref_taxonomies WHERE id = NEW.taxonomy_id) != NEW.dimension_id
      THEN RAISE(ABORT, 'taxonomy_id dimension mismatch: taxonomy does not belong to specified dimension')
    END;
END;

CREATE TRIGGER trg_exposure_dim_matches_tax_update
BEFORE UPDATE ON asset_exposures
BEGIN
  SELECT
    CASE
      WHEN (SELECT dimension_id FROM ref_taxonomies WHERE id = NEW.taxonomy_id) != NEW.dimension_id
      THEN RAISE(ABORT, 'taxonomy_id dimension mismatch: taxonomy does not belong to specified dimension')
    END;
END;

-- NOTE: updated_at is managed in app layer, not via trigger
-- Service sets updated_at = datetime('now') on every write
```

#### Edit Semantics: Replace-All-Items Contract

**Critical:** The PK allows multiple categories per (asset, dimension, taxonomy, as_of, source). Updates must replace the entire set, not incrementally add/delete.

**Write Contract for `PUT /assets/{id}/exposures`:**
```sql
-- Step 1: Delete existing set
DELETE FROM asset_exposures
WHERE asset_id = ?
  AND dimension_id = ?
  AND taxonomy_id = ?
  AND as_of_date = ?
  AND source_type = ?;

-- Step 2: Insert new items
INSERT INTO asset_exposures (
  asset_id, dimension_id, taxonomy_id, category_id,
  weight_bps, as_of_date, source_type, source_ref, confidence, is_inferred
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
-- repeat for each category in items[]
```

**Optional Enhancement:** For auditing/rollback, introduce `asset_exposure_sets`:
```sql
CREATE TABLE asset_exposure_sets (
  id              TEXT PRIMARY KEY,
  asset_id        TEXT NOT NULL,
  dimension_id    TEXT NOT NULL,
  taxonomy_id     TEXT NOT NULL,
  as_of_date      TEXT NOT NULL,
  source_type     TEXT NOT NULL,
  source_ref      TEXT,
  confidence      INTEGER,
  sum_bps         INTEGER NOT NULL,        -- cached sum for quick validation
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_at   TEXT                      -- NULL = current; set when replaced
);

CREATE TABLE asset_exposure_items (
  set_id          TEXT NOT NULL REFERENCES asset_exposure_sets(id),
  category_id     TEXT NOT NULL,
  weight_bps      INTEGER NOT NULL,
  PRIMARY KEY (set_id, category_id)
);
```
This pattern enables draft editing, history, and atomic updates.

### 4.3 Compute-on-Demand Strategy

**No persistent cache tables.** This is a single-user Tauri app - compute allocations on demand.

#### Why Not Persistent Cache?

| Persistent Cache | Compute-on-Demand |
|------------------|-------------------|
| Complex invalidation logic | No invalidation bugs |
| Extra tables to maintain | Simpler schema |
| Stale data risks | Always fresh |
| Overkill for single-user | Right-sized |

#### Performance Strategy

**Backend (Rust):**
- Tight loops with integer bps math → fast computation
- Typical portfolio: 50-200 holdings × 3 dimensions = milliseconds
- Optional: in-memory LRU cache if profiling shows need

**Frontend (React Query):**
- `useQuery` with `staleTime: 30_000` (30s) for allocation views
- Auto-invalidates on mutations (activities, exposures, prices)
- No manual cache management

```typescript
// Frontend query example
const { data: allocation } = useQuery({
  queryKey: ['allocation', dimensionId, taxonomyId, accountId],
  queryFn: () => getPortfolioAllocation({ dimensionId, taxonomyId, accountId }),
  staleTime: 30_000,  // Fresh for 30s
});

// Invalidate on relevant mutations
const createActivityMutation = useMutation({
  mutationFn: createActivity,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['allocation'] });
    queryClient.invalidateQueries({ queryKey: ['holdings'] });
  },
});
```

**Rust Service:**
```rust
/// Compute allocation on demand - no caching needed for single-user
pub fn compute_allocation(
    holdings: &[Holding],
    dimension_id: &str,
    taxonomy_id: &str,
    calc_date: NaiveDate,
) -> AllocationResult {
    let mut buckets: HashMap<String, i64> = HashMap::new();
    let mut coverage_value: i64 = 0;
    let mut complete_value: i64 = 0;
    let mut stale_90d_value: i64 = 0;

    for holding in holdings {
        let value_minor = holding.market_value_minor;
        let exposures = get_resolved_exposures(
            &holding.asset_id, dimension_id, taxonomy_id, calc_date
        );

        if exposures.items.is_empty() {
            // No exposures → Unclassified
            *buckets.entry("unclassified".into()).or_default() += value_minor;
        } else {
            coverage_value += value_minor;
            if exposures.sum_bps == 10000 {
                complete_value += value_minor;
            }
            if exposures.days_old > 90 {
                stale_90d_value += value_minor;
            }

            // Distribute value across categories
            let mut allocated: i64 = 0;
            for (i, item) in exposures.items.iter().enumerate() {
                let alloc = if i == exposures.items.len() - 1 {
                    // Last item gets remainder (deterministic rounding)
                    (value_minor * exposures.sum_bps as i64 / 10000) - allocated
                } else {
                    value_minor * item.weight_bps as i64 / 10000
                };
                *buckets.entry(item.category_id.clone()).or_default() += alloc;
                allocated += alloc;
            }

            // Remainder to unclassified if sum_bps < 10000
            if exposures.sum_bps < 10000 {
                let remainder = value_minor - allocated;
                *buckets.entry("unclassified".into()).or_default() += remainder;
            }
        }
    }

    AllocationResult {
        buckets,
        total_value_minor: holdings.iter().map(|h| h.market_value_minor).sum(),
        coverage_pct: coverage_value * 10000 / total_value_minor,
        complete_pct: complete_value * 10000 / total_value_minor,
        stale_90d_pct: stale_90d_value * 10000 / total_value_minor,
    }
}
```

#### Optional: In-Memory Cache (If Needed)

Only add if profiling shows allocation computation is a bottleneck:

```rust
use lru::LruCache;
use std::sync::Mutex;

lazy_static! {
    static ref ALLOCATION_CACHE: Mutex<LruCache<AllocationKey, AllocationResult>> =
        Mutex::new(LruCache::new(NonZeroUsize::new(100).unwrap()));
}

// Invalidate on any write
pub fn invalidate_allocation_cache() {
    ALLOCATION_CACHE.lock().unwrap().clear();
}
```

### 4.4 Precision Rules

#### Weights
- Store as **basis points (bps)** integers
- 100% = 10000
- Sum semantics:
  - `< 10000`: remainder goes to `Unclassified` (virtual category per taxonomy)
  - `= 10000`: perfect
  - `> 10000`: treat as leverage (surface in UI; **do not normalize silently**)

#### Money
- Store market value in **minor units** (integer cents) at calculation time
- Cache values as `value_minor INTEGER`

### 4.5 Exposure Selection Rules

Given `(asset_id, dimension_id, taxonomy_id, calculation_date)`:

1. Choose exposures with `as_of_date <= calculation_date`
2. Prefer `source_type` by priority from `ref_source_priority` table (lower = better)
3. If multiple same priority: choose max `as_of_date`
4. If still tied: choose max `confidence` (NULL treated as 0)
5. If still tied: choose max `created_at` (deterministic final tie-break)

**SQL Implementation:**
```sql
WITH ranked_exposures AS (
  SELECT
    e.*,
    sp.priority as source_priority,
    ROW_NUMBER() OVER (
      PARTITION BY e.asset_id, e.dimension_id, e.taxonomy_id
      ORDER BY
        sp.priority ASC,                    -- 1. source priority (lower = better)
        e.as_of_date DESC,                  -- 2. most recent as_of_date
        COALESCE(e.confidence, 0) DESC,     -- 3. highest confidence
        e.created_at DESC                   -- 4. deterministic tie-break
    ) as rn
  FROM asset_exposures e
  JOIN ref_source_priority sp ON e.source_type = sp.source_type
  WHERE e.asset_id = ?
    AND e.dimension_id = ?
    AND e.taxonomy_id = ?
    AND e.as_of_date <= ?
)
SELECT * FROM ranked_exposures WHERE rn = 1;
```

**Resolver Output Structure:**
```rust
pub struct ResolvedExposures {
    pub asset_id: String,
    pub dimension_id: String,
    pub taxonomy_id: String,
    pub calculation_date: NaiveDate,

    // Selected source info
    pub selected_source_type: String,
    pub selected_as_of_date: NaiveDate,
    pub selected_confidence: Option<i32>,
    pub selected_source_ref: Option<String>,

    // Items
    pub items: Vec<ExposureItem>,  // category_id, weight_bps
    pub sum_bps: i32,

    // Freshness
    pub is_stale: bool,            // as_of_date older than threshold
    pub days_old: i32,             // calculation_date - as_of_date
}
```

**Optional: Cache resolved exposures for hot path:**
```sql
CREATE TABLE cache_resolved_exposures (
  asset_id          TEXT NOT NULL,
  dimension_id      TEXT NOT NULL,
  taxonomy_id       TEXT NOT NULL,
  calculation_date  TEXT NOT NULL,

  selected_source_type TEXT NOT NULL,
  selected_as_of_date  TEXT NOT NULL,
  selected_confidence  INTEGER,
  sum_bps              INTEGER NOT NULL,
  items_json           TEXT NOT NULL,     -- JSON array of {category_id, weight_bps}

  computed_at          TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (asset_id, dimension_id, taxonomy_id, calculation_date)
);
```

### 4.6 Allocation Calculation Algorithm

**Inputs:** Holdings snapshot H where each holding has:
- `asset_id`
- `market_value_minor` (in base currency)
- optionally `asset_kind` for conservative fallback

**Algorithm (per holding):**

```
For each holding:
  1. Fetch exposure set using Selection Rules
  2. If exposures exist:
     For each exposure row:
       allocated_value_minor += holding_value_minor * weight_bps / 10000
  3. If no exposures:
     Allocate holding to 'Unclassified'
```

**Rounding:**
- Integer division loses pennies
- Compute each bucket via floor division
- Track `remainder = holding_value - sum(allocated)`
- Add remainder to largest weight category for that holding, else Unclassified
- This makes totals **exact and stable**

### 4.7 Entity Relationship Diagram

```
┌──────────────────┐
│  ref_dimensions  │
│  ──────────────  │
│  id (PK)         │◄────────────────────────────────┐
│  name            │                                 │
│  is_weighted     │                                 │
│  basis           │                                 │
└──────────────────┘                                 │
         │                                           │
         │ 1:N                                       │
         ▼                                           │
┌──────────────────┐                                 │
│  ref_taxonomies  │                                 │
│  ──────────────  │                                 │
│  id (PK)         │◄──────────────┐                 │
│  dimension_id    │───────────────┼─────────────────┘
│  name            │               │
│  is_default      │               │
└──────────────────┘               │
         │                         │
         │ 1:N                     │
         ▼                         │
┌──────────────────┐               │
│  ref_categories  │               │
│  ──────────────  │               │
│  id (PK)         │◄──────────────┼─────────────────┐
│  taxonomy_id     │───────────────┘                 │
│  parent_id       │──► (self-ref for hierarchy)    │
│  label           │                                 │
│  aliases_json    │                                 │
└──────────────────┘                                 │
                                                     │
┌──────────────────┐                                 │
│     assets       │                                 │
│  ──────────────  │                                 │
│  id (PK)         │◄────────────────────────────┐   │
│  symbol          │                             │   │
│  risk            │ ← PR #472 (single-value)   │   │
│  ...             │                             │   │
└──────────────────┘                             │   │
                                                 │   │
┌────────────────────────────────────────────────┼───┼───┐
│               asset_exposures                  │   │   │
│  ──────────────────────────────────────────────┼───┼───│
│  asset_id      ────────────────────────────────┘   │   │
│  dimension_id  ────────────────────────────────────┘   │
│  taxonomy_id   ────────────────────────────────────────┤
│  category_id   ────────────────────────────────────────┘
│  weight_bps    (INTEGER, basis points)                 │
│  as_of_date    (provenance)                            │
│  source_type   (manual|provider|filing|community)      │
│  confidence    (0-100)                                 │
└────────────────────────────────────────────────────────┘
```

---

## Part 5: Target Design - UI Components

### 5.1 Classification & Risk Section (Profile Sheet)

```
┌─────────────────────────────────────────────────────────────────┐
│ CLASSIFICATION                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Asset Class      [Equity               ▼]                       │
│ Asset Subclass   [ETF                  ▼]                       │
│                                                                 │
│ Risk Level       ○ Low  ● Medium  ○ High   ○ Custom: [____]    │
│                  ↑ PR #472                                      │
│                                                                 │
│ Custom Tags      [+ Add tag]                                    │
│                  [Growth] [Dividend] [Core Holding]             │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Asset Allocation Editor (Profile Sheet)

```
┌─────────────────────────────────────────────────────────────────┐
│ ASSET ALLOCATION (Look-Through)                [Fetch] [+ Add] │
│ Taxonomy: [Wealthfolio Standard ▼]   As of: [2025-12-31 📅]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ STOCKS                                                   60%    │
│ ├─ US Large Cap      ████████████████░░░░░░░░░░  40%    [×]   │
│ ├─ US Mid Cap        ████░░░░░░░░░░░░░░░░░░░░░░  10%    [×]   │
│ └─ Intl Developed    ████░░░░░░░░░░░░░░░░░░░░░░  10%    [×]   │
│                                                                 │
│ BONDS                                                    35%    │
│ ├─ US Bonds          ██████████████░░░░░░░░░░░░  30%    [×]   │
│ └─ Intl Bonds        ██░░░░░░░░░░░░░░░░░░░░░░░░   5%    [×]   │
│                                                                 │
│ CASH                                                      5%    │
│ └─ Cash & Equiv      ██░░░░░░░░░░░░░░░░░░░░░░░░   5%    [×]   │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│ Total: 10000 bps (100%) ✓                                      │
│ Source: Manual │ Confidence: High                               │
│                                                                 │
│ ⚠️ Sum exceeds 100% - indicates leverage (OK for leveraged ETFs)│
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Taxonomy selector (switch between Wealthfolio Standard, Vanguard Simple, Custom)
- As-of date (default: today or last provider date)
- Source badge (Manual/Provider/Community) with confidence
- Grouped by category type (Stocks/Bonds/Cash/Alternatives)
- Visual progress bars for each allocation
- Running total with validation:
  - `< 10000`: Warning, remainder goes to Unclassified
  - `= 10000`: Perfect ✓
  - `> 10000`: Info, indicates leverage (not an error)
- "Fetch" button to pull from provider (if available)
- Auto-complete from predefined categories

### 5.3 Complete Profile Edit Sheet Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Edit Asset Profile                                         [×] │
│ VFIFX - Vanguard Target Retirement 2050                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ BASIC INFORMATION ─────────────────────────────────────────┐ │
│ │ Display Name    [Vanguard Target Retirement 2050       ]    │ │
│ │ Symbol          VFIFX (read-only)                           │ │
│ │ ISIN            [                                      ]    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ CLASSIFICATION ────────────────────────────────────────────┐ │
│ │ Asset Class     [Equity               ▼]                    │ │
│ │ Asset Subclass  [Mutual Fund          ▼]                    │ │
│ │                                                             │ │
│ │ Risk Level      ○ Low  ● Medium  ○ High  ○ Custom [___]    │ │
│ │                 └─ PR #472                                  │ │
│ │                                                             │ │
│ │ Tags            [Target Date] [Retirement] [+]              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ ASSET ALLOCATION ────────────────────────── [Fetch] [+] ───┐ │
│ │ Taxonomy: [Wealthfolio Standard ▼]  As of: [2025-12-31]    │ │
│ │                                                             │ │
│ │ STOCKS                                               60%    │ │
│ │ ├─ US Large Cap    ████████████████░░░░  40%         [×]   │ │
│ │ ├─ Intl Developed  ████████░░░░░░░░░░░░  20%         [×]   │ │
│ │                                                             │ │
│ │ BONDS                                                40%    │ │
│ │ └─ US Bonds        ████████████████░░░░  40%         [×]   │ │
│ │                                                             │ │
│ │ Total: 10000 bps ✓  │  Source: Manual  │  Confidence: High │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ SECTOR ALLOCATION ────────────────────────────────── [+] ──┐ │
│ │ Taxonomy: [GICS 11 Sectors ▼]                               │ │
│ │ Technology   ████████░░░░  30%    Healthcare  ████░░░░ 15%  │ │
│ │ Financials   ██████░░░░░░  20%    Other       ████████ 35%  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ COUNTRY ALLOCATION ───────────────────────────────── [+] ──┐ │
│ │ Taxonomy: [ISO Countries ▼]                                 │ │
│ │ United States  ████████████████░░  65%                [×]   │ │
│ │ Europe         ████████░░░░░░░░░░  20%                [×]   │ │
│ │ Asia Pacific   ██████░░░░░░░░░░░░  15%                [×]   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ DESCRIPTION ───────────────────────────────────────────────┐ │
│ │ A diversified fund that adjusts allocation as target date   │ │
│ │ approaches...                                               │ │
│ │                                                             │ │
│ │ Notes (Private)                                             │ │
│ │ [My main retirement fund. Check allocation annually.     ]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ LINKS ────────────────────────────────────────────── [+] ──┐ │
│ │ 🔗 Website            https://investor.vanguard.com/...     │ │
│ │ 📊 Fund Prospectus    https://...                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ DATA PROVIDER ─────────────────────────────────────────────┐ │
│ │ Pricing Mode    [Market Data    ▼]                          │ │
│ │ Provider        [Yahoo Finance  ▼]   [Refresh Now]          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                               [Cancel]    [Save Changes]        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Portfolio Allocation View (Holdings Page)

```
┌─────────────────────────────────────────────────────────────────┐
│ PORTFOLIO ALLOCATION                                            │
├───────────┬──────────┬───────────┬─────────┬──────────┬────────┤
│ Asset Mix │ Sectors  │ Countries │  Risk   │ Accounts │  Kind  │
│   (NEW)   │          │           │(PR #472)│          │        │
├───────────┴──────────┴───────────┴─────────┴──────────┴────────┤
│ Taxonomy: [Wealthfolio Standard ▼]                              │
│                                                                 │
│     ┌────────────────────────────────────┐                     │
│     │            DONUT CHART             │                     │
│     │                                    │                     │
│     │    ████  US Stocks      45%        │                     │
│     │    ████  Intl Stocks    25%        │                     │
│     │    ████  US Bonds       20%        │                     │
│     │    ████  Intl Bonds      5%        │                     │
│     │    ████  Cash            5%        │                     │
│     │                                    │                     │
│     └────────────────────────────────────┘                     │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Category           │ Value        │ % of Portfolio         ││
│ ├────────────────────┼──────────────┼────────────────────────┤│
│ │ US Large Cap       │ $245,000     │ ████████████░░  30%    ││
│ │ US Mid Cap         │ $81,667      │ ████░░░░░░░░░░  10%    ││
│ │ US Small Cap       │ $40,833      │ ██░░░░░░░░░░░░   5%    ││
│ │ Intl Developed     │ $163,333     │ ████████░░░░░░  20%    ││
│ │ Emerging Markets   │ $40,833      │ ██░░░░░░░░░░░░   5%    ││
│ │ US Bonds           │ $163,333     │ ████████░░░░░░  20%    ││
│ │ Intl Bonds         │ $40,833      │ ██░░░░░░░░░░░░   5%    ││
│ │ Cash               │ $40,833      │ ██░░░░░░░░░░░░   5%    ││
│ │ ░░ Unclassified    │ $15,000      │ █░░░░░░░░░░░░░   2%    ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Coverage: 87% │ Stale (>90d): 3 assets │ [Review Missing Data] │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Taxonomy selector per weighted dimension
- Coverage metrics:
  - `% holdings_value_with_any_exposure`
  - `% holdings_value_with_sum_bps >= 10000`
  - Stale buckets: exposures older than policy threshold
- "Unclassified" shown distinctly (grayed out)
- "Review Missing Data" opens filtered asset list

### 5.5 Data Quality Metrics

```
┌─────────────────────────────────────────────────────────────────┐
│ DATA QUALITY: Asset Mix                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Coverage        ████████████████████░░░░░  87%                 │
│                 $725,000 of $833,000 has look-through data     │
│                                                                 │
│ Completeness    ████████████████░░░░░░░░░  72%                 │
│                 Holdings where sum_bps = 10000                  │
│                                                                 │
│ Freshness                                                       │
│ ├─ Current (<30d)    ████████████████░░░░  65%                 │
│ ├─ Aging (30-90d)    ████████░░░░░░░░░░░░  22%                 │
│ └─ Stale (>90d)      █████░░░░░░░░░░░░░░░  13%                 │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Needs Attention                                      [Fix]  ││
│ ├─────────────────────────────────────────────────────────────┤│
│ │ VFIFX  │ No exposure data        │ $125,000  │ 15%          ││
│ │ VTI    │ Stale (as of 2025-06-30)│ $80,000   │ 10%          ││
│ │ BND    │ sum_bps = 9500 (95%)    │ $45,000   │ 5%           ││
│ └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 5.6 Quick Record Actions

```
┌─────────────────────────────────────────────────────────────────┐
│ AAPL - Apple Inc.                          [Quick Record ▼]    │
├─────────────────────────────────────────────────────────────────┤
│                                            ┌─────────────────┐  │
│                                            │ 📈 Buy          │  │
│                                            │ 📉 Sell         │  │
│                                            │ 💰 Dividend     │  │
│                                            │ ─────────────── │  │
│                                            │ ✏️  Edit Profile │  │
│                                            └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Quick Buy/Sell Sheet:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Quick Buy: AAPL                                            [×] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Shares        [        10 ]                                    │
│ Price         [$    185.50 ]  [Use Market]                     │
│ Total         $1,855.00                                         │
│                                                                 │
│ Fee           [$      0.00 ]  (optional)                       │
│ Account       [Brokerage IRA        ▼]                         │
│ Date          [Jan 6, 2026          📅]                        │
│                                                                 │
│ Notes         [                      ]  (optional)             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Record Buy]            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 6: API / Service Layer Spec

### 6.1 Read Endpoints

```
GET /dimensions
  → List dimensions + default taxonomies

GET /taxonomies?dimension_id=...
  → List taxonomies for dimension

GET /categories?taxonomy_id=...
  → Category tree for taxonomy

GET /assets/{id}/exposures?dimension_id=&taxonomy_id=&as_of=
  → Resolved exposure set + provenance + sum_bps

GET /holdings/allocation?dimension_id=&taxonomy_id=&scope_type=&scope_id=&as_of=
  → Allocation breakdown + completeness metrics
```

### 6.2 Write Endpoints

```
PUT /assets/{id}/exposures
  payload: {
    dimension_id,
    taxonomy_id,
    as_of_date,
    source_type,
    source_ref,
    confidence,
    items: [{ category_id, weight_bps }]
  }

  validation:
    - category belongs to taxonomy
    - bps in reasonable range
    - sum_bps warning (not error unless enforced)

POST /assets/{id}/exposures/fetch
  → Fetch from provider, store as source_type='provider'
```

### 6.3 Resolution Helper

```rust
fn get_resolved_exposures(
    asset_id: &str,
    dimension_id: &str,
    taxonomy_id: &str,
    as_of: NaiveDate,
) -> ResolvedExposures {
    // Applies selection rules
    // Returns items + metadata + stale indicator
}
```

---

## Part 7: Implementation Plan

### Prerequisites

**Merge PR #472 first** - The risk attribute PR provides:
- Database migration pattern for adding asset fields
- Frontend risk display with color-coded badges
- Risk Categories Card component (can be adapted for other dimensions)

### Phase A: Reference + Exposure Tables

**Database:**
- Create `ref_dimensions`, `ref_taxonomies`, `ref_categories`
- Create `asset_exposures`
- Seed baseline taxonomies/categories

**Service:**
- Add resolver: `get_resolved_exposures(asset_id, dimension_id, taxonomy_id, as_of)`
- Validation service for exposure writes

**Files:**
```
crates/storage-sqlite/src/
├── exposures/
│   ├── mod.rs
│   ├── repository.rs
│   └── model.rs
├── reference/
│   ├── mod.rs
│   ├── dimensions_repository.rs
│   ├── taxonomies_repository.rs
│   └── categories_repository.rs
```

### Phase B: Migration

**One-time migration:**
1. Seed dimensions: `sector_gics`, `country`, `asset_mix`
2. Seed taxonomies: `gics_11_v1`, `country_iso_v1`, `wf_asset_mix_v1`
3. Seed categories from predefined lists + `unclassified`
4. For each asset with `profile.sectors[]`:
   - Map sector name → category_id via alias match
   - Insert into `asset_exposures` with `source_type='manual'`
5. Same for countries
6. Stop using JSON for analytics, keep only for descriptive metadata

### Phase C: Profile Edit UI

**New files:**
```
src-front/pages/asset/components/
├── asset-profile-sheet/
│   ├── asset-profile-sheet.tsx
│   ├── sections/
│   │   ├── basic-info-section.tsx
│   │   ├── classification-section.tsx      # Includes risk (PR #472)
│   │   ├── asset-allocation-section.tsx    # NEW: writes to exposures
│   │   ├── sector-allocation-section.tsx   # Refactored for exposures
│   │   ├── country-allocation-section.tsx  # Refactored for exposures
│   │   ├── description-section.tsx
│   │   ├── links-section.tsx
│   │   └── provider-section.tsx
│   └── hooks/
│       └── use-asset-exposures.ts          # NEW: exposure CRUD
```

**Deliverables:**
- Full-screen sheet component
- Taxonomy selector per dimension
- As-of date input
- Source badge display
- Visual allocation editor with bps
- Validation (sum_bps warnings)

### Phase D: Quick Record Actions

**New files:**
```
src-front/pages/asset/components/
├── quick-actions/
│   ├── quick-action-menu.tsx
│   ├── quick-buy-sheet.tsx
│   ├── quick-sell-sheet.tsx
│   └── quick-dividend-sheet.tsx
```

**Deliverables:**
- Dropdown menu on asset profile page
- Compact sheet forms for buy/sell/dividend
- Pre-filled fields (symbol, market price, default account)
- Success feedback with link to activity

### Phase E: Allocation Views

**Files to modify:**
- `src-front/pages/holdings/components/classes-chart.tsx` → Rename/refactor
- `src-front/pages/holdings/holdings-page.tsx` - Add dimension tabs
- `src-front/pages/performance/performance-page.tsx` - Integrate

**New files:**
```
src-front/pages/holdings/components/
├── allocation-view.tsx           # Generic allocation view
├── allocation-chart.tsx          # Donut + table
├── allocation-completeness.tsx   # Data quality metrics
└── fix-missing-data-dialog.tsx   # Workflow for incomplete data
```

**Deliverables:**
- Unified tab interface for all dimensions
- Taxonomy selector per weighted dimension
- Coverage/completeness metrics computed on-demand
- Stale data indicators
- "Review Missing Data" workflow
- React Query caching with proper invalidation

### Phase F: Provider Hooks (Optional)

**Deliverables:**
- Store provider outputs with `source_type='provider'`
- "Prefer manual" rule (manual > provider)
- Fetch button in UI

---

## Part 8: Seed Data

### Dimensions

| id | name | is_weighted | basis |
|----|------|-------------|-------|
| `asset_mix` | Asset Allocation | 1 | market_value |
| `sector_gics` | GICS Sectors | 1 | market_value |
| `geography` | Geographic Allocation | 1 | market_value |

### Taxonomies

| id | dimension_id | name | is_default |
|----|--------------|------|------------|
| `wf_asset_mix_v1` | asset_mix | Wealthfolio Standard | 1 |
| `vanguard_simple_v1` | asset_mix | Vanguard Simplified | 0 |
| `gics_11_v1` | sector_gics | GICS 11 Sectors | 1 |
| `wf_regions_v1` | geography | Regions + Countries | 1 |

### Categories (wf_asset_mix_v1)

**Parent nodes (is_leaf=0):**

| id | label | parent_id | sort_order | is_leaf |
|----|-------|-----------|------------|---------|
| `stocks` | Stocks | NULL | 1 | 0 |
| `bonds` | Bonds | NULL | 2 | 0 |
| `alternatives` | Alternatives | NULL | 3 | 0 |
| `cash_group` | Cash & Short-Term | NULL | 4 | 0 |

**Leaf nodes (is_leaf=1):**

| id | label | parent_id | sort_order | is_leaf |
|----|-------|-----------|------------|---------|
| `us_large_cap` | US Large Cap | `stocks` | 1 | 1 |
| `us_mid_cap` | US Mid Cap | `stocks` | 2 | 1 |
| `us_small_cap` | US Small Cap | `stocks` | 3 | 1 |
| `intl_developed` | International Developed | `stocks` | 4 | 1 |
| `intl_emerging` | Emerging Markets | `stocks` | 5 | 1 |
| `us_bonds` | US Bonds | `bonds` | 1 | 1 |
| `us_tips` | US TIPS | `bonds` | 2 | 1 |
| `intl_bonds` | International Bonds | `bonds` | 3 | 1 |
| `high_yield` | High Yield Bonds | `bonds` | 4 | 1 |
| `real_estate` | Real Estate / REITs | `alternatives` | 1 | 1 |
| `commodities` | Commodities | `alternatives` | 2 | 1 |
| `crypto` | Cryptocurrency | `alternatives` | 3 | 1 |
| `cash` | Cash & Equivalents | `cash_group` | 1 | 1 |
| `money_market` | Money Market | `cash_group` | 2 | 1 |
| `unclassified` | Unclassified | NULL | 99 | 1 |

**Hierarchy Rollup:** Charts can show leaves (detailed) or parents (summary) via `SUM WHERE parent_id = 'stocks'`

---

## Part 9: Critical Design Decisions

**Lock these early:**

1. **IDs > labels** - Always aggregate by stable IDs, never free-form strings
2. **bps integers for weights** - 10000 = 100%, no float drift
3. **as_of + source in exposures** - Provenance is not optional
4. **Explicit sum_bps semantics** - No silent normalization:
   - `< 10000`: remainder to Unclassified
   - `= 10000`: perfect
   - `> 10000`: leverage (surface in UI)
5. **Conservative fallback** - Prefer Unclassified over guessing
6. **Taxonomy per dimension** - Support multiple classification schemes

### Review Feedback Addressed

| Issue | Fix |
|-------|-----|
| FK can't enforce category↔taxonomy | Composite PK `(taxonomy_id, id)` + composite FK in exposures |
| Dimension↔taxonomy mismatch possible | Trigger `trg_exposure_dim_matches_tax` validates on insert/update |
| "Unclassified" was virtual | Now a real row in every taxonomy (protected in app layer) |
| Edit semantics unclear | Defined replace-all-items contract; optional `asset_exposure_sets` pattern |
| No range constraints | `CHECK` on `weight_bps`, `confidence`, `as_of_date` length |
| Parent categories missing | Seeded `stocks`, `bonds`, `alternatives`, `cash_group` with `is_leaf=0` |
| Country taxonomy misleading name | Renamed to `wf_regions_v1` (Regions + Countries) |
| Selection rules non-deterministic | Added `created_at DESC` as final tie-break; defined resolver output struct |
| Cache complexity overkill | **Removed persistent cache** → compute-on-demand + React Query |
| Risk string drift | Proposed `ref_risk_levels` table or app-layer normalization |
| Migration weight conversion wrong | Fixed: `weight > 1 ? weight*100 : weight*10000` |
| Source priority hardcoded | Added `ref_source_priority` table |
| `updated_at` via trigger | **Removed trigger** → app-layer timestamp management |

---

## Part 10: Data Migration Strategy

### Existing Data Handling

```sql
-- Phase 1: Create new tables (no breaking changes)
-- Phase 2: Migrate existing JSON to exposures

-- Weight conversion: handle mixed formats (0-1 fractions vs 0-100 percentages)
-- Rule: if weight > 1, treat as percentage; else treat as fraction
-- bps = weight > 1 ? round(weight * 100) : round(weight * 10000)

-- For each asset with profile.sectors:
INSERT INTO asset_exposures (
  asset_id, dimension_id, taxonomy_id, category_id,
  weight_bps, as_of_date, source_type, is_inferred
)
SELECT
  a.id,
  'sector_gics',
  'gics_11_v1',
  resolve_category(json_extract(s.value, '$.name')),  -- alias matching via lookup
  -- Normalize weight to bps (handle both 0-1 and 0-100 formats)
  CASE
    WHEN CAST(json_extract(s.value, '$.weight') AS REAL) > 1
    THEN CAST(ROUND(json_extract(s.value, '$.weight') * 100) AS INTEGER)  -- 50 → 5000 bps
    ELSE CAST(ROUND(json_extract(s.value, '$.weight') * 10000) AS INTEGER)  -- 0.5 → 5000 bps
  END,
  date('now'),
  'manual',
  0
FROM assets a,
     json_each(json_extract(a.profile, '$.sectors')) s
WHERE a.profile IS NOT NULL
  AND json_extract(a.profile, '$.sectors') IS NOT NULL;
```

**Category Resolution via Alias Matching:**
```sql
-- resolve_category function (implemented in app layer)
-- 1. Exact match on category.id
-- 2. Case-insensitive match on category.label
-- 3. Fuzzy match on aliases_json array
-- 4. Fallback to 'unclassified'

CREATE TEMP TABLE migration_category_map AS
SELECT
  c.id as category_id,
  c.taxonomy_id,
  lower(c.label) as label_lower,
  c.aliases_json
FROM ref_categories c;

-- Example app-layer resolution:
fn resolve_category(name: &str, taxonomy_id: &str) -> String {
    let name_lower = name.to_lowercase();

    // 1. Exact ID match
    if category_exists(taxonomy_id, &name_lower) {
        return name_lower;
    }

    // 2. Label match
    if let Some(cat) = find_by_label(taxonomy_id, &name_lower) {
        return cat.id;
    }

    // 3. Alias match
    if let Some(cat) = find_by_alias(taxonomy_id, &name_lower) {
        return cat.id;
    }

    // 4. Fallback
    "unclassified".to_string()
}
```

### Validation After Migration

```sql
-- Check migration quality
SELECT
  dimension_id,
  taxonomy_id,
  COUNT(DISTINCT asset_id) as assets_migrated,
  SUM(CASE WHEN category_id = 'unclassified' THEN 1 ELSE 0 END) as unclassified_rows,
  AVG(weight_bps) as avg_weight_bps,
  COUNT(CASE WHEN weight_bps < 0 OR weight_bps > 20000 THEN 1 END) as suspicious_weights
FROM asset_exposures
WHERE source_type = 'manual'
GROUP BY dimension_id, taxonomy_id;
```

### Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| Asset without exposures | Falls back to Unclassified |
| Asset with partial allocation | Shows allocation + Unclassified for remainder |
| Legacy JSON sectors/countries | Migrated to exposures, JSON kept for descriptive metadata only |
| UI edits | Write to exposures table, not JSON |

---

## Part 11: Success Metrics

| Metric | Target |
|--------|--------|
| Look-through coverage | >70% of portfolio value has exposure data |
| Completeness | >60% of holdings have sum_bps = 10000 |
| Freshness | <20% of exposures older than 90 days |
| Quick record adoption | >30% of activities via quick record |
| Profile completeness | Average profile 70%+ complete |

---

## Part 12: Taxonomy Settings UI

### 12.1 Settings Page Structure

New settings section with sidebar navigation for each taxonomy:

```
Settings
├── General
├── Accounts
├── Market Data
├── Appearance
└── Taxonomies (NEW)                    ← Sidebar with + button
    ├── Asset Classes          (active)
    ├── Industries (GICS)
    ├── Asset Allocation
    ├── Regions
    └── Type of Security
```

**Route:** `/settings/taxonomies/:taxonomyId?`

**Files:**
```
src-front/pages/settings/taxonomies/
├── taxonomies-settings.tsx            # Main page with sidebar + tree
├── components/
│   ├── taxonomy-sidebar.tsx           # Left nav with taxonomy list
│   ├── taxonomy-tree.tsx              # Tree view with drag-drop
│   ├── category-node.tsx              # Single tree node
│   ├── category-form-dialog.tsx       # Add/edit category
│   ├── taxonomy-form-dialog.tsx       # Add/edit taxonomy
│   └── color-picker.tsx               # Color selection
└── hooks/
    ├── use-taxonomies.ts
    └── use-categories.ts
```

### 12.2 Tree Component Recommendation

**Best option: [Shadcn Tree View by Mrlightful](https://www.shadcn.io/template/mrlightful-shadcn-tree-view)**

Install via:
```bash
npx shadcn add https://ui.mrlightful.com/r/tree-view
```

Features:
- Built on shadcn/ui design principles
- Expand/collapse with nested data
- Drag-and-drop reordering
- Custom icons per node
- Action buttons per node
- TypeScript + Tailwind CSS

Alternative: [@atlaskit/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop) for more control.

### 12.3 Taxonomy JSON Schema

Based on `/taxonomies/*.json` examples (Portfolio Performance compatible):

```typescript
interface Taxonomy {
  name: string;                    // "Asset Classes", "Industries (GICS)"
  color: string;                   // Hex color "#e1f1fa"
  categories: Category[];          // Recursive tree
  instruments?: InstrumentMapping[]; // Optional: pre-mapped instruments
}

interface Category {
  name: string;                    // Display label
  key: string;                     // Stable ID (e.g., "EQUITY", "10", "K011")
  color: string;                   // Hex color for charts
  description?: string;            // Optional description
  children?: Category[];           // Nested categories (recursive)
}

interface InstrumentMapping {
  identifiers: {
    name?: string;
    ticker?: string;
    isin?: string;
  };
  categories: {
    key: string;                   // Category key
    path: string[];                // Breadcrumb path
    weight: number;                // 0-100 (percentage)
  }[];
}
```

### 12.4 Sidebar + Tree Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAXONOMIES                                                                  │
├───────────────────────┬─────────────────────────────────────────────────────┤
│                       │                                                     │
│ Taxonomies       (+)  │  Asset Classes                         [Edit] [⋮]  │
│ ─────────────────     │  ─────────────────────────────────────────────────  │
│                       │                                                     │
│ ▸ Asset Classes       │  ┌─ Category Tree ──────────────────────────────┐  │
│   Industries (GICS)   │  │                                               │  │
│   Asset Allocation    │  │  ▼ 🟣 Cash                                    │  │
│   Regions             │  │  ▼ 🔵 Equity                                  │  │
│   Type of Security    │  │  ▼ 🟡 Debt                                    │  │
│                       │  │  ▼ 🟠 Real Estate                             │  │
│                       │  │  ▼ 🟢 Commodity                               │  │
│                       │  │                                               │  │
│                       │  │  [+ Add Category]                             │  │
│                       │  └───────────────────────────────────────────────┘  │
│                       │                                                     │
│ ─────────────────     │  ─────────────────────────────────────────────────  │
│ [Import JSON]         │  Drag to reorder • Click to expand • Right-click   │
│                       │  for actions                                        │
└───────────────────────┴─────────────────────────────────────────────────────┘
```

**Deep Hierarchy Example (GICS - 4 levels):**

```
┌─ Industries (GICS) ─────────────────────────────────────────────────────────┐
│                                                                             │
│  ▼ 🟤 Energy (10)                                                          │
│    ▼ Energy (1010)                                                          │
│      ▼ Energy Equipment & Services (101010)                                 │
│        ├─ Oil & Gas Drilling (10101010)                                     │
│        └─ Oil & Gas Equipment & Services (10101020)                         │
│      ▼ Oil, Gas & Consumable Fuels (101020)                                │
│        ├─ Integrated Oil & Gas (10102010)                                   │
│        ├─ Oil & Gas Exploration & Production (10102020)                     │
│        └─ ...                                                               │
│  ▶ 🟢 Materials (15)                                                        │
│  ▶ 🟢 Industrials (20)                                                      │
│  ▶ 🔵 Consumer Discretionary (25)                                           │
│  ▶ 🔵 Consumer Staples (30)                                                 │
│  ▶ 🔵 Health Care (35)                                                      │
│  ▶ 🟣 Financials (40)                                                       │
│  ▶ 🟣 Information Technology (45)                                           │
│  ▶ 🔴 Communication Services (50)                                           │
│  ▶ 🔴 Utilities (55)                                                        │
│  ▶ 🟠 Real Estate (60)                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.5 Tree Node Features

Each node in the tree:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ▼ 🟣 Cash (CASH)                                           [⋮]            │
│    │                                                                        │
│    │  Right-click or [⋮] menu:                                             │
│    │  ┌────────────────────┐                                               │
│    │  │ Edit               │                                               │
│    │  │ Add Child          │                                               │
│    │  │ Duplicate          │                                               │
│    │  │ Change Color       │                                               │
│    │  │ ────────────────── │                                               │
│    │  │ Delete             │                                               │
│    │  └────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Drag-and-Drop:**
- Drag node to reorder within same level
- Drag onto another node to make it a child
- Visual drop indicator shows where item will land

### 12.6 Category Form Dialog

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Edit Category                                                           [×] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Name *              [Cash                                             ]     │
│                                                                             │
│ Key *               [CASH                                             ]     │
│                     Stable identifier (auto-generated, editable)            │
│                                                                             │
│ Color               [🟣 #c437c2 ▼]   ← Color picker                         │
│                                                                             │
│ Description         [Cash and cash equivalents                       ]     │
│                     (optional)                                              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                            [Cancel]    [Save]               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.7 Taxonomy Form Dialog

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ New Taxonomy                                                            [×] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Name *              [My Custom Allocation                            ]      │
│                                                                             │
│ Color               [🔵 #8abceb ▼]   ← Taxonomy header color                │
│                                                                             │
│ Start From          ○ Empty (add categories manually)                       │
│                     ● Copy from: [Asset Classes ▼]                          │
│                     ○ Import JSON file                                      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                            [Cancel]    [Create]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.8 Import/Export

**Import JSON:** Click (+) → Import JSON → Select file → Preview → Confirm

**Export JSON:** Taxonomy [⋮] menu → Export → Downloads `Asset_Classes.json`

**JSON Format:** Compatible with `/taxonomies/*.json` (see 12.3)

### 12.9 API Endpoints

```
# Taxonomies
GET /taxonomies
  → [{ id, name, color, category_count }]

GET /taxonomies/{id}
  → { id, name, color, categories: Category[] }  // Full tree

POST /taxonomies
  { name, color, copy_from_id? }
  → { id, ... }

POST /taxonomies/import
  { json: TaxonomyJSON }
  → { id, ... }

PUT /taxonomies/{id}
  { name?, color? }

DELETE /taxonomies/{id}
  → 400 if has exposures (show count)

GET /taxonomies/{id}/export
  → TaxonomyJSON (file download)

# Categories (tree operations)
POST /taxonomies/{id}/categories
  { name, key, color, parent_key?, description? }

PUT /taxonomies/{id}/categories/{key}
  { name?, color?, description? }

DELETE /taxonomies/{id}/categories/{key}
  → 400 if has children or exposures

POST /taxonomies/{id}/categories/{key}/move
  { new_parent_key?, position: number }

GET /taxonomies/{id}/categories/{key}/usage
  → { exposure_count: number, child_count: number }
```

### 12.10 Settings Navigation

```tsx
// src-front/pages/settings/settings-layout.tsx
const settingsNavItems = [
  { label: 'General', href: '/settings/general', icon: Settings },
  { label: 'Accounts', href: '/settings/accounts', icon: Wallet },
  { label: 'Market Data', href: '/settings/market-data', icon: LineChart },
  { label: 'Appearance', href: '/settings/appearance', icon: Palette },
  { label: 'Taxonomies', href: '/settings/taxonomies', icon: Tags },  // NEW
];
```

---

## Appendix A: Example Fund Allocations (in bps)

### Vanguard Target Retirement 2050 (VFIFX)
```json
{
  "dimension_id": "asset_mix",
  "taxonomy_id": "wf_asset_mix_v1",
  "as_of_date": "2025-12-31",
  "source_type": "manual",
  "items": [
    { "category_id": "us_large_cap", "weight_bps": 3500 },
    { "category_id": "us_mid_cap", "weight_bps": 800 },
    { "category_id": "us_small_cap", "weight_bps": 500 },
    { "category_id": "intl_developed", "weight_bps": 2800 },
    { "category_id": "intl_emerging", "weight_bps": 800 },
    { "category_id": "us_bonds", "weight_bps": 1000 },
    { "category_id": "intl_bonds", "weight_bps": 600 }
  ],
  "sum_bps": 10000
}
```

### Vanguard Total Stock Market (VTI)
```json
{
  "dimension_id": "asset_mix",
  "taxonomy_id": "wf_asset_mix_v1",
  "as_of_date": "2025-12-31",
  "source_type": "manual",
  "items": [
    { "category_id": "us_large_cap", "weight_bps": 7200 },
    { "category_id": "us_mid_cap", "weight_bps": 1800 },
    { "category_id": "us_small_cap", "weight_bps": 1000 }
  ],
  "sum_bps": 10000
}
```

### Individual Stock (AAPL)
```json
{
  "dimension_id": "asset_mix",
  "taxonomy_id": "wf_asset_mix_v1",
  "as_of_date": "2025-12-31",
  "source_type": "inferred",
  "is_inferred": true,
  "items": [
    { "category_id": "us_large_cap", "weight_bps": 10000 }
  ],
  "sum_bps": 10000
}
```

---

## Appendix B: GICS 11 Sectors (gics_11_v1)

| id | label | sort_order |
|----|-------|------------|
| `communication_services` | Communication Services | 1 |
| `consumer_discretionary` | Consumer Discretionary | 2 |
| `consumer_staples` | Consumer Staples | 3 |
| `energy` | Energy | 4 |
| `financials` | Financials | 5 |
| `health_care` | Health Care | 6 |
| `industrials` | Industrials | 7 |
| `information_technology` | Information Technology | 8 |
| `materials` | Materials | 9 |
| `real_estate` | Real Estate | 10 |
| `utilities` | Utilities | 11 |
| `unclassified` | Unclassified | 99 |

---

## Appendix C: Geographic Classification (wf_regions_v1)

**Parent Nodes (is_leaf=0):**

| id | label | parent_id | sort_order |
|----|-------|-----------|------------|
| `north_america` | North America | NULL | 1 |
| `europe` | Europe | NULL | 2 |
| `asia_pacific` | Asia Pacific | NULL | 3 |
| `emerging_markets` | Emerging Markets | NULL | 4 |

**Leaf Nodes (is_leaf=1):**

| id | label | parent_id | sort_order | aliases_json |
|----|-------|-----------|------------|--------------|
| `us` | United States | `north_america` | 1 | `["USA", "United States of America"]` |
| `ca` | Canada | `north_america` | 2 | `["CAN"]` |
| `gb` | United Kingdom | `europe` | 1 | `["UK", "Great Britain"]` |
| `de` | Germany | `europe` | 2 | `["DEU"]` |
| `fr` | France | `europe` | 3 | `["FRA"]` |
| `ch` | Switzerland | `europe` | 4 | `["CHE"]` |
| `nl` | Netherlands | `europe` | 5 | `["NLD", "Holland"]` |
| `jp` | Japan | `asia_pacific` | 1 | `["JPN"]` |
| `au` | Australia | `asia_pacific` | 2 | `["AUS"]` |
| `hk` | Hong Kong | `asia_pacific` | 3 | `["HKG"]` |
| `sg` | Singapore | `asia_pacific` | 4 | `["SGP"]` |
| `cn` | China | `emerging_markets` | 1 | `["CHN", "PRC"]` |
| `in` | India | `emerging_markets` | 2 | `["IND"]` |
| `br` | Brazil | `emerging_markets` | 3 | `["BRA"]` |
| `tw` | Taiwan | `emerging_markets` | 4 | `["TWN"]` |
| `kr` | South Korea | `emerging_markets` | 5 | `["KOR", "Korea"]` |
| `unclassified` | Unclassified | NULL | 99 | NULL |

---

## Appendix D: PR #472 Integration Details

### PR #472 Summary: Risk Attribute for Assets

**GitHub:** https://github.com/afadil/wealthfolio/pull/472

#### What It Adds

1. **Database Schema:**
   ```sql
   ALTER TABLE assets ADD COLUMN risk TEXT;
   ```

2. **Backend Models:**
   - `Asset.risk: Option<String>`
   - `Instrument.risk: Option<String>`
   - `UpdateAssetProfile.risk: Option<String>`

3. **Frontend Components:**
   - Risk input field on asset profile page
   - Color-coded badges (Low=green, Medium=yellow, High=red)
   - `RiskCategoriesCard` on Performance page

#### Integration Points

| This Design | PR #472 |
|-------------|---------|
| Profile Edit Sheet → Classification Section | Uses `risk` field |
| Holdings Page → Risk Tab | Adapts `RiskCategoriesCard` pattern |
| Unified dimension framework | Risk as single-value dimension |

#### Component Reuse

**From PR #472:**
```tsx
// RiskCategoriesCard pattern - can be adapted for all dimensions
<Card>
  <CardHeader>Risk Distribution</CardHeader>
  <CardContent>
    {categories.map(cat => (
      <div key={cat.name}>
        <span>{cat.name}</span>
        <Progress value={cat.percentage} />
        <span>{formatMoney(cat.value)}</span>
      </div>
    ))}
  </CardContent>
</Card>
```

**Generalized for Asset Mix:**
```tsx
// Same pattern, different dimension
<AllocationCard
  title="Asset Allocation"
  dimensionId="asset_mix"
  taxonomyId={selectedTaxonomy}
  data={allocationData}
  colorScheme="category"
/>
```

#### Recommended Merge Order

1. **Merge PR #472** - Establishes risk attribute pattern
2. **Phase A** - Reference + exposure tables
3. **Phase B** - Migration from JSON
4. **Phase C** - Profile Edit Sheet with exposures
5. **Phase D-G** - Remaining phases

---

## Appendix E: Risk Classification Guidelines

### The Free-Form String Problem

PR #472 uses `risk TEXT` which will drift: `High`, `high`, `HIGH`, `Speculative`, etc.

**Option A: Enforce via Reference Table (Recommended)**
```sql
CREATE TABLE ref_risk_levels (
  id          TEXT PRIMARY KEY,   -- 'low', 'medium', 'high'
  label       TEXT NOT NULL,
  color_token TEXT NOT NULL,      -- 'success', 'warning', 'destructive'
  sort_order  INTEGER NOT NULL
);

INSERT INTO ref_risk_levels VALUES
  ('low', 'Low', 'success', 1),
  ('medium', 'Medium', 'warning', 2),
  ('high', 'High', 'destructive', 3);

-- Assets table
ALTER TABLE assets ADD COLUMN risk_id TEXT REFERENCES ref_risk_levels(id);
ALTER TABLE assets ADD COLUMN risk_custom_label TEXT;  -- for "Speculative", etc.
```

**Option B: Validate in App Layer (Simpler)**
- Keep `risk TEXT` column
- App-layer validation: lowercase and match against allowed values
- Store normalized: `low`, `medium`, `high`, or custom
- UI shows badge based on prefix match

### Standard Risk Levels

| id | label | color_token | Typical Assets |
|----|-------|-------------|----------------|
| `low` | Low | success (green) | Government bonds, money market, CDs, savings |
| `medium` | Medium | warning (yellow) | Corporate bonds, balanced funds, large cap stocks |
| `high` | High | destructive (red) | Small cap, emerging markets, crypto, options |

### User-Defined Risk

If using Option A:
- Standard values via `risk_id`
- Custom labels via `risk_custom_label` (e.g., "Speculative", "Core", "Satellite")
- Display: `risk_custom_label ?? ref_risk_levels.label`

If using Option B:
- Allow any string but suggest standard values in UI
- Normalize common variants: `High` → `high`, `HIGH` → `high`

### Auto-Inference (Future)

```rust
fn infer_risk(asset: &Asset) -> String {
    match asset.kind {
        AssetKind::Cash => "low",
        AssetKind::Crypto => "high",
        _ => {
            let sub = asset.asset_sub_class.as_deref().unwrap_or("");
            if sub.contains("Bond") || sub.contains("Treasury") {
                "low"
            } else if sub.contains("Emerging") || sub.contains("Small Cap") {
                "high"
            } else {
                "medium"
            }
        }
    }.to_string()
}
```
