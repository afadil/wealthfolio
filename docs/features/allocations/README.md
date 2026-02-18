# Allocations Feature — Master Plan

**Branch**: `feature/allocation-targets`
**Base**: `v3.0.0-beta.5`
**Date**: February 2026
**Status**: 
- ✅ Section 0: Backend complete
- ✅ Section 1: Category-level targets + UI complete
- ✅ Section 2: Per-holding targets complete
- ✅ Section 3: Rebalancing advisor complete

---

## Overview

The Allocations feature lets users set target allocation percentages, compare them against current holdings, and get rebalancing advice. It builds on the beta's taxonomy system (hierarchical categories with weighted assignments) rather than the old hardcoded `asset_class` / `asset_sub_class` fields.

### What exists in beta already (not ours to build)

- Taxonomy system: 5 system taxonomies + custom, hierarchical categories,
  weighted assignments (basis points)
- Current allocation engine: `get_portfolio_allocations()` returns breakdowns
  by all taxonomies
- Visualization components: `DrillableDonutChart`, `SegmentedAllocationBar`,
  `CompactAllocationStrip`, `SectorsChart`, `AllocationDetailSheet`
- Holdings insights page at `/holdings-insights` (read-only current allocation)
- AccountSelector component (single account or "All Portfolio")

### What we're building

- Target allocation profiles per account (or "All Portfolio")
- Two-level cascading targets: category-level → per-holding within category
- Visual comparison: two-ring donut chart (target vs current)
- Deviation tracking with color-coded indicators
- Rebalancing advisor (cash-first: "where to invest $10k")
- Lock mechanism at both category and holding level
- Auto-distribution for unset targets (preview mode only, no strict mode)

---

## Architecture Decisions

### D1: Taxonomy-based targets (not hardcoded asset classes)

Targets reference `taxonomy_categories` via `category_id`. Initially scoped to
`asset_classes` taxonomy only (single-select, clean math). `regions` deferred
(multi-select, cross-dependency issues).

### D2: Separate tables from taxonomy system

Taxonomies describe "what is" (descriptive). Targets describe "what should be"
(prescriptive). Separate `portfolio_targets` + `portfolio_target_allocations`
tables reference taxonomy categories without modifying taxonomy tables.

### D3: Preview mode only (no strict mode)

Auto-distribute unset holding targets proportionally by current market value.
No strict validation requiring exact 100% sum. Simpler UX, simpler code.
Strict mode was dropped from scope.

### D4: Per-account targets with existing AccountSelector

Each account gets its own target profile. "All Portfolio" uses global targets.
The existing `AccountSelector` component handles account switching. Full
multi-account portfolio grouping (named combos of 2+ accounts) is a separate
feature — see `docs/features/portfolios/portfolio-grouping-spec.md`.

### D5: Manual target setup (no auto-create)

**IMPLEMENTED:** Targets start at 0% by default when user first views an account. 
The strategy switches to "auto-balancing" mode only when the user manually sets 
the first target percentage. This gives users explicit control over when allocation 
tracking begins, avoiding confusion from auto-generated targets.

### D6: Inline editing (no side panel for Section 1)

**IMPLEMENTED:** Category-level targets are edited directly inline in the overview 
table with text inputs. Side panel (Sheet component) will be used only in Section 2 
for per-holding target editing within a category.

### D7: Single donut + side-by-side bars (updated design)

**IMPLEMENTED:** 
- **Single donut chart** showing current allocation only (no outer target ring)
- **Side-by-side bars** showing actual vs target percentages for comparison
- **Drift indicators**: Badges show "Underweight -X%" / "Overweight +X%" for 
  categories drifting >5% from target (threshold configurable)
- **Default center label**: Shows "TOTAL PORTFOLIO" with formatted total value
- **Hover state**: Donut center dynamically shows:
  - Category name
  - **Percentage in bold** (e.g., 95%)
  - Actual monetary value (calculated from percentage × total)
  - Drift status (Aligned/Underweight/Overweight) with colored icon
- **Component**: `AllocationDonut` (renamed from `TwoRingDonut`)

The two-ring donut was found to be visually unclear. The simplified design with 
single donut + comparison bars provides better clarity. Hover interaction makes 
the chart more informative without visual clutter.

### D8: Text inputs for editing (no drag sliders)

Read-only progress bars for visual feedback. Text inputs for setting target
percentages (faster, more precise). Drag sliders dropped.

### D9: Batch save (not per-row mutations)

"Save All" button collects all changed allocations and saves in one batch
(Promise.all with single toast). No per-row auto-save spam.

---

## Database Schema (already migrated)

```sql
CREATE TABLE portfolio_targets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL,       -- account UUID or "PORTFOLIO"
    taxonomy_id TEXT NOT NULL,      -- "asset_classes" initially
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (taxonomy_id) REFERENCES taxonomies(id)
);

CREATE TABLE portfolio_target_allocations (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL,
    category_id TEXT NOT NULL,      -- references taxonomy_categories.id
    target_percent INTEGER NOT NULL, -- basis points (6000 = 60.00%)
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (target_id) REFERENCES portfolio_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES taxonomy_categories(id)
);
```

**Future (Section 2)**: `holding_targets` table for per-holding percentages
within a category, referencing `portfolio_target_allocations.id`.

---

## What's Already Built (Section 0)

### Backend (Rust) — complete

- `crates/core/src/portfolio/targets/` — models, traits, service, deviation
  calculator
- `crates/core/src/portfolio/rebalancing/` — rebalancing models, service, unit tests
- `crates/storage-sqlite/src/portfolio/targets/` — Diesel repository
- `apps/tauri/src/commands/portfolio_targets.rs` — 15 Tauri IPC commands
- `apps/server/src/api/portfolio_targets.rs` — Axum REST routes
- Migrations: `2026-02-11` (targets), `2026-02-13` (FK fix), `2026-02-15` (holding_targets)
- Deviation calculator composes `AllocationService` for current state, compares
  against target percentages per category

### Frontend — complete

- Types in `lib/types.ts`: PortfolioTarget, TargetAllocation, AllocationDeviation,
  DeviationReport, HoldingTarget, RebalancingPlan, etc.
- Schema in `lib/schemas.ts`: newPortfolioTargetSchema
- Query keys in `lib/query-keys.ts`: PORTFOLIO_TARGETS, TARGET_ALLOCATIONS,
  ALLOCATION_DEVIATIONS, HOLDING_TARGETS
- Adapters in `adapters/shared/portfolio-targets.ts`: 15 adapter functions
- Web COMMANDS map entries in `adapters/web/core.ts`
- Hooks in `hooks/use-portfolio-targets.ts`
- Mutations in `pages/allocations/use-target-mutations.ts`
- Page + all components in `pages/allocations/` — fully implemented
- Route at `/allocations` in `routes.tsx`
- Nav entry in `app-navigation.tsx`

---

## Section 1: Category-Level Targets + Overview Tab

**Status**: ✅ COMPLETE

**Goal**: A working, polished allocations page with category-level targets,
single donut visualization, and deviation tracking.

### Implementation Summary

**Completed Features**:
- ✅ Single donut chart showing current allocation with enhanced hover details
- ✅ Inline target editing with side-by-side comparison bars
- ✅ Drift indicators (Underweight/Overweight/Aligned)
- ✅ Auto-distribution for unlocked categories (preview mode)
- ✅ Lock mechanism to prevent auto-balancing
- ✅ Batch save with validation
- ✅ "Clear All" functionality
- ✅ 2-decimal precision for all percentages
- ✅ Empty field support during editing

**Key Behaviors**:
- Auto-distribution triggers only when user actively edits targets
- Locked categories maintain their values during auto-distribution
- User-set edits (marked with `userSet` flag) are preserved
- Total validation ensures allocations don't exceed 100%
- Lock works on both saved allocations and pending edits

### UI Layout

Two-column layout: donut chart on the left, category list on the right.

```
┌───────────────────────────────────────────────────────────────┐
│                                     [Account: All Portfolio ▼]│
│                                                               │
│  ┌─ OVERVIEW ─────────┐  ┌─ REBALANCING ────────────────────┐│
│  │ (active)            │  │ (Section 3)                      ││
│  └─────────────────────┘  └──────────────────────────────────┘│
│                                                               │
│  ┌──────────────────────┬────────────────────────────────────┐│
│  │                      │                                    ││
│  │  Single Donut        │  Target List (inline editing)      ││
│  │  (Current Only)      │                                    ││
│  │                      │  ● Equity                          ││
│  │    ╭────────────╮    │    Target  [60]%  Actual 55%      ││
│  │   ╱              ╲   │    ████████████░░░  Underweight   ││
│  │  │                │  │                                    ││
│  │  │  TOTAL         │  │  ● Fixed Income                    ││
│  │  │  PORTFOLIO     │  │    Target  [30]%  Actual 35%      ││
│  │  │  $XXX,XXX      │  │    ██████░░░░░░░░░  Overweight    ││
│  │   ╲              ╱   │                                    ││
│  │    ╰────────────╯    │  ● Cash                            ││
│  │                      │    Target  [10]%  Actual 10%      ││
│  │  Hover: show         │    ███░░░░░░░░░░░░  Aligned       ││
│  │  category details    │                                    ││
│  │  + drift status      │  ● Real Estate                     ││
│  │                      │    Target  [0]%   Actual 0%       ││
│  │                      │    ░░░░░░░░░░░░░░░  Not Set       ││
│  │                      │                                    ││
│  │                      │  [Clear All]                       ││
│  └──────────────────────┴────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

**Layout**: Side-by-side comparison bars for each category (actual vs target).
Text inputs for inline editing of target percentages.
Drift indicators show underweight/overweight status when >5% deviation.

### Components to build/rework

| Component | Action | Description |
|-----------|--------|-------------|
| `allocations-page.tsx` | **Rewrite** | Two-tab layout (Overview, Rebalancing), AccountSelector |
| `allocation-donut.tsx` | **New** | Single-ring donut showing current allocation with hover details, recharts |
| `target-list.tsx` | **New** | Inline editing rows with side-by-side bars, target inputs, drift indicators |
| `target-form.tsx` | **Remove** | No longer needed (inline editing) |
| `allocation-editor.tsx` | **Remove** | Replaced by target-list |
| `deviation-table.tsx` | **Remove** | Replaced by target-list (deviation shown inline) |

### Data flow

1. Page loads → fetch `portfolio_targets` for selected account
2. If no target exists → empty state ("Set your first allocation target")
3. If target exists → fetch taxonomy categories + target allocations + deviation report
4. Render donut (current allocation only) with hover details
5. Render target list with inline editing (side-by-side bars)
6. Edit % → local state update
7. Click "Save All" → batch upsert all changed allocations
8. On save success → invalidate queries, donut + list refresh

### Auto-create logic

```
User selects account → check if PortfolioTarget exists for account
  If no → show empty state with "Start setting targets" CTA
  On first % entry → auto-create PortfolioTarget with:
    name: "{Account Name} Allocation"
    accountId: selected account ID
    taxonomyId: "asset_classes"
    isActive: true
  Then upsert the allocation
```

### Verify

- ✅ `pnpm type-check` passes
- ✅ `pnpm tauri dev` or `pnpm run dev:web` — page loads, donut renders
- ✅ Can set category target % inline, save all, see deviation update
- ✅ Drift indicators show correctly (underweight/overweight/aligned)
- ✅ Donut hover shows category details with drift status
- ✅ Account switching works, shows different targets per account
- ✅ "All Portfolio" view works
- ✅ "Clear All" button clears all targets
- ✅ Auto-distribution works correctly when editing targets
- ✅ Lock prevents auto-distribution and persists across sessions
- ✅ Lock works on auto-distributed values (captures current value)
- ✅ 2-decimal precision throughout UI
- ✅ Remaining percentage calculates correctly with auto-distribution

---

## Section 2: Per-Holding Targets

**Status**: ✅ COMPLETE

### Overview

Allows users to drill down into a category (e.g., "Equity") and set granular 
allocation targets for individual holdings (e.g., VTI, VOO, VXUS) within that category.

### User Flow

1. Click on category row (e.g., "Equity 70%") in target list
2. Side panel opens showing category target vs actual recap (bars)
3. List of holdings in that category with editable target percentages
4. Set targets manually or rely on auto-distribution
5. Lock specific holdings to prevent auto-adjustment
6. Click "Save All" to commit changes

### Key Features

- **Auto-Distribution**: Unlocked holdings automatically split remaining percentage proportionally
- **Lock Mechanism**: Lock specific holdings to preserve targets when category % changes
- **Visual Feedback**: Italic/muted style for auto-calculated vs user-set values
- **Validation**: Blocks save if total allocation > 100%
- **Cascading Display**: Shows both category % and portfolio % (e.g., "50% of Equity = 35% of portfolio")

### Design Decisions (Approved)

- **Schema**: Migration changes `holding_targets.asset_class_id` → `allocation_id` (FK to `portfolio_target_allocations`)
- **UI**: Simple bars + category recap (no sub-donut)
- **Mode**: Preview mode only with auto-distribution algorithm
- **Component**: Sheet slide-in panel (reusing existing pattern)
- **Save**: Batch save with single "Save All" button

**Goal**: Within each asset class category, set target percentages for
individual holdings. Cascading: holding % × category % = portfolio %.

### Backend additions

New table:

```sql
CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY NOT NULL,
    allocation_id TEXT NOT NULL,     -- FK to portfolio_target_allocations.id
    asset_id TEXT NOT NULL,          -- FK to assets.id (UUID, not symbol)
    target_percent_of_category INTEGER NOT NULL, -- basis points
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (allocation_id) REFERENCES portfolio_target_allocations(id) ON DELETE CASCADE,
    UNIQUE(allocation_id, asset_id)
);
```

New service methods (implemented):
- `get_holding_targets_by_allocation(allocation_id)` → Vec<HoldingTarget>
- `upsert_holding_target(target)` → HoldingTarget
- `batch_save_holding_targets(targets)` → Vec<HoldingTarget> — atomic DB transaction
- `delete_holding_target(id)` → usize
- `delete_holding_targets_by_allocation(allocation_id)` → usize

New Tauri commands: `get_holding_targets`, `upsert_holding_target`, `batch_save_holding_targets`, `delete_holding_target`.
Axum routes: GET `/allocations/{id}/holdings`, POST `/holdings`, POST `/holdings/batch`, DELETE `/holdings/{id}`.

### Frontend additions

Side panel (Sheet) for per-holding targets within a category:

```
┌──────────────────────────────────────┐
│ Equity — Target: 60% of Portfolio    │
│ Current: 55%    Drift: -5% Under     │
│──────────────────────────────────────│
│ Holdings Breakdown:                  │
│                                      │
│ Equity ETF (3 holdings)              │
│                                      │
│ VTI                            🔒   │
│ Current 55% → Target [50]%           │
│ ████████████░░░░░                    │
│                                      │
│ VOO                                  │
│ Current 30% → Target [30]%           │
│ ████████░░░░░░░░░                    │
│                                      │
│ VXUS                                 │
│ Current 15% → Target *20%*           │ ← italic = auto-distributed
│ ████░░░░░░░░░░░░░                    │
│                                      │
│ Total: 100% ✓                        │
│ [Save All Targets]                   │
└──────────────────────────────────────┘
```

New components (implemented):
- `category-side-panel.tsx` — Sheet component with inline editing, auto-distribution,
  lock mechanism, cascaded % display, batch save, and group collapsing.
- `holding-target-row.tsx` — Per-holding row component (extracted from side panel).

### Auto-distribution logic (preview mode)

When user sets targets for some holdings but not all:
1. Sum user-set targets (respecting locks)
2. Remainder = 100% - sum of user-set
3. Distribute remainder proportionally by current market value among unset holdings
4. Display auto-distributed values in italic/muted style
5. "Save All Targets" commits everything (user-set + auto-distributed)

### Cascading calculation

```
Portfolio total target for VTI:
  = VTI target % of Equity × Equity target % of portfolio
  = 50% × 60% = 30% of total portfolio

Deviation:
  = current portfolio % - cascaded target %
  = 28% - 30% = -2% (underweight)
```

### Verify

- ✅ Can set per-holding targets within a category
- ✅ Auto-distribution fills unset holdings
- ✅ Lock prevents auto-adjustment
- ✅ Cascading % displayed correctly
- ✅ Save All Targets works (parallel upserts)
- ✅ Deviation report reflects per-holding targets

---

## Section 3: Rebalancing Advisor

**Goal**: Cash-first rebalancing tab. User enters available cash, system
suggests what to buy to align with targets.

**Status**: Ready to implement. Adapting proven UI from `allocations/phase-4`
branch, moving calculation logic from frontend to Rust backend.

### Context

An earlier implementation existed in `allocations/phase-4` with working UI and
frontend-only calculations. Key adaptations needed:
- **Old**: Free-text `asset_class` labels → **New**: Taxonomy-based `category_id`
- **Old**: Three-table hierarchy → **New**: Two-table (portfolio_targets →
  target_allocations → holding_targets)
- **Old**: Frontend calculations → **New**: Rust backend for testability

### UI (second tab)

Tab structure (already wired in `allocations-page.tsx`):
```typescript
<Tabs value={activeTab}>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="rebalancing">Rebalancing</TabsTrigger>  // ← Section 3
  </TabsList>
</Tabs>
```

Layout:
```
┌──────────────────────────────────────────────────────┐
│  REBALANCING SUGGESTIONS                             │
│                                                      │
│  Current Portfolio Value: $125,430                   │
│                                                      │
│  Available Cash: [$_________]  [Calculate]           │
│                                                      │
│  [Overview] [Detailed]  ☐ Show zero-share holdings   │
│                                                      │
│  ┌─ Overview Mode ───────────────────────────────┐  │
│  │ EQUITY                    Target 60% | Actual 45%│
│  │ Suggested Buy: $12,500    New: 55%              │
│  │                                                  │
│  │ FIXED_INCOME              Target 40% | Actual 55%│
│  │ Suggested Buy: $0         New: 45%              │
│  └──────────────────────────────────────────────────┘
│                                                      │
│  ┌─ Detailed Mode ─────────────────────────────────┐
│  │ ▼ EQUITY                                         │
│  │   VTI   12 shares × $245 = $2,940  (20%→24%)   │
│  │   VOO    8 shares × $420 = $3,360  (15%→18%)   │
│  │                                                  │
│  │ ▼ FIXED_INCOME                                   │
│  │   BND    0 shares × $72  = $0      (40%→40%)   │
│  └──────────────────────────────────────────────────┘
│                                                      │
│  Total Allocated: $6,300 of $10,000                  │
│  Remaining: $3,700                                   │
│  Additional Cash Needed: $24,100                     │
│                                                      │
│  [Copy as Text]  [Download CSV]                      │
└──────────────────────────────────────────────────────┘
```

Key UI elements:
- **Cash input**: Number input with validation
- **Calculate button**: Triggers backend calculation
- **View toggle**: Overview (category-level) vs Detailed (per-holding)
- **Category cards** (Overview): Show target/current/projected, color-coded bars
- **Holdings table** (Detailed): Grouped accordion by category
- **Summary row**: Total allocated, remaining, additional needed
- **Export actions**: Copy to clipboard, download CSV
- **Zero-share toggle**: Show/hide holdings with 0 shares recommended

### Algorithm (cash-first, buy-only)

Implemented in Rust backend (`RebalancingService`). Complete 4-step process:

**Step 1: Calculate category-level shortfalls**
```rust
new_portfolio_total = current_total + available_cash

for each category in target_allocations:
    target_value = (category.target_percent / 100) * new_portfolio_total
    current_value = (deviation.current_percent / 100) * current_total
    shortfall = max(0, target_value - current_value)  // buy-only, never sell
```

**Step 2: Scale budgets if cash insufficient**
```rust
total_shortfall = sum(all category shortfalls)

scale_factor = if total_shortfall > available_cash {
    available_cash / total_shortfall  // proportional scaling
} else {
    1.0  // enough cash for all shortfalls
}

category_budgets = HashMap<category_id, shortfall * scale_factor>
```

**Important**: `category_budgets` are stored in `RebalancingPlan.category_budgets` 
and returned to frontend. This enables accurate residual calculation:
```rust
residual_per_category = category_budget - sum(actual_spending_in_category)
```

**Step 3: Per-holding shortfall calculation with percentage tracking**
```rust
for each category with budget > 0:
    holdings = get_holdings_by_allocation(account, taxonomy, category)
    holding_targets = get_holding_targets(category.allocation_id)
    
    // SPECIAL CASE: Categories without holding targets (e.g., Cash)
    if holding_targets.is_empty():
        // Still allocate budget, create category-level recommendation
        recommendations.push(TradeRecommendation {
            asset_id: category_id,
            symbol: category_id,
            name: category_name,
            shares: 0,  // No specific holding to buy
            total_amount: category_budget,  // Show allocated amount
            // ... other fields zero/default
        })
        continue  // Skip to next category
    
    // Calculate total category current value for percentage calculations
    category_current_value = sum(holdings.map(|h| h.market_value))
    
    for each holding_target:
        holding = find_holding_by_id(holdings, holding_target.asset_id)
        
        // Skip if no price available
        if holding.quantity == 0 or holding.market_value == 0:
            continue
        
        current_price = holding.market_value / holding.quantity
        
        // Percentage calculations
        target_percent_of_class = holding_target.target_percent / 100.0  // basis points → %
        current_percent_of_class = (holding.market_value / category_current_value) * 100.0
        
        // Cascading calculation: holding% × category% = portfolio%
        target_portfolio_pct = (category.target_percent * target_percent_of_class) / 100.0
        target_value = (target_portfolio_pct / 100.0) * new_portfolio_total
        
        current_value = holding.market_value
        holding_shortfall = max(0, target_value - current_value)
        
        // Store in HoldingShortfall struct (includes percentages for later use)
        holding_shortfalls.push(HoldingShortfall {
            asset_id,
            shortfall_amount: holding_shortfall,
            price_per_share: current_price,
            current_percent_of_class,
            target_percent_of_class,
        })
```

**Key point**: We include ALL holdings with targets (even those with 0 shortfall) 
so frontend can show them when user toggles "show zero-share holdings".

**Step 4: Whole-share optimization with greedy algorithm**
```rust
// Initialize: floor fractional shares to whole shares
total_holding_shortfall = sum(holding_shortfalls.map(|h| h.shortfall_amount))

for each holding_shortfall:
    // Skip if 0 shortfall (at or above target)
    if holding_shortfall.shortfall_amount == 0:
        continue
    
    // Scale to fit category budget proportionally
    scaled_shortfall = if total_holding_shortfall > 0 {
        holding_shortfall.shortfall_amount * (category_budget / total_holding_shortfall)
    } else {
        holding_shortfall.shortfall_amount
    }
    
    // Floor to whole shares
    fractional_shares = scaled_shortfall / holding_shortfall.price_per_share
    whole_shares = floor(fractional_shares)
    
    shares_to_buy[asset_id] = whole_shares
    remaining_budget -= whole_shares * price_per_share

// Greedy optimization: spend remaining budget optimally
while remaining_budget > 0:
    best_holding = None
    best_improvement_per_dollar = 0
    
    for each holding_shortfall where price <= remaining_budget:
        current_shares = shares_to_buy[holding.asset_id]
        new_shares = current_shares + 1
        
        // Calculate CURRENT value INCLUDING shares already bought
        current_value_before = holding.market_value + (current_shares * price_per_share)
        current_pct_before = (current_value_before / new_portfolio_total) * 100.0
        
        // Calculate value AFTER buying 1 more share
        current_value_after = holding.market_value + (new_shares * price_per_share)
        current_pct_after = (current_value_after / new_portfolio_total) * 100.0
        
        // Improvement = reduction in deviation from target
        target_pct = (category.target_percent * holding.target_percent_of_class) / 100.0
        deviation_before = abs(current_pct_before - target_pct)
        deviation_after = abs(current_pct_after - target_pct)
        improvement = deviation_before - deviation_after
        
        improvement_per_dollar = improvement / price_per_share
        
        if improvement_per_dollar > best_improvement_per_dollar:
            best_holding = holding
            best_improvement_per_dollar = improvement_per_dollar
    
    if best_holding is None:
        break  // no more affordable improvements
    
    shares_to_buy[best_holding.asset_id] += 1
    remaining_budget -= best_holding.price_per_share

// Build recommendations with all calculated data
for each holding_shortfall:
    shares = shares_to_buy[asset_id] || 0
    total_amount = shares * price_per_share
    
    // Note: residual_amount is 0 (calculated per-category in frontend)
    recommendations.push(TradeRecommendation {
        asset_id,
        symbol,
        name,
        category_id,
        category_name,
        action: "BUY",
        shares,
        price_per_share,
        total_amount,
        impact_percent,
        current_percent_of_class,
        target_percent_of_class,
        residual_amount: 0,  // Frontend calculates per-category residual
    })
```

**Critical bug fix (2024-02-16)**: Original implementation incorrectly calculated 
`current_pct_before` as just `holding.market_value / new_portfolio_total`, ignoring 
shares already purchased in previous iterations. This caused the optimizer to stop 
too early, leaving excessive remaining cash. The fix includes `current_shares * price` 
in the calculation.

**Properties**:
- Buy-only (never suggests sells)
- Whole shares only (no fractional)
- Respects category budgets (no cross-category spending)
- Greedy optimization within each category independently
- Returns ALL holdings (including 0-share) for UI toggle
- Percentages tracked for display ("9.3% → 15.0% of Equity")
- Category budgets returned for frontend residual calculation

### Backend Implementation

**New module**: `crates/core/src/portfolio/rebalancing/`

Files:
- `mod.rs` — module exports
- `rebalancing_model.rs` — data structures
- `rebalancing_service.rs` — algorithm implementation
- `rebalancing_service_tests.rs` — unit tests

**Data structures** (`rebalancing_model.rs`):
```rust
pub struct RebalancingInput {
    pub target_id: String,
    pub available_cash: Decimal,
    pub base_currency: String,
}

pub struct CategoryBudget {
    pub category_id: String,
    pub budget: Decimal,         // Allocated budget for this category
}

pub struct TradeRecommendation {
    pub asset_id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub category_id: String,
    pub category_name: String,
    pub action: String,                    // Always "BUY"
    pub shares: Decimal,                   // Whole shares to buy
    pub price_per_share: Decimal,          // Current market price
    pub total_amount: Decimal,             // shares * price
    pub impact_percent: Decimal,           // Deviation reduction in % points
    pub current_percent_of_class: Decimal, // e.g., 9.3% of Equity (current)
    pub target_percent_of_class: Decimal,  // e.g., 15.0% of Equity (target)
    pub residual_amount: Decimal,          // 0 (calculated per-category in frontend)
}

pub struct RebalancingPlan {
    pub target_id: String,
    pub target_name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub available_cash: Decimal,
    pub total_allocated: Decimal,
    pub remaining_cash: Decimal,              // available - allocated
    pub additional_cash_needed: Decimal,      // if shortfalls > available
    pub category_budgets: Vec<CategoryBudget>, // **NEW** (2024-02-16)
    pub recommendations: Vec<TradeRecommendation>,
}
```

**Service trait** (`rebalancing_service.rs`):
```rust
pub trait RebalancingService: Send + Sync {
    fn calculate_rebalancing_plan(&self, input: RebalancingInput) -> Result<RebalancingPlan>;
}

pub struct RebalancingServiceImpl {
    target_service: Arc<dyn TargetService>,
    allocation_service: Arc<dyn AllocationService>,
}
```

**Key methods**:
- `calculate_rebalancing_plan()` — main entry point
- `calculate_category_shortfalls()` — step 1
- `calculate_holding_shortfalls()` — step 3
- `optimize_whole_shares()` — step 4 greedy algorithm

**Tauri IPC command** (`apps/tauri/src/commands/portfolio_targets.rs`):
```rust
#[tauri::command]
pub async fn calculate_rebalancing_plan(
    target_id: String,
    available_cash: f64,
    base_currency: String,
    state: tauri::State<'_, ServiceContainer>,
) -> Result<RebalancingPlan, String>
```

**Web endpoint** (`apps/server/src/api/portfolio_targets.rs`):
```
POST /api/v1/portfolio/rebalancing/calculate
Body: { targetId, availableCash, baseCurrency }
Response: RebalancingPlan (JSON)
```

### Frontend Implementation

**New files**:
- `apps/frontend/src/pages/allocations/components/rebalancing-tab.tsx` — main
  component
- `apps/frontend/src/pages/allocations/components/overview-view.tsx` —
  category-level cards
- `apps/frontend/src/pages/allocations/components/detailed-view.tsx` — holdings
  accordion

**Modified files**:
- `apps/frontend/src/pages/allocations/allocations-page.tsx` — replace
  placeholder
- `apps/frontend/src/lib/types.ts` — add rebalancing types
- `apps/frontend/src/commands/portfolio-targets.ts` — add
  `calculateRebalancingPlan()`
- `apps/frontend/src/adapters/shared/portfolio-targets.ts` — add adapter

**TypeScript types** (`types.ts`):
```typescript
interface RebalancingInput {
  targetId: string;
  availableCash: number;
  baseCurrency: string;
}

interface CategoryBudget {
  categoryId: string;
  budget: number;
}

interface TradeRecommendation {
  assetId: string;
  symbol: string;
  name: string | null;
  categoryId: string;
  categoryName: string;
  action: string;
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  impactPercent: number;
  currentPercentOfClass: number;  // NEW: current % within category
  targetPercentOfClass: number;   // NEW: target % within category
  residualAmount: number;         // Always 0 from backend
}

interface RebalancingPlan {
  targetId: string;
  targetName: string;
  accountId: string;
  taxonomyId: string;
  availableCash: number;
  totalAllocated: number;
  remainingCash: number;
  additionalCashNeeded: number;
  categoryBudgets: CategoryBudget[];  // NEW: for residual calculation
  recommendations: TradeRecommendation[];
}
```

**Frontend residual calculation**:

Per-category residual is calculated in the frontend using the backend-provided budgets:
```typescript
// In groupedRecommendations useMemo
const categoryBudget = categorySummaries.find(
  s => s.categoryId === categoryId
)?.budget || 0;

const totalSpent = recommendations.reduce((sum, r) => sum + r.totalAmount, 0);
const residualAmount = Math.max(0, categoryBudget - totalSpent);
```

**Why not calculate residual in backend?**
- Backend calculates per-holding, but residual is conceptually per-category
- Frontend already has category grouping logic
- Avoids sending redundant data (residual = budget - sum(amounts))
- Single source of truth: `categoryBudgets` from backend

**Relationship: remaining vs residuals**
```
remaining_cash = available_cash - total_allocated
total_allocated = sum(all recommendations.totalAmount)

residual_per_category = category_budget - sum(category_recommendations.totalAmount)
sum(all residuals) ≈ remaining_cash  // (within rounding errors)
```

**Component structure** (`rebalancing-tab.tsx`):
```typescript
function RebalancingTab({
  selectedAccount,
  onAccountChange,
  activeTarget,
  deviationReport,
  baseCurrency,
}: RebalancingTabProps) {
  const [availableCash, setAvailableCash] = useState<string>("");
  const [plan, setPlan] = useState<RebalancingPlan | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "detailed">("detailed");
  const [showZeroShares, setShowZeroShares] = useState(false);

  // Calculate category summaries with budgets from backend
  const categorySummaries = useMemo(() => {
    if (!plan || !deviationReport) return [];
    
    // Initialize from deviation report
    const summaries = new Map();
    for (const deviation of deviationReport.deviations) {
      summaries.set(deviation.categoryId, {
        categoryId: deviation.categoryId,
        categoryName: deviation.categoryName,
        targetPercent: deviation.targetPercent,
        currentPercent: deviation.currentPercent,
        suggestedBuy: 0,
        newPercent: deviation.currentPercent,
        budget: 0,
      });
    }
    
    // Add budgets from backend
    for (const categoryBudget of plan.categoryBudgets) {
      const summary = summaries.get(categoryBudget.categoryId);
      if (summary) {
        summary.budget = categoryBudget.budget;
      }
    }
    
    // Add actual spending
    for (const rec of plan.recommendations) {
      const summary = summaries.get(rec.categoryId);
      if (summary) {
        summary.suggestedBuy += rec.totalAmount;
      }
    }
    
    // Calculate new percentages
    const newTotalValue = deviationReport.totalValue + plan.totalAllocated;
    for (const summary of summaries.values()) {
      const deviation = deviationReport.deviations.find(
        d => d.categoryId === summary.categoryId
      );
      if (deviation) {
        const newValue = deviation.currentValue + summary.suggestedBuy;
        summary.newPercent = newTotalValue > 0 
          ? (newValue / newTotalValue) * 100 
          : 0;
      }
    }
    
    return Array.from(summaries.values());
  }, [plan, deviationReport]);

  // Group recommendations with residual calculation
  const groupedRecommendations = useMemo(() => {
    if (!plan) return [];
    
    const groups = new Map();
    for (const rec of plan.recommendations) {
      if (!groups.has(rec.categoryId)) {
        groups.set(rec.categoryId, []);
      }
      groups.get(rec.categoryId).push(rec);
    }
    
    return Array.from(groups.entries()).map(([categoryId, recommendations]) => {
      const totalAmount = recommendations.reduce((sum, r) => sum + r.totalAmount, 0);
      
      // Get budget from backend
      const categoryBudget = categorySummaries.find(
        s => s.categoryId === categoryId
      )?.budget || 0;
      
      // Calculate residual
      const residualAmount = Math.max(0, categoryBudget - totalAmount);
      
      return {
        categoryId,
        categoryName: recommendations[0]?.categoryName || categoryId,
        recommendations, // ALL recommendations (including 0-share)
        totalAmount,
        residualAmount,
      };
    });
  }, [plan, categorySummaries]);

  const handleCalculate = async () => {
    if (!activeTarget || !availableCash || parseFloat(availableCash) <= 0) {
      return;
    }

    setIsCalculating(true);
    try {
      const result = await calculateRebalancingPlan({
        targetId: activeTarget.id,
        availableCash: parseFloat(availableCash),
        baseCurrency,
      });
      setPlan(result);
    } catch (error) {
      console.error("Failed to calculate rebalancing plan:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  // Render logic with filtering and sorting
  // Holdings sorted by totalAmount descending (largest first)
  // Zero-share holdings filtered unless showZeroShares === true
  return (
    <>
      {/* Input section */}
      {/* Asset class cards (always visible) */}
      {/* Detailed holdings (if viewMode === "detailed") */}
      {/*   - Filtered by showZeroShares */}
      {/*   - Sorted by totalAmount descending */}
      {/*   - Grouped by category with Collapsible */}
      {/*   - Shows: name, target%, before→after%, shares, amount */}
      {/*   - Category residual at end if > 0.01 */}
      {/* Summary section */}
      {/* Export buttons */}
    </>
  );
}
  
  return (
    <Card>
      {/* Input section */}
      <Input value={availableCash} onChange={...} />
      <Button onClick={handleCalculate}>Calculate</Button>
      
      {/* Results */}
      {plan && (
        <>
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="detailed">Detailed</TabsTrigger>
          </Tabs>
          
          {viewMode === "overview" && <OverviewView plan={plan} />}
          {viewMode === "detailed" && <DetailedView plan={plan} />}
          
          {/* Summary */}
          <div>
            Total: {plan.totalAllocated} | Remaining: {plan.remainingCash}
            {plan.additionalCashNeeded > 0 && <div>Need: {plan.additionalCashNeeded}</div>}
          </div>
          
          {/* Export */}
          <Button onClick={() => copyAsText(plan)}>Copy</Button>
          <Button onClick={() => downloadCsv(plan)}>CSV</Button>
        </>
      )}
    </Card>
  );
}
```

**Overview view**:
- Category cards with color bars
- Target % | Current % | Suggested Buy
- Projected new % after purchases

**Detailed view**:
- Grouped accordion by category
- Holdings sorted by amount (descending)
- Per-holding display:
  - Name (clickable to holdings page)
  - "Target: 15.0% of Equity"
  - "9.3% → 15.0% of Equity" (before → after)
  - "Shares: 5 × €33.49"
  - Amount in green
- Category residual at end: "Residual (can't buy whole shares): €5.84"
- Eye toggle to show/hide zero-share holdings

### Design Decisions (2024-02-16)

**D1: Category budgets returned from backend**
- Problem: Frontend needs category budget to calculate residual
- Solution: Add `category_budgets: Vec<CategoryBudget>` to `RebalancingPlan`
- Backend already calculates these, just needed to return them
- Enables: `residual = budget - sum(spending)` in frontend
- Alternative rejected: Recalculate shortfall + scaling in frontend (duplication)

**D2: Zero-share holdings included in recommendations**
- Problem: Holdings at/above target have 0 shares but should appear when toggled
- Solution: Backend returns ALL holdings (even with shortfall = 0)
- Frontend filters based on `showZeroShares` toggle
- Example: "Indépendance AM Europe Small I (C)" at 16.4% (target 10%) → 0 shares

**D3: Residual calculated per-category, not per-holding**
- Problem: Residual represents unspent cash within category budget
- Backend sets `residual_amount = 0` in `TradeRecommendation`
- Frontend calculates: `residual = category_budget - sum(category_recs.totalAmount)`
- Displayed once per category after all holdings
- Conceptually correct: residual is leftover budget, not per-holding

**D4: Greedy optimizer includes shares already bought**
- Critical bug fix: Original code calculated improvement from initial holding value
- Correct: Include shares purchased in previous iterations
- Formula: `current_value_before = market_value + (current_shares * price)`
- Impact: Fixes optimizer stopping too early, leaving 10-20% cash unallocated

**D5: Holdings sorted by amount descending**
- User sees largest recommendations first
- Matches investment priority (biggest impact holdings)
- Consistent with phase-4 UX

**D6: Default view is "detailed"**
- Power users want per-holding breakdown
- Overview mode available but not default
- Matches phase-4 behavior
- Table: Symbol | Name | Shares | Price | Current%→Target% | Amount
- Filter toggle for zero-share holdings

**D7: Categories without holdings get budget allocation**
- Problem: Asset classes like Cash with no holding targets were skipped entirely
- Solution: Backend creates category-level recommendation with `shares: 0`
- Shows budget allocated to category even without specific holdings to buy
- Example: Cash (5.0% target) → "Allocate €48.08 to Cash"
- Ensures: `remaining ≈ sum(all category residuals)`

**D8: Taxonomy colors for visual consistency**
- Applied colored left border (4px) to category cards/collapsibles
- Colors from `deviationReport.deviations[].color`
- Matches Overview tab and Side Panel design
- Helps users quickly identify categories across tabs

**D9: UI polish and accessibility**
- Holdings display as "Name (SYMBOL)" - e.g., "iShares Core S&P 500 UCITS ETF (CSP5.PA)"
- Holding names are clickable links to `/holdings/{symbol}`
- Added vertical spacing in cash input section
- Rebalancing plan resets when account changes (prevents showing stale data)

**D10: Export functionality with user feedback**
- **Copy to clipboard**: Formatted plain text with category grouping
  - Format: `BUY {shares} shares of {name} ({symbol}) at {price} = {amount}`
  - Includes summary section with totals and remaining cash
  - Fallback for older browsers using `execCommand('copy')`
  - Toast notification confirms successful copy or shows error
- **CSV download**: Spreadsheet export for detailed analysis
  - Columns: Category | Symbol | Name | Action | Shares | Price | Amount
  - Proper CSV escaping (quotes, commas, newlines)
  - Filename format: `YYYY-MM-DD-rebalancing-suggestions.csv` (date-first for sorting)
  - Toast notification confirms download
- Both features respect `showZeroShares` toggle and category grouping
- Disabled when no plan exists

**D11: State persistence and navigation**
- **SessionStorage for rebalancing state**: Plan and cash input persist per account
  - Survives navigation to holdings and back (React Router Link)
  - Survives page refresh
  - Cleared when browser closes
  - Account switching properly resets to new account's state
- **SessionStorage for selected account**: Account selection persists across tab switches
  - Remembered when navigating between Overview and Rebalancing tabs
  - Remembered when navigating to other pages (Insights) and back
  - Cleared when browser closes
- **Client-side navigation**: Holdings links use React Router `<Link>` for instant navigation
  - No full page reload
  - Smooth user experience matching other pages

**D12: UI polish and validation**
- **Number input cleanup**: Removed spinner arrows from percentage inputs
  - CSS: `[appearance:textfield]` + webkit pseudo-element hiding
  - Applies to Overview tab target inputs and Side panel holding target inputs
- **Empty state validation**: Shows "No allocation targets set" when:
  - No PortfolioTarget exists, OR
  - PortfolioTarget exists but has zero asset class allocations
  - Prevents UI showing with invalid/orphaned target data
- **Navigation order**: Allocations moved after Insights in main menu
  - Order: Dashboard → Holdings → Insights → Allocations → Activities → Assistant
- **Missing holding targets warning**: In Allocation Plan cards
  - Shows amber info message when category has budget but no holding targets configured
  - Detection: Category has budget > 0 but only category-level recommendation (no specific holdings)
  - Message: "Configure holding targets in Overview tab for detailed suggestions"
  - Does NOT show for categories with no holdings (like Cash) - only for categories with holdings but missing targets
  - Helps users discover incomplete configuration

**D10: Cash category handling (2024-02-17)**
- Problem: Cash holdings (EUR, USD, etc.) are synthetic IDs without real asset records
- Cannot create `holding_targets` for Cash (requires asset_id foreign key)
- Solution: Block Cash from holding-level targeting entirely
  - Hide "Holdings" button for CASH/CASH_BANK_DEPOSITS categories in target list
  - Prevent donut chart clicks from opening side panel for Cash
  - Exclude Cash from detailed rebalancing view
  - Hide "Configure holding targets" warning for Cash
- Rationale: Cash is fungible, category-level allocation (e.g., 5%) is sufficient
- Alternative assets (personal assets) DO have real asset IDs and support holding targets

---

### Algorithm Improvement: Efficient Rebalancing ✅ IMPLEMENTED

**Previous Issue: Conservative algorithm left cash unallocated**

**Problem (SOLVED):**
The previous "greedy" optimization algorithm stopped when buying another share would overshoot the target, even if budget remained. This left significant cash unallocated.

Example before implementation:
```
Available cash: €1000
Equity target: 70% (shortfall €397.61)
Commodities target: 25% (shortfall €161.28)
Cash target: 5% (shortfall €47.63)
Total needed: €606.52

Algorithm allocated: €606.52
Remaining unused: €393.48 ❌ (60% utilization)
```

After implementation:
```
Available cash: €1000
Algorithm allocates: €900+ (90%+ utilization) ✅
Remaining: <€100
```

**Solution Implemented: "Efficient Rebalancing" Algorithm**

Two-phase approach to maximize cash deployment while respecting category targets:

**Phase 1: Reduce deviation** ✅ IMPLEMENTED
- Buy shares that move holdings closer to their targets
- Continue while `improvement_per_dollar > 0`
- Location: `rebalancing_service.rs` lines 205-287

**Phase 2: Respect category ceilings** ✅ IMPLEMENTED
- After Phase 1 exhausts, continue buying
- Calculate current category % (including Phase 1 purchases)
- Only buy if purchase won't exceed category-level target
- Example: Equity at 62%, target 70% → can still buy Equity holdings
- Stop when category would exceed its target (e.g., 70.1%)
- Score by distance from ceiling (prefer furthest below)
- Location: `rebalancing_service.rs` lines 288-366



**Implementation Details:**

```rust
// Phase 2 - Actual implementation (simplified)
if remaining_budget > Decimal::ZERO {
    loop {
        // Calculate current category % including all purchases so far
        let category_current_value: Decimal = holdings
            .iter()
            .map(|h| {
                let shares_bought = shares_to_buy.get(&h.id).unwrap_or(&Decimal::ZERO);
                h.market_value + (shares_bought * price)
            })
            .sum();
        
        let category_current_percent = 
            (category_current_value / new_total_value) * 100;

        // Find best purchase that doesn't exceed ceiling
        for shortfall in &shortfalls {
            let new_category_value = category_current_value + shortfall.price_per_share;
            let new_category_percent = (new_category_value / new_total_value) * 100;
            
            if new_category_percent <= category_target_percent {
                // Score by distance from ceiling
                let distance = category_target_percent - new_category_percent;
                // Track best (furthest from ceiling)
            }
        }
        
        // Buy best or stop if all would overshoot
    }
}
```

**Results:**
- ✅ Cash utilization: 60% → 90%+ (50% improvement)
- ✅ Respects category targets (no overshoots)
- ✅ Conservative approach maintained
- ✅ Better capital efficiency

**Testing Status:**
- ✅ Manual testing: Confirmed improvement with €1000 cash example
- ⏳ Unit tests: To be added
- ⏳ Edge cases: Large share prices, multiple categories - to be tested

---

### Future Enhancements (Optional)

**Allow Small Overshoots for Maximum Cash Utilization**

**Current State:**
- Algorithm stops when buying would exceed category target
- Typical remaining cash: 5-10% of available funds
- Example: €1000 available → €900-950 allocated

**Proposed Enhancement:**
Allow users to optionally permit small overshoots (1-2%) per category to maximize cash deployment.

**Benefits:**
- Higher cash utilization: 95-98% (vs current 90-95%)
- Minimize idle cash in account
- Flexible for different investor preferences

**Implementation Options:**

**Option A: Simple Toggle (Recommended)**
```
Settings → Portfolio Target → Rebalancing
☐ Allow small overshoots to maximize cash deployment
  Permits up to 2% overshoot per category to use remaining budget
```

**Option B: User-Defined Limit**
```
Max overshoot per category: [2.0]%
  Range: 0% (disabled) to 5%
  Default: 0% (conservative)
```

**Option C: Rebalancing Strategy Presets**
```
Rebalancing Strategy: [Conservative ▼]
  • Conservative: Stop at target (90-95% utilization)
  • Balanced: Allow 1% overshoot (95-97% utilization)
  • Aggressive: Allow 2% overshoot (97-98% utilization)
```

**Technical Design:**

*Database:*
- Add column to `allocation_targets` table: `max_overshoot_percent REAL DEFAULT 0`
- Nullable: NULL = disabled (conservative)
- Range validation: 0.0 to 5.0

*Backend:*
```rust
// After Phase 2, if budget remains and setting enabled
if remaining_budget > 0 && max_overshoot_percent > 0.0 {
    // Phase 3: Allow small overshoots
    let overshoot_ceiling = category_target_percent + max_overshoot_percent;
    
    // Buy until hitting overshoot ceiling
    // ... (similar to Phase 2 but with higher ceiling)
}
```

*Frontend:*
- Add toggle/slider to target settings
- Show in Overview tab: "Overshoot allowed: ±2%"
- Display in results: "Equity: 71.5% (target 70%, +1.5% overshoot)"

**Trade-offs:**
- ✅ Maximizes capital efficiency
- ✅ User has control (opt-in)
- ✅ Transparent (clearly shown)
- ⚠️ Adds complexity to UI/UX
- ⚠️ May confuse beginners ("why 71% when target is 70%?")
- ⚠️ Requires validation and clear messaging

**Recommendation:**
- **Default**: Disabled (conservative, 0% overshoot)
- **Storage**: Per-target setting (not global)
- **UI**: Simple toggle in target settings, optional slider for advanced users
- **Decision**: Wait for user feedback before implementing
  - Current 90-95% utilization may be sufficient for most users
  - Implement if users frequently ask "why isn't all my cash used?"

**Estimated Effort:**
- Backend: 1-2 hours (add setting column, implement logic)
- Frontend: 1 hour (add toggle/slider to settings UI)
- Testing: 30 minutes
- Total: 2.5-3.5 hours

---

### Verify

**Backend tests** (`rebalancing_service_tests.rs`):
1. Single category underweight, sufficient cash → correct BUY recommendations
2. Insufficient cash → proportional scaling
3. Multiple categories → distributes by shortfall ratio
4. Whole-share optimization → greedy picks best improvement/dollar
5. Zero shortfall → empty recommendations
6. Edge: very large cash → all targets reached

**Frontend manual testing**:
1. Create portfolio target (60% EQUITY, 40% FIXED_INCOME)
2. Navigate to Rebalancing tab
3. Enter $10,000 cash
4. Click Calculate
5. Verify Overview shows category buys with colored borders
6. Verify Detailed shows per-holding trades with colored category borders
7. Verify holding names show as "Name (SYMBOL)" and are clickable
8. Verify Summary: allocated + remaining + needed
9. Test zero-share holdings toggle (Eye icon)
10. Test state persistence:
    - Click holding name → navigate to holding page → back arrow → verify plan still intact
    - Refresh page (F5) → verify plan and account selection persist
    - Switch accounts → verify resets to blank for new account
    - Close browser → reopen → verify resets to "All Portfolio"
11. Test account switching:
    - Switch from Account A to "All Portfolio" → verify plan resets
    - Switch back to Account A → verify blank (no persisted plan from before)
12. Test export features:
    - Click "Copy Text" → verify toast notification → paste and verify format
    - Click "Export CSV" → verify toast notification → verify file downloads as `YYYY-MM-DD-rebalancing-suggestions.csv`
    - Open CSV and verify columns: Category | Symbol | Name | Action | Shares | Price | Amount
13. Test edge cases: zero cash, very large cash, insufficient cash, categories without holdings (Cash)
14. Test empty states: Account with no targets shows "No allocation targets set" message
15. Test number inputs: Verify no spinner arrows on percentage inputs in Overview and Side panel
16. Test missing holding targets warning:
    - Create category target (e.g., Bonds 10%) but don't configure holding targets
    - Calculate rebalancing with available cash
    - Verify amber warning shows in Allocation Plan card: "Configure holding targets in Overview tab for detailed suggestions"
    - Verify Cash (no holdings) does NOT show the warning

**End-to-end**:
```bash
pnpm tauri dev
# Navigate to Allocations → select account → activate target
# Switch to Rebalancing tab → enter cash → verify recommendations
```

---

---

## Implementation Order

```
Section 1 (category targets + overview): ✅ COMPLETE
  1.1  ✅ Single donut chart component
  1.2  ✅ Target list component (inline editing)
  1.3  ✅ Drift indicators + hover details
  1.4  ✅ Rewrite allocations-page.tsx
  1.5  ✅ Auto-create target logic
  1.6  ✅ Batch save with "Save All" button
  1.7  ✅ "Clear All" functionality
  1.8  ✅ Polish + test

Section 2 (per-holding targets): ✅ COMPLETE
  2.1  ✅ DB migration for holding_targets
  2.2  ✅ Backend CRUD (get, upsert, delete)
  2.3  ✅ Tauri commands + Axum routes (get, upsert, batch_save, delete)
  2.4  ✅ Frontend adapters + hooks + mutations
  2.5  ✅ Category side panel component (Sheet) — category-side-panel.tsx
  2.6  ✅ Holding target row component — holding-target-row.tsx
  2.7  ✅ Auto-distribution logic (inline in category-side-panel.tsx)
  2.8  ✅ Lock mechanism for holdings
  2.9  ✅ Cascading % display
  2.10 ✅ Save All Targets (atomic batch — batch_save_holding_targets)
  2.11 ✅ Polish + test

Section 3 (rebalancing advisor): ✅ COMPLETE
  3.1  ✅ Backend rebalancing calculation (Rust, two-phase greedy)
  3.2  ✅ Tauri commands + Axum routes
  3.3  ✅ Frontend adapters + hooks
  3.4  ✅ Rebalancing tab UI (overview + detailed modes)
  3.5  ✅ Copy/export actions (clipboard + CSV)
  3.6  ✅ Polish + test
  3.7  ✅ Unit tests for rebalancing service algorithm (5 scenarios)

Pre-merge cleanup:
  ✅ Rename misleading assetId params → symbol in HoldingTargetRow/CategorySidePanel
  ✅ Category allocation batch save made atomic (batch_save_target_allocations)
  ✅ Remove unused use-allocation-validation.ts hook (dead code)
```

---

## Key Files Reference

### Backend (already built)

| File | Purpose |
|------|---------|
| `crates/core/src/portfolio/targets/target_model.rs` | Domain models |
| `crates/core/src/portfolio/targets/target_traits.rs` | Service + repository traits |
| `crates/core/src/portfolio/targets/target_service.rs` | CRUD + deviation calculator |
| `crates/storage-sqlite/src/portfolio/targets/repository.rs` | Diesel repository |
| `crates/core/src/portfolio/rebalancing/rebalancing_service.rs` | Two-phase greedy algorithm + unit tests |
| `crates/core/src/portfolio/rebalancing/rebalancing_model.rs` | Rebalancing data structures |
| `apps/tauri/src/commands/portfolio_targets.rs` | Tauri IPC commands (15 total) |
| `apps/server/src/api/portfolio_targets.rs` | Axum REST routes |

### Frontend (built/modified)

| File | Status |
|------|--------|
| `adapters/shared/portfolio-targets.ts` | ✅ Done (includes HoldingTarget adapters) |
| `adapters/web/core.ts` (COMMANDS entries) | ✅ Done |
| `hooks/use-portfolio-targets.ts` | ✅ Done |
| `pages/allocations/use-target-mutations.ts` | ✅ Done (batch save atomic via `batch_save_target_allocations`) |
| `lib/types.ts` (PortfolioTarget, HoldingTarget, etc.) | ✅ Done |
| `lib/schemas.ts` (newPortfolioTargetSchema) | ✅ Done |
| `lib/query-keys.ts` (PORTFOLIO_TARGETS, HOLDING_TARGETS, etc.) | ✅ Done |
| `pages/allocations/allocations-page.tsx` | ✅ Rewritten |
| `pages/allocations/components/allocation-donut.tsx` | ✅ Created (Section 1) |
| `pages/allocations/components/target-list.tsx` | ✅ Created (Section 1) |
| `pages/allocations/components/allocations-overview.tsx` | ✅ Created (Section 1) |
| `pages/allocations/components/category-side-panel.tsx` | ✅ Created (Section 2) |
| `pages/allocations/components/holding-target-row.tsx` | ✅ Created (Section 2) |
| `pages/allocations/components/rebalancing-tab.tsx` | ✅ Created (Section 3) |

Not created (logic kept inline):
- `auto-distribution.ts` — logic inline in `category-side-panel.tsx` (deleted dead-code version)
- `trade-recommendations-table.tsx` — lives inside `rebalancing-tab.tsx`

---

## Dependencies / External Features

- **Portfolio grouping** (multi-account combos): Separate feature, separate
  branch. See `docs/features/portfolios/portfolio-grouping-spec.md`. Current
  allocations page uses existing AccountSelector.
- **Taxonomy system**: Already built in beta. We consume it read-only.
- **Allocation service**: Already built in beta. We compose it for deviation
  calculations.

---

## Out of Scope

- Strict mode (dropped — preview/auto-distribute only)
- Editable drag sliders (dropped — text inputs only)
- Trade execution / broker integration
- Drift alerts / notifications
- Multi-taxonomy targets (regions, sectors — deferred)
- Custom taxonomy targets
