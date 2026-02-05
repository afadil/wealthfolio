# Allocations Page: Information Architecture

**Status**: Locked for MVP | **Version**: 1.0 | **Date**: January 2026

---

## Executive Summary

The Allocations page is a **strategic allocation management tool** scoped to
viewing and setting asset class targets. It does **not** execute trades or link
to brokers. A separate "Rebalancing Suggestions" tab (Phase 2) will recommend
what to buy/sell based on user-defined cash input.

**Key Principle**: Users manage allocation **strategies per account** (or
globally for "All Portfolio"). The UI surfaces both targets (what they want) and
composition (what they have), enabling drift monitoring and rebalancing
decisions.

---

## Architectural Decisions (Locked)

### Decision 1: Account Scope → **Per-Account Targets (Option B)**

**What This Means:**

- Each account (Brokerage, 401k, Savings, etc.) has its own
  `asset_class_targets`.
- Special case: "All Portfolio" view aggregates holdings across all accounts but
  uses **global targets** (a single unified strategy).

**Schema Impact:**

```sql
-- asset_class_targets now includes account_id
CREATE TABLE asset_class_targets (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,  -- ← NEW FK
  asset_class TEXT NOT NULL,
  target_percent REAL NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  UNIQUE(account_id, asset_class)
);

-- Special global targets for "All Portfolio" view
-- account_id = NULL or a special sentinel UUID
```

**UI Flow:**

```
Account Switcher: [Brokerage Account] ▼
  └─ Shows targets for Brokerage Account ONLY
     └─ 60% Equities, 30% Fixed Income, 10% Cash

Switch to "All Portfolio"
  └─ Shows aggregated holdings across ALL accounts
     └─ Uses global targets (set separately)
```

**Future Upgrade (Phase 2):**

- Will support per-holding targets (e.g., "VTI = 50% of Equities")
- Code structure must assume `asset_class_targets` is account-scoped from day
  one

---

### Decision 2: Level 2 Granularity → **Use `asset_sub_class` (Option A)**

**What This Means:**

- Level 1: Asset classes (Equities, Fixed Income, Cash) — user controls via
  targets
- Level 2: Breakdown by `asset_sub_class` (ETF, Individual Stocks, Bond Fund,
  etc.) — informational, derived from current holdings

**No Schema Changes Required:**

```
Equities (60% target) [Level 1]
├─ ETF (40% of Equities)          [Level 2 — asset_sub_class = "ETF"]
│  ├─ VTI: $100k
│  ├─ VXUS: $60k
│  └─ QQQ: $40k
├─ Individual Stocks (20% of Equities)  [Level 2 — asset_sub_class = "Stock"]
│  ├─ AAPL: $30k
│  └─ TSLA: $20k
└─ Other (?)                       [Level 2 — asset_sub_class = other values]
```

**Cash Special Case:**

- Cash often has NULL or a single `asset_sub_class` (e.g., "Money Market",
  "Savings")
- UI treats NULL as "(Unclassified)" or "Cash Holdings"
- Example:
  ```
  Cash (10% target) [Level 1]
  └─ (Unclassified) (100% of Cash)    [Level 2 — asset_sub_class = NULL]
     ├─ Savings Account: $5k
     └─ Money Market: $5k
  ```

**Future Upgrade (Phase 2):**

- Introduce `holding_targets` table: per-holding weights (e.g., "VTI = 50% of
  Equities")
- Current code **must be structured** to support this later without major
  refactor
- Keep Level 2 logic in a hook (`useHoldingsByAssetClass`) so it's easy to swap
  the source

---

### Decision 3: Page Scope → **Strategic Targets + Monitoring Only (Option A)**

**What This Page Does:**

- ✅ View asset class targets (Level 1)
- ✅ Edit asset class targets (set %, ensure 100% total)
- ✅ View current allocation composition (Level 2 breakdown)
- ✅ Monitor drift (Target vs. Actual, visual gauges)

**What This Page Does NOT Do:**

- ❌ Execute trades / link to brokers
- ❌ Generate trade lists
- ❌ Suggest specific buys/sells

**Rebalancing Suggestions (Phase 2):**

- New tab or separate page: "Rebalancing Advisor"
- User enters: "I have $10k cash to invest"
- System suggests: "Buy $6k VTI, $3k BND, $1k Cash reserves to align with
  targets"
- Output: Informational (not executable within Wealthfolio; user copies to
  broker)

**Interaction Model:**

```
┌─ Allocations Page ─────────────────┐
│                                    │
│ [Account: Brokerage Account] ▼    │
│                                    │
│ ┌─ TAB: TARGETS ─────────────────┐ │
│ │ Edit 60% Equities, 30% FI, etc.│ │
│ │ Shows Target vs. Actual bars   │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌─ TAB: COMPOSITION ──────────────┐ │
│ │ Shows Level 2 breakdown         │ │
│ │ (40% ETFs, 20% Stocks, etc.)   │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌─ TAB: REBALANCING SUGGESTIONS ──┐ │
│ │ [Input: Cash Available: $____]  │ │
│ │ → "Buy $6k VTI, $3k BND"       │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

---

## Three-Tier Information Model

### Tier 0: Account Context

**User-selected scope for all operations.**

- Single account: "Brokerage Account"
- Multi-account aggregate: "All Portfolio"
- Stored in: Frontend state (`selectedAccountId`) or URL param (`?account=<id>`)
- Effect: Filters all data (targets, holdings, calculations)

### Tier 1: Strategic Allocation (Asset Classes)

**What the user wants. User-controlled.**

- Definition: Target distribution across broad categories (Equities, Fixed
  Income, Cash)
- Stored in: `asset_class_targets` table (account-scoped)
- Granularity: 3–5 classes per account
- User Action: Click "Edit Allocation" → set %s → validate 100% → save
- UI Components:
  - `AssetClassTargets`: List and edit targets
  - `AssetClassForm`: Modal/drawer for editing individual class targets
  - `DriftGauge`: Visual bar showing current vs. target for each class

**Example:**

```
EQUITIES: 60.0% target, 64.5% actual → Overweight by 4.5%
FIXED INCOME: 30.0% target, 28.0% actual → Underweight by 2.0%
CASH: 10.0% target, 7.5% actual → Underweight by 2.5%
```

### Tier 2: Holdings Breakdown (Asset Sub-Classes)

**How current holdings distribute. Informational, derived from data.**

- Definition: Breakdown of each asset class by sub-category (e.g., ETFs vs.
  Stocks within Equities)
- Stored in: Instruments (asset_sub_class column) + Holdings (current values)
- Granularity: Varies; can be 1 (all cash) to 5+ (diverse equity portfolio)
- User Action: View only (informational; no editing at this tier in MVP)
- UI Components:
  - `HoldingsCompositionByClass`: Card showing breakdown for each class
  - `SubClassBreakdown`: Table or stacked bar chart within a class
  - Expandable on Level 1 card: click to reveal Level 2

**Example (Within Equities, 64.5% of portfolio):**

```
ETF: 40% of Equities (63% of the 64.5%)
  ├─ VTI: $100k
  ├─ VXUS: $60k
  └─ QQQ: $40k

Individual Stocks: 20% of Equities
  ├─ AAPL: $30k
  └─ TSLA: $20k

Other: 5% of Equities
  └─ (unspecified)
```

---

## Data Model & Relationships

```
Account
  ├─ asset_class_targets (account-scoped targets)
  │   └─ asset_class: TEXT (e.g., "Equities")
  │   └─ target_percent: REAL (e.g., 60.0)
  │
  └─ holdings (user's current securities)
      └─ instrument (security metadata)
          ├─ asset_class: TEXT (e.g., "Equities")
          ├─ asset_sub_class: TEXT (e.g., "ETF") [can be NULL]
          └─ current_value: REAL

DERIVED: Tier 1 Actual = SUM(holdings.current_value) WHERE instrument.asset_class = "Equities" / Portfolio Total

DERIVED: Tier 2 Breakdown = GROUP holdings BY instrument.asset_sub_class WITHIN each asset_class
```

---

## UI Components & Responsibilities

### Page-Level: `AllocationPage`

**Responsibilities:**

- Account switcher (top)
- Tab navigation (Targets, Composition, Rebalancing Suggestions)
- Query orchestration (fetch targets, holdings, calculate actuals)

**Props/State:**

```typescript
interface AllocationPageProps {
  // Implicit from URL param or default to first account
}

// Internal state:
const [selectedAccountId, setSelectedAccountId] = useState<string>(
  accounts[0]?.id || "",
);
const [viewTab, setViewTab] = useState<
  "targets" | "composition" | "rebalancing"
>("targets");
```

### Tab 1: `AssetClassTargets` Component

**Responsibilities:**

- Display Tier 1 (targets) in card/table format
- Show Target % (user-set) vs. Actual % (calculated)
- Drift visualization (bar gauge)
- Edit / Delete buttons per target
- Modal for adding new target or editing existing

**Props:**

```typescript
interface AssetClassTargetsProps {
  accountId: string;
  targets: AssetClassTarget[];
  holdings: Holding[];
  onEdit: (target: AssetClassTarget) => void;
  onDelete: (id: string) => void;
  onSave: (targets: AssetClassTarget[]) => Promise<void>;
}
```

### Tab 2: `HoldingsCompositionByClass` Component

**Responsibilities:**

- Iterate over each asset class
- For each class, show Tier 2 breakdown (sub-classes + holdings)
- Render as expandable cards (collapsed by default)
- Each card shows:
  - Class name + target %
  - Stacked bar or nested table (holdings within sub-class)
  - Current value / % of total portfolio

**Props:**

```typescript
interface HoldingsCompositionByClassProps {
  accountId: string;
  targets: AssetClassTarget[];
  holdings: Holding[];
}
```

### Tab 3: `RebalancingAdvisor` Component (Phase 2)

**Responsibilities:**

- Input field: "Cash available to invest"
- Calculate shortfalls in each asset class
- Suggest allocation of new cash to rebalance
- Output: Informational text ("Buy $6k VTI, $3k BND")

**Props:**

```typescript
interface RebalancingAdvisorProps {
  accountId: string;
  targets: AssetClassTarget[];
  holdings: Holding[];
  availableCash: number;
}
```

### Sub-Component: `DriftGauge`

**Responsibilities:**

- Visualize Target vs. Actual with threshold bands (±5% absolute or ±25%
  relative)
- Show if on-target, underweight, or overweight
- Status badge (✓ On Target | ⚠ Underweight | ⚠ Overweight)

---

## User Flows

### Flow 1: Setting Allocation Targets

```
1. User navigates to Allocations page
2. Selects account: "Brokerage Account"
3. Views current Tier 1 targets (if any exist)
4. Clicks "Edit Allocation" or "Add Target"
5. Modal opens: input Asset Class + Target %
6. System validates: all %s must sum to ≤100%
7. User clicks "Save"
8. Targets persist to DB (account-scoped)
9. Page refreshes; Tier 1 and Tier 2 update automatically
```

### Flow 2: Monitoring Drift

```
1. User is on Allocations page, Targets tab
2. Each asset class card shows:
   - Target: 60.0%
   - Actual: 64.5%
   - Drift Gauge: [====O-----] (+4.5% Overweight)
   - Color: Green (on-target) | Yellow (warning) | Red (rebalance needed)
3. User expands a class to see Tier 2 breakdown
4. User notes: "ETFs are overweight; Stocks underweight"
5. User mentally plans: "Next deposit, buy stocks"
```

### Flow 3: Rebalancing Suggestions (Phase 2)

```
1. User navigates to Rebalancing Suggestions tab
2. Enters: "I have $10,000 to invest"
3. System calculates:
   - Equities need $4,500 (to reach 60%)
   - Fixed Income needs $3,000 (to reach 30%)
   - Cash needs $2,500 (to reach 10%)
4. Suggests: "Buy $4.5k VTI, $3k BND, add $2.5k to Cash"
5. User reads output (informational only)
6. User manually executes on broker platform
```

---

## Accessibility & Clarity

### Labels & Hierarchy

- **Page Title**: "Allocations" | **Subtitle**: "Account: [Brokerage Account]"
- **Tier 1 Section**: "LEVEL 1: STRATEGIC ALLOCATION (Asset Classes)"
  - Helper text: "Set your target distribution across broad categories."
- **Tier 2 Section**: "LEVEL 2: CURRENT HOLDINGS (Breakdown)"
  - Helper text: "How your current holdings align with each asset class."
- **Each Card**:
  - Class name (bold, larger)
  - "Target: 60.0% | Actual: 64.5% | Drift: +4.5%"
  - Drift gauge with color coding

### Icons & Visual Cues

- **Expandable**: Chevron icon (❯ closed, ❱ open) before class name
- **Status**: ✓ (on-target, green) | ⚠ (warning, yellow/orange) | ✕ (rebalance,
  red)
- **Lock Toggle** (Phase 2): 🔒 (locked) | 🔓 (unlocked) per target
- **Edit / Delete**: Pencil 🖊️ and Trash 🗑️ icons

### Keyboard & Screen Reader

- All buttons and toggles accessible via Tab
- Modal/drawer headings use semantic HTML (`<h2>`)
- Form inputs labeled with `<label>` tags
- Drift gauge described in alt text or ARIA labels
- Color not the only indicator (text + icon + ARIA)

---

## Data Fetching & State Management

### Queries (TanStack Query)

```typescript
// Account list
useQuery({
  queryKey: [QueryKeys.ACCOUNTS],
  queryFn: () => getAccounts(),
});

// Targets for selected account
useQuery({
  queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
  queryFn: () => getAssetClassTargets(selectedAccountId),
  enabled: !!selectedAccountId,
});

// Holdings for selected account
useQuery({
  queryKey: [QueryKeys.HOLDINGS, selectedAccountId],
  queryFn: () => getHoldings(selectedAccountId),
  enabled: !!selectedAccountId,
});
```

### Mutations

```typescript
// Create / Update target
useMutation({
  mutationFn: (target: AssetClassTarget) => saveAssetClassTarget(target),
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
    });
  },
});

// Delete target
useMutation({
  mutationFn: (id: string) => deleteAssetClassTarget(id),
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
    });
  },
});
```

---

## Special Cases & Edge Conditions

### Multi-Account Aggregation ("All Portfolio")

**What happens when account = "All Portfolio"?**

```
selectedAccountId = null  // or special sentinel like "all"

Targets: Fetch global targets (stored with account_id = null in DB)
Holdings: Fetch & aggregate all holdings across all accounts
Actuals: SUM all holdings → calculate % per class

UI: Same layout, but note in subtitle: "Viewing All Accounts"
```

**How to store global targets:**

Option 1: Add row with `account_id = NULL` Option 2: Add boolean flag
`is_global = true` to `asset_class_targets` Option 3: Separate table
`global_asset_class_targets`

→ **Recommend Option 1** (NULL account_id): simpler, fewer tables.

### Cash with NULL `asset_sub_class`

```
Holding 1: Cash, asset_sub_class = NULL, value = $5k
Holding 2: Cash, asset_sub_class = "Money Market", value = $3k

Tier 2 display:
Cash (10% target)
├─ (Unclassified): $5k
└─ Money Market: $3k
```

**Code pattern:**

```typescript
const subClass = holding.instrument?.assetSubClass ?? "(Unclassified)";
```

### ETF-Heavy Portfolios

If user holds only ETFs in Equities:

```
Equities (60% target)
└─ ETF (100% of Equities)
   ├─ VTI: $100k
   ├─ VXUS: $60k
   └─ QQQ: $40k
```

**Don't collapse this.** Show all holdings. The Tier 2 breakdown is useful even
if sub-class is uniform.

### Empty Targets / New User

```
User creates account, no targets set yet.

UI: Empty state card
  "No allocation targets set."
  [Button: "Create Allocation"]

Clicking button opens modal to add first target(s).
```

### Target Exceeds 100%

**Validation Rule**: When user tries to save targets that sum > 100%, show
error:

```
"Total allocation is 115%. Please adjust so sum ≤ 100%."
```

Allow ≤100% (user can leave 5% unallocated if desired).

---

## Phase 2 Roadmap (Not in Scope for MVP)

### Per-Holding Targets

```typescript
// New table
CREATE TABLE holding_targets (
  id UUID PRIMARY KEY,
  asset_class_target_id UUID FK,
  holding_id UUID FK,
  target_percent_of_class REAL,  // "VTI = 50% of Equities"
  locked BOOLEAN,
);
```

**UI Changes:**

- Tier 2 cards become editable (sliders + numeric inputs)
- User can drag to rebalance within a class
- Lock toggle per holding
- Proportional auto-adjust (drag one, others shrink)

### Trade List / Action Plan

```
User enters: "Rebalance with $10k cash"
System generates: "Buy $6k VTI, $3k BND, $1k Cash"
Output: Exportable table (CSV) or copyable text for broker
```

### Rebalancing Logic with Corridors

```
Absolute Band (±5%): Rebalance triggered if drift > 5%
Relative Band (±25% of target): e.g., 10% cash triggers at ±2.5%

UI: Visual corridor bands on drift gauge
Status: "Rebalancing recommended" if thresholds exceeded
```

---

## Summary Table

| Aspect                     | Details                                                   |
| -------------------------- | --------------------------------------------------------- |
| **Account Scope**          | Per-account targets (+ global for "All Portfolio")        |
| **Tier 1 (User Controls)** | Asset Class targets (3–5 classes, % per class)            |
| **Tier 2 (Informational)** | Sub-class breakdown (derived from holdings)               |
| **Page Scope**             | View + Set targets, Monitor drift (no trade execution)    |
| **Cash Handling**          | NULL asset_sub_class → Display as "(Unclassified)"        |
| **Multi-Account**          | Account switcher; filtering per account                   |
| **Future (Phase 2)**       | Per-holding targets, trade suggestions, rebalancing logic |

---

## Implementation Checklist (MVP)

- [ ] Schema: Add `account_id` FK to `asset_class_targets`
- [ ] Schema: Support NULL `account_id` for global targets (or "All Portfolio")
- [ ] Command wrapper: `getAssetClassTargets(accountId)`
- [ ] Command wrapper: `saveAssetClassTarget(target)`
- [ ] Command wrapper: `deleteAssetClassTarget(id)`
- [ ] Tauri/Web server endpoints for above
- [ ] Hook: `useAssetClassTargets(accountId)`
- [ ] Hook: `useHoldingsByAssetClass(accountId, assetClass)`
- [ ] Component: `AccountSwitcher` (dropdown)
- [ ] Component: `AssetClassTargets` (list + drift gauges)
- [ ] Component: `AssetClassForm` (add/edit modal)
- [ ] Component: `DriftGauge` (visual bar + status)
- [ ] Component: `HoldingsCompositionByClass` (Tier 2 breakdown)
- [ ] Page: `AllocationPage` (tab layout: Targets, Composition, [Rebalancing])
- [ ] Route: `/allocations?account=<accountId>` (or state-based)
- [ ] Tests: Account scoping, target CRUD, drift calculation
- [ ] Validation: Total % ≤ 100%, asset class names unique per account
- [ ] Error handling: DB failures, missing instruments, division by zero
- [ ] A11y: Labels, ARIA, keyboard nav, color + text status
- [ ] Docs: This file ✓, inline comments for Tier 2 logic

---

## Notes for Future Developers

### Why Account-Scoped Targets?

Real users have different risk profiles per account:

- **Brokerage**: 80% stocks, 20% bonds (aggressive, long-term)
- **401k**: 40% stocks, 60% bonds (conservative, pre-retirement)
- **Savings**: 100% cash (emergency fund)

Starting per-account avoids a redesign later.

### Why Option A (asset_sub_class)?

Avoids a new table (`holding_targets`) in MVP. Gives users insight into "how
many ETFs vs. stocks" within each class. Sufficient for Phase 1.

### Why Defer Trade Execution?

Out of scope (you said "not my point with this page"). Keeps allocations
focused: targets + monitoring. Rebalancing suggestions (Phase 2) can be a simple
calculator (no broker API calls).

### Code Structure for Phase 2

Keep `useHoldingsByAssetClass` as a custom hook. When you add `holding_targets`,
replace the implementation without breaking the component API.

---

## Nomenclature (Frontend vs. Backend)

**Frontend (User-Facing):** "Allocations" page

- More intuitive for users; matches portfolio management terminology

**Backend (Code):** "Rebalancing" domain

- All Rust models, tables, and services use `rebalancing_*` prefix
- Avoids conflict with existing "Goals" feature
- Includes: `rebalancing_strategies`, `asset_class_targets`, `holding_targets`

**Mapping:** | Frontend (UI) | Backend (Code) |
|---------------|----------------| | Allocations page | `rebalancing_model.rs` |
| Strategy (user's plan) | `RebalancingStrategy` | | Asset Class Targets |
`AssetClassTarget` | | Per-Holding Targets | `HoldingTarget` (Phase 2) |

This convention ensures clarity: when developers work on backend Rust code, they
reference "rebalancing"; when discussing UI, use "allocations."

---
