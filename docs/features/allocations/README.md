# Allocations Feature — Master Plan

**Branch**: `feature/allocation-targets`
**Base**: `v3.0.0-beta.3`
**Date**: February 2026
**Status**: 
- ✅ Section 0: Backend complete
- ✅ Section 1: Category-level targets + UI complete
- ⏳ Section 2: Per-holding targets (planned)
- ⏳ Section 3: Rebalancing advisor (planned)

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
- `crates/storage-sqlite/src/portfolio/targets/` — Diesel repository
- `apps/tauri/src/commands/portfolio_targets.rs` — 9 Tauri IPC commands
- `apps/server/src/api/portfolio_targets.rs` — Axum REST routes
- Migration: `crates/storage-sqlite/migrations/2026-02-11-000001_portfolio_targets/`
- Deviation calculator composes `AllocationService` for current state, compares
  against target percentages per category

### Frontend (placeholder, needs redesign) — committed but will be reworked

- Types in `lib/types.ts`: PortfolioTarget, TargetAllocation, AllocationDeviation,
  DeviationReport, etc.
- Schema in `lib/schemas.ts`: newPortfolioTargetSchema
- Query keys in `lib/query-keys.ts`: PORTFOLIO_TARGETS, TARGET_ALLOCATIONS,
  ALLOCATION_DEVIATIONS
- Adapter in `adapters/shared/portfolio-targets.ts`: 9 adapter functions
- Web COMMANDS map entries in `adapters/web/core.ts`
- Hooks in `hooks/use-portfolio-targets.ts`
- Mutations in `pages/allocations/use-target-mutations.ts`
- Page + components in `pages/allocations/` (will be reworked)
- Route at `/allocations` in `routes.tsx`
- Nav entry in `app-navigation.tsx`

The adapters, hooks, mutations, types, and backend are solid. The page and
components need a full redesign per the plan below.

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

**Status**: ⏳ PLANNED (NOT STARTED)

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

New service methods:
- `get_holding_targets(allocation_id)` → Vec<HoldingTarget>
- `upsert_holding_target(target)` → HoldingTarget
- `delete_holding_target(id)` → usize
- `batch_save_holding_targets(allocation_id, targets)` → Vec<HoldingTarget>

New Tauri commands + Axum routes to match.

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

New components:
- `category-side-panel.tsx` — Sheet component for holding targets (Section 2)
- `holding-target-row.tsx` — per-holding row with text input, lock, progress bar

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

- Can set per-holding targets within a category
- Auto-distribution fills unset holdings
- Lock prevents auto-adjustment
- Cascading % displayed correctly
- Save All Targets works (batch)
- Deviation report reflects per-holding targets

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

Implemented in Rust backend (`RebalancingService`):

**Step 1: Category-level shortfall calculation**
```rust
new_portfolio_total = current_total + available_cash

for each category in target_allocations:
    target_value = (category.target_percent / 100) * new_portfolio_total
    current_value = (deviation.current_percent / 100) * current_total
    shortfall = max(0, target_value - current_value)  // buy-only
```

**Step 2: Cash scaling (if insufficient)**
```rust
total_shortfall = sum(all shortfalls)

scale_factor = if total_shortfall > available_cash {
    available_cash / total_shortfall
} else {
    1.0
}

category_budgets = shortfalls * scale_factor
```

**Step 3: Per-holding allocation within category**
```rust
for each category with budget > 0:
    holdings = get_holdings_by_allocation(account, taxonomy, category)
    holding_targets = get_holding_targets(category.allocation_id)
    
    for each holding_target:
        // Cascading calculation
        target_portfolio_pct = (category.target_pct * holding.target_pct) / 100
        target_value = (target_portfolio_pct / 100) * new_portfolio_total
        current_value = holding.market_value
        holding_shortfall = max(0, target_value - current_value)
    
    // Fractional shares
    fractional_shares = holding_shortfall / current_price
    
    // Scale to fit category budget
    holding_scaled_shortfall = holding_shortfall * (category_budget / sum(holding_shortfalls))
```

**Step 4: Whole-share optimization (greedy)**
```rust
// Initialize with floored shares
shares_to_buy = floor(fractional_shares)
remaining_budget = category_budget - sum(shares_to_buy * prices)

// Greedy loop: maximize improvement per dollar
while remaining_budget > 0:
    best_holding = None
    best_improvement_per_dollar = 0
    
    for each holding in category:
        if holding.price > remaining_budget:
            continue  // can't afford
        
        // Calculate impact of buying 1 more share
        new_pct = calculate_new_percentage(holding, shares_to_buy[holding] + 1)
        deviation_reduction = abs(new_pct - target_pct) - abs(current_pct - target_pct)
        improvement_per_dollar = deviation_reduction / holding.price
        
        if improvement_per_dollar > best_improvement_per_dollar:
            best_holding = holding
            best_improvement_per_dollar = improvement_per_dollar
    
    if best_holding is None:
        break  // no affordable holdings
    
    shares_to_buy[best_holding] += 1
    remaining_budget -= best_holding.price

return TradeRecommendation[] with final share counts
```

**Properties**:
- Buy-only (never suggests sells)
- Whole shares only (no fractional)
- Respects category budgets (scaled if cash insufficient)
- Optimizes improvement per dollar within each category
- Locked holdings excluded (future enhancement)

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

pub struct TradeRecommendation {
    pub asset_id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub category_id: String,
    pub category_name: String,
    pub action: String,          // Always "BUY"
    pub shares: Decimal,         // Whole shares
    pub price_per_share: Decimal,
    pub total_amount: Decimal,   // shares * price
    pub impact_percent: Decimal, // Deviation reduction in % points
}

pub struct RebalancingPlan {
    pub target_id: String,
    pub target_name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub available_cash: Decimal,
    pub total_allocated: Decimal,
    pub remaining_cash: Decimal,
    pub additional_cash_needed: Decimal,
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
    holdings_service: Arc<dyn HoldingsService>,
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
  recommendations: TradeRecommendation[];
}
```

**Component structure** (`rebalancing-tab.tsx`):
```typescript
export function RebalancingTab({ 
  activeTarget,
  deviationReport, 
  baseCurrency 
}: RebalancingTabProps) {
  const [availableCash, setAvailableCash] = useState<string>("");
  const [plan, setPlan] = useState<RebalancingPlan | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "detailed">("overview");
  const [showZeroShares, setShowZeroShares] = useState(false);
  
  const handleCalculate = async () => {
    const result = await calculateRebalancingPlan({
      targetId: activeTarget.id,
      availableCash: parseFloat(availableCash),
      baseCurrency
    });
    setPlan(result);
  };
  
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
- Table: Symbol | Name | Shares | Price | Current%→Target% | Amount
- Filter toggle for zero-share holdings

**Export formats**:
- Text: `"BUY 12 shares of VTI at $245.00 = $2,940.00"`
- CSV: Headers `Symbol,Name,Action,Shares,Price,Amount`

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
5. Verify Overview shows category buys
6. Verify Detailed shows per-holding trades
7. Verify Summary: allocated + remaining + needed
8. Test edge cases: zero cash, very large cash, insufficient cash
9. Test export: Copy and CSV download

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
Section 1 (category targets + overview):
  1.1  Single donut chart component            → verify: renders with current allocation
  1.2  Target list component (inline editing)  → verify: renders with side-by-side bars
  1.3  Drift indicators + hover details        → verify: shows underweight/overweight
  1.4  Rewrite allocations-page.tsx            → verify: full flow works
  1.5  Auto-create target logic                → verify: first-use flow smooth
  1.6  Batch save with "Save All" button       → verify: single toast, all saved
  1.7  "Clear All" functionality               → verify: clears all targets
  1.8  Polish + test                           → verify: pnpm type-check, visual QA

Section 2 (per-holding targets):
  2.1  DB migration for holding_targets        → verify: cargo test
  2.2  Backend CRUD + batch save               → verify: cargo test
  2.3  Tauri commands + Axum routes            → verify: cargo build
  2.4  Frontend adapters + hooks               → verify: pnpm type-check
  2.5  Category side panel component (Sheet)   → verify: opens when row clicked
  2.6  Holding target row component            → verify: renders with inline editing
  2.7  Auto-distribution logic                 → verify: unset holdings get remainder
  2.8  Lock mechanism for holdings             → verify: locked targets don't auto-adjust
  2.9  Cascading % display                     → verify: shows category % and portfolio %
  2.10 Save All Targets (batch)                → verify: full flow
  2.11 Polish + test                           → verify: visual QA

Section 3 (rebalancing advisor):
  3.1  Backend rebalancing calculation         → verify: cargo test
  3.2  Tauri commands + Axum routes            → verify: cargo build
  3.3  Frontend adapters + hooks               → verify: pnpm type-check
  3.4  Rebalancing tab UI                      → verify: renders, calculates
  3.5  Copy/export actions                     → verify: clipboard + CSV
  3.6  Polish + test                           → verify: visual QA
```

---

## Key Files Reference

### Backend (already built)

| File | Purpose |
|------|---------|
| `crates/core/src/portfolio/targets/target_model.rs` | Domain models |
| `crates/core/src/portfolio/targets/target_traits.rs` | Service + repository traits |
| `crates/core/src/portfolio/targets/target_service.rs` | CRUD + deviation calculator |
| `crates/storage-sqlite/src/portfolio/targets/` | Diesel repository |
| `apps/tauri/src/commands/portfolio_targets.rs` | Tauri IPC commands |
| `apps/server/src/api/portfolio_targets.rs` | Axum REST routes |

### Frontend (adapters/hooks — keep; page/components — rework)

| File | Status |
|------|--------|
| `adapters/shared/portfolio-targets.ts` | Keep |
| `adapters/web/core.ts` (COMMANDS entries) | Keep |
| `hooks/use-portfolio-targets.ts` | Keep |
| `pages/allocations/use-target-mutations.ts` | Keep (fix batch save) |
| `lib/types.ts` (PortfolioTarget, etc.) | Keep |
| `lib/schemas.ts` (newPortfolioTargetSchema) | Keep |
| `lib/query-keys.ts` (PORTFOLIO_TARGETS, etc.) | Keep |
| `pages/allocations/allocations-page.tsx` | Rewrite |
| `pages/allocations/components/target-form.tsx` | Remove |
| `pages/allocations/components/allocation-editor.tsx` | Remove |
| `pages/allocations/components/deviation-table.tsx` | Remove |

### New frontend files (to create)

| File | Section |
|------|---------|
| `pages/allocations/components/allocation-donut.tsx` | 1 |
| `pages/allocations/components/target-list.tsx` | 1 |
| `pages/allocations/components/category-side-panel.tsx` | 2 |
| `pages/allocations/components/holding-target-row.tsx` | 2 |
| `pages/allocations/lib/auto-distribution.ts` | 2 |
| `pages/allocations/components/rebalancing-tab.tsx` | 3 |
| `pages/allocations/components/trade-recommendations-table.tsx` | 3 |

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
