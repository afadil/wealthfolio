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

### UI (second tab)

```
┌──────────────────────────────────────────────────────┐
│  REBALANCING SUGGESTIONS                             │
│                                                      │
│  Available Cash: [$_________]  [Calculate]           │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ Suggested Trades                               │  │
│  │                                                │  │
│  │ BUY  VTI   12 shares × $245  =  $2,940  (+3%) │  │
│  │ BUY  BND    8 shares × $72   =  $576    (+1%) │  │
│  │ BUY  VXUS   5 shares × $58   =  $290    (+1%) │  │
│  │                                                │  │
│  │ Total allocated: $3,806 of $5,000               │  │
│  │ Remaining cash: $1,194                          │  │
│  │                                                │  │
│  │ [Copy to Clipboard]  [Export CSV]               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Additional cash needed to fully rebalance: $12,400  │
└──────────────────────────────────────────────────────┘
```

### Algorithm (cash-first, buy-only)

1. New portfolio total = current + available cash
2. For each target (category or holding-level if set):
   - Target value = new total × cascaded target %
   - Current value = actual holdings value
   - Shortfall = max(0, target value - current value)
3. If total shortfall > cash: scale all proportionally
4. Convert to whole shares: floor(allocation / share price)
5. Show: symbol, shares, price, total, impact on allocation %
6. Never suggest sells (tax-efficient, long-term investing)

### Backend

Add to `target_service.rs`:
- `calculate_rebalancing(target_id, available_cash, base_currency)` →
  RebalancingPlan with Vec<TradeRecommendation>

New model:
```rust
pub struct TradeRecommendation {
    pub asset_id: String,
    pub symbol: String,
    pub name: String,
    pub action: String,         // "BUY"
    pub shares: i32,
    pub price_per_share: Decimal,
    pub total_amount: Decimal,
    pub impact_percent: Decimal, // how much this moves allocation
}

pub struct RebalancingPlan {
    pub target_id: String,
    pub available_cash: Decimal,
    pub total_allocated: Decimal,
    pub remaining_cash: Decimal,
    pub additional_cash_needed: Decimal,
    pub recommendations: Vec<TradeRecommendation>,
}
```

### Frontend

New components:
- `rebalancing-tab.tsx` — cash input + calculate button + results
- `trade-recommendations-table.tsx` — table of suggested buys
- Copy/export actions

### Verify

- Enter cash amount → see suggestions
- Suggestions are buy-only
- Whole-share optimization
- Proportional scaling when cash is insufficient
- Copy/export work
- No suggestions when no targets set (helpful empty state)

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
