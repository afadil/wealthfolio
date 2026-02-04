# Phase 3: Per-Holding Target Allocation

## Overview

**Goal:** Enable users to set target allocations for individual holdings within each asset class, providing granular control while maintaining the simplicity of the Phase 2 asset class system.

**Timeline:** 4-6 days across 3 sprints

**Date Created:** January 27, 2026

---

## 1. Architectural Decisions

### 1.1 Data Model: Cascading Targets

**Hierarchy:**
```
Portfolio (100%)
  ├─ Asset Class Target (e.g., Equity 60%)
  │   ├─ Holding Target (e.g., VTI 50% of Equity)
  │   ├─ Holding Target (e.g., VOO 30% of Equity)
  │   └─ Holding Target (e.g., VXUS 20% of Equity)
  └─ Asset Class Target (e.g., Fixed Income 30%)
      └─ ...
```

**Calculation Logic:**
- Holding targets are percentages **of their asset class**, not the portfolio
- Example: VTI 50% of Equity × 60% Equity = 30% of total portfolio
- Constraint: All holding targets within an asset class must sum to 100%
- Auto-fill: Unallocated holdings receive remainder proportionally

**Database Schema** (already exists in migrations):
```sql
CREATE TABLE holding_targets (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  holding_id UUID NOT NULL,
  target_percent_of_asset_class DECIMAL(5,2) NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (holding_id) REFERENCES holdings(id)
);
```

### 1.2 Rebalancing Model: Cash-First Allocation

**Philosophy:**
- Generate **only BUY recommendations** for underweight positions
- Never suggest selling (avoid tax implications, user control)
- Allocate new cash to reach targets

**Rebalancing Logic:**
1. User has $X cash to invest
2. Calculate absolute target dollars: `portfolio_value * asset_class_target * holding_target`
3. Calculate gap: `target_dollars - current_dollars`
4. Suggest buys for all positive gaps, prioritizing largest gaps
5. Show "Would need $Y more to reach targets" if cash insufficient

### 1.3 Portfolio & Multi-Account Architecture

**Overview:**
Portfolios are lightweight groupings of accounts that enable unified allocation management without data duplication.

**Key Features:**
- Create named portfolios combining 2+ accounts
- View allocation strategies at the portfolio level
- Quick multi-select accounts for ad-hoc exploration
- Save multi-select combinations as portfolios for future use

**Key Benefits:**
- **Independent Strategies**: Each portfolio/account gets its own separate allocation strategy
- **No Data Duplication**: Portfolios reference accounts, all data stays in accounts table
- **Flexible UX**: Support both quick exploration (multi-select) and persistent portfolios
- **Multi-Feature Support**: Portfolios can be used across Allocation, Insights, Performance pages
- **Clear Separation**: Portfolios ≠ Accounts (no confusion about trading accounts)

**Account Selector UI (Actual Implementation):**

Uses shadcn **Command/CommandItem pattern** (NOT checkboxes) to match Insights page style:

```
┌──────────────────────────────────────┐
│ Search...                          ▼ │
├──────────────────────────────────────┤
│ All Accounts                     ✓   │ ← CommandItem with Check icon
├──────────────────────────────────────┤
│ Portfolios                           │
│   Family Portfolio               ✓   │ ← Check when active
│   Retirement Strategy                │
├──────────────────────────────────────┤
│ Accounts                             │
│   Degiro                         ✓   │ ← Click toggles, Check shows selected
│   Interactive Brokers            ✓   │
│   Revolut                            │
│   Trading212                         │
└──────────────────────────────────────┘
```

**Implementation Details:**
- Component: `src/components/account-portfolio-selector.tsx`
- Pattern: Popover → Command → CommandItem (NOT checkboxes)
- Selection: Array of account IDs, click to toggle
- Visual: Check icon opacity (100% = selected, 0% = unselected)
- Matches: Insights page account selector pattern

**Why Command Pattern (Not Checkboxes):**
- ✅ Consistency with Insights page design
- ✅ Cleaner visual hierarchy
- ✅ Better mobile UX

**Auto-Matching Behavior:**
- When user multi-selects accounts that exactly match a saved portfolio → auto-activates that portfolio
- Order-independent matching (A+B+C = C+B+A)
- Toast notification: "✓ Matched Portfolio X"

**User Workflows:**

**Create Portfolio (Settings):**
1. Navigate to Settings → Portfolios
2. Click [+ New Portfolio]
3. Enter name, select 2+ accounts
4. Click [Create Portfolio]

**Save Multi-Select as Portfolio:**
1. Multi-select accounts (e.g., A + C)
2. Banner shows: "💡 Viewing 2 accounts — [Save as Portfolio]"
3. Click [Save as Portfolio]
4. Name auto-filled, user can edit
5. Portfolio created and auto-activated

**Edge Cases Handled:**
- **Account Deletion**: Portfolio shows warning "⚠️ Incomplete"
- **Account Renaming**: Portfolio name auto-updates
- **Duplicate Names**: Validation prevents duplicate portfolio names
- **Minimum Accounts**: Enforces 2+ accounts per portfolio
- **Subset/Superset Selection**: Portfolio deactivates, shows banner

### 1.4 Portfolio Feature Implementation Plan

**Status**: 🔄 Required before Sprint 2 completion

This section outlines the implementation steps for the Portfolio feature. **Complete these tasks before continuing Sprint 2** as the multi-account strategy is foundational to the allocation system.

#### Database Schema

```sql
CREATE TABLE portfolios (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    account_ids TEXT NOT NULL,  -- JSON array: ["id1", "id2", "id3"]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_portfolios_name ON portfolios(name);
```

#### Implementation Tasks

**Backend (Rust):**
1. Create `portfolios` table migration
2. Add models: `Portfolio`, `NewPortfolio`, `PortfolioDB`
3. Add repository methods:
   - `get_all_portfolios()` - List all portfolios
   - `get_portfolio(id)` - Get by ID
   - `create_portfolio(name, account_ids)` - Create new
   - `update_portfolio(id, name, account_ids)` - Update existing
   - `delete_portfolio(id)` - Delete
   - `find_portfolio_by_accounts(account_ids)` - Auto-match
4. Add Tauri commands + Axum endpoints
5. Add validation: minimum 2 accounts, unique names

**Frontend:**
1. Create Settings → Portfolios page
2. Create portfolio CRUD hooks (`use-portfolio-queries`, `use-portfolio-mutations`)
3. Update account selector component:
   - Add portfolios section
   - Add multi-select checkboxes
   - Add auto-matching logic
4. Add banners:
   - "Save as Portfolio" banner
   - "Modified selection" banner
   - Auto-match toast notification
5. Handle edge cases (deletion, renaming, validation)

#### Test Scenarios (Must Pass)

**Scenario 1: Create Portfolio in Settings**
- Navigate to Settings → Portfolios
- Click [+ New Portfolio]
- Enter name: "Family Portfolio"
- Select Account A + Account B
- Click [Create Portfolio]
- ✅ Portfolio created with unique name
- ✅ Accounts saved: A + B
- ✅ Portfolio appears in list

**Scenario 2: Multi-Select Auto-Matching**
- Deselect all accounts
- Check Account A
- Check Account B
- ✅ Auto-switches to "● Family Portfolio"
- ✅ Toast: "✓ Matched Family Portfolio"
- ✅ Loads existing targets

**Scenario 3: Save Multi-Select as Portfolio**
- Multi-select: Check A + C (not a saved portfolio)
- ✅ Banner shows: "💡 Viewing 2 accounts — [Save as Portfolio]"
- Click [Save as Portfolio]
- Name auto-filled: "Account A + Account C"
- Edit name: "Investment Portfolio"
- Save
- ✅ Portfolio created and auto-activated

**Scenario 4: Account Deletion Handling**
- Create Portfolio Y (A+B+D)
- Delete Account D from Settings → Accounts
- View Portfolio Y
- ✅ Shows warning: "⚠️ Incomplete (Account D deleted)"
- ✅ Options: [Update Portfolio] [Delete Portfolio]

**Scenario 5: Duplicate Name Validation**
- Try creating "Family Portfolio" (exists)
- ✅ Validation error: "Name already exists"
- ✅ Create button disabled until valid name

**Scenario 6: Minimum Accounts Validation**
- Try creating with 1 account
- ✅ Error: "Minimum 2 accounts required"
- Select 2 accounts
- ✅ Button enabled, can create

**Priority**: Complete Portfolio feature implementation before Sprint 2 Live Preview work.

For detailed UX patterns and additional test scenarios, see [archive/portfolio_architecture.md](archive/portfolio_architecture.md).

---

## 2. UI/UX Decisions

### 2.1 Layout: Enhanced Side Panel (No New Views)

**Main View (60% - LEFT SIDE):**
- Allocation Overview pie chart (unchanged)
- Asset class sliders with lock/delete controls (unchanged)
- Click pie slice → opens enhanced side panel

**Side Panel (40% - RIGHT SIDE):**
- Enhanced Sheet component (existing component, new content)
- Compact design with text inputs (no sliders)
- Scrollable holdings list
- Visual bars for progress feedback

### 2.2 Side Panel Structure

**Header Section (Asset Class - Unchanged for Now):**
```
┌─────────────────────────────────────┐
│ Equity Allocation                   │
│ Target: 60% of portfolio            │ ← Keep current implementation
│ [Current visual bars and % text]    │ ← User can edit via text input
│─────────────────────────────────────│ ← (May optimize space later)
```

**Holdings Section (Main Content):**
```
│ Holdings Breakdown:                 │
│                                     │
│ VTI - Total Stock Market      [🔒]  │ ← Clickable name → /holdings/VTI
│ Current 55% → Target [50]%    [×]  │ ← Text input only (no slider)
│ ████████████░░░░░░░░              │ ← Visual bar (read-only)
│                                     │
│ VOO - S&P 500                       │
│ Current 30% → Target [30]%    [×]  │
│ ████████░░░░░░░░░░░░░░              │
│                                     │
│ VXUS - International          [🔒]  │
│ Current 15% → Target [20]%    [×]  │
│ ████░░░░░░░░░░░░░░░░░░              │
│                                     │
│ [+ Add Target for Other Holdings]   │ ← For unallocated holdings
└─────────────────────────────────────┘
```

**Key Features:**
- ✅ Clickable holding names → navigate to `/holdings/{symbol}` detail page
- ✅ Text input for targets (consistent with current asset class panel pattern)
- ✅ Visual bars show current vs target (no interaction, just feedback)
- ✅ Lock button per holding (prevents auto-adjustments)
- ✅ Delete button per holding (removes target, holding gets auto-filled remainder)
- ✅ Compact vertical layout (more holdings visible without scrolling)

### 2.3 Design Rationale

**Why text input instead of sliders in panel:**
- Side panel is only 40% width (sliders would be cramped)
- Consistent with current asset class section (already uses text input)
- Faster for precise values (typing "33.33" vs dragging)
- More vertical space = see more holdings at once

**Why keep asset class section as-is for now:**
- Provides context while working on holdings ("60% Equities" reference)
- Allows editing asset class target without closing panel
- User wants to evaluate space usage after implementation
- Can optimize later if vertical space becomes an issue
- Keeps all related info in one place during Phase 3 development

**Why keep visual bars for holdings:**
- Provides instant visual feedback (target vs actual)
- Doesn't take much space (1 line per holding)
- Helps users spot misalignments quickly

---

## 3. Component Architecture

### 3.1 New Components

**`AssetClassSidePanel.tsx`**
- Purpose: Wrapper for side panel content when asset class is selected
- Props: `assetClass`, `assetClassTarget`, `holdings`, `onClose`, `onNavigate`
- Features:
  - Read-only header showing asset class target
  - Holdings breakdown section
  - Integrates HoldingTargetRow components
  - Optional sub-pie chart (future enhancement)

**`HoldingTargetRow.tsx`**
- Purpose: Individual holding row with target input
- Props: `holding`, `currentPercent`, `targetPercent`, `isLocked`, `onChange`, `onLock`, `onDelete`, `onNavigate`
- Features:
  - Clickable holding name (navigate to detail page)
  - Text input for target percentage
  - Visual progress bar
  - Lock/delete buttons
  - Validation (sum to 100% with siblings)

**`HoldingsBreakdownPie.tsx` (Optional - Phase 3.5)**
- Purpose: Mini pie chart showing holdings within asset class
- Props: `holdings`, `assetClassTarget`
- Features:
  - Visual breakdown of holdings
  - Shows target vs actual allocation
  - Clickable slices to highlight corresponding holding row

### 3.2 Existing Components (Reused)

- `TargetPercentSlider` - NOT used in panel (only in main view for asset classes)
- `Sheet` - Container for side panel (already exists)
- `Collapsible` - For expandable sections if needed
- `AlertDialog` - For locked target deletion warnings
- Icons: `Lock`, `LockOpen`, `Trash2`, `Plus`

### 3.3 New Hooks

**`use-holding-target-queries.ts`**
```typescript
// Get all holding targets for an account
export const useHoldingTargets = (accountId: string) => {...}

// Get holding targets for specific asset class
export const useHoldingTargetsByAssetClass = (accountId: string, assetClass: string) => {...}

// Calculate cascading percentages (holding% × asset_class% = portfolio%)
export const useCascadingPercentages = (accountId: string) => {...}
```

**`use-holding-target-mutations.ts`**
```typescript
// Set holding target (validates sum to 100%)
export const useSetHoldingTarget = () => {...}

// Delete holding target
export const useDeleteHoldingTarget = () => {...}

// Batch set holding targets (for proportional auto-fill)
export const useBatchSetHoldingTargets = () => {...}

// Toggle lock on holding target
export const useToggleHoldingTargetLock = () => {...}
```

---

## 4. Implementation Plan

### Sprint 1: Backend Foundation (1-2 days)

**Tasks:**
1. ✅ Verify `holding_targets` table exists (DONE - confirmed in migrations)
2. Create Rust models:
   - `HoldingTarget` struct in `src-core/src/models/holding_target.rs`
   - `HoldingAllocationRequest` DTO
3. Create repository:
   - `src-core/src/repository/holding_target_repository.rs`
   - CRUD operations with validation (sum to 100%)
4. Create service:
   - `src-core/src/services/holding_target_service.rs`
   - Business logic: auto-fill, proportional scaling, lock handling
5. Add Tauri commands:
   - `src-tauri/src/commands/allocation.rs`
   - `get_holding_targets`, `set_holding_targets`, `delete_holding_target`, `toggle_holding_target_lock`
6. Add Axum endpoints (web mode):
   - `src-server/src/api.rs`
   - Mirror Tauri commands for web compatibility
7. Create frontend command wrappers:
   - `src/commands/allocation.ts`
   - Switch on `RUN_ENV` (desktop/web)

**Validation:**
- Run `cargo test` in `src-core`
- Test Tauri commands in desktop mode
- Test Axum endpoints in web mode
- Verify 100% sum constraint enforcement

### Sprint 2: Enhanced Side Panel UI with Live Preview (2-3 days)

**Tasks:**
1. ✅ Create React Query hooks:
   - `use-holding-target-queries.ts` - Fetch holding targets
   - `use-holding-target-mutations.ts` - Save/delete/lock mutations
   - `use-cascading-percentages.ts` - Calculate portfolio %
2. ✅ Create `HoldingTargetRow.tsx`:
   - Text input for target percentage (inline editing)
   - Visual progress bar (h-3, compact)
   - Lock/delete buttons (only show when target exists)
   - Clickable holding name with price → navigation
   - Lock styling: `bg-gray-800 dark:bg-gray-700 text-gray-300` (darker)
3. ✅ Integrate into side panel (index.tsx):
   - Replace simple holding list with HoldingTargetRow components
   - Organize by sub-asset class (collapsible sections)
   - Preserve total price per sub-class
4. 🔄 Add Live Preview functionality:
   - Calculate auto-distributed % for unset holdings
   - Display user-set values in bold
   - Display auto-calculated previews in italic/grey with "→" indicator
   - Add "Save All Targets" button (batch save)
   - Show total % indicator (e.g., "Total: 100% ✓")
5. 🔄 Update mutation logic:
   - On save: collect all user-set + auto-calculated values
   - Batch save all targets in one mutation
   - Toast notification: "Saved X targets (Y auto-distributed)"
6. 🔄 Polish UI:
   - Reduce all progress bar heights to h-3 (compact)
   - Add market value display next to holding names
   - Improve spacing and visual hierarchy

**Validation:**
- ✅ Click pie slice → side panel opens with holdings grouped by sub-class
- ✅ Enter target percentage → input works, no strict validation
- 🔄 See live preview of auto-calculated % (italic, grey)
- 🔄 Click "Save All Targets" → saves user + auto values
- 🔄 Lock holding → prevents auto-preview calculation
- ✅ Delete holding target → removed from list
- ✅ Click holding name → navigates to detail page

### Sprint 3: Rebalancing Enhancement (1-2 days)

**Tasks:**
1. Update `rebalancing-advisor.tsx`:
   - Fetch holding targets via new hooks
   - Calculate cascading percentages (holding% × asset_class% = portfolio%)
   - Generate per-holding BUY suggestions
   - Group suggestions by asset class
2. Add new UI sections:
   - "Holdings Rebalancing" section (detailed view)
   - Show holding-level gaps and recommended buys
   - Expandable/collapsible by asset class
3. Update calculation logic:
   - Respect locked holding targets
   - Prioritize largest gaps when cash is limited
   - Show "Would need $X more to reach all targets"
4. Add tests:
   - Unit tests for cascading percentage calculations
   - Integration tests for rebalancing suggestions

**Validation:**
- Set holding targets → rebalancing shows per-holding suggestions
- Lock holding → suggestion skips that holding
- Insufficient cash → shows partial suggestions + additional cash needed
- No holding targets → falls back to asset class only suggestions

---

## 5. Technical Details

### 5.1 Validation Rules (Hybrid #1: Live Preview + Auto-distribute)

**Phase 3 Strategy:**
- **NO strict 100% validation** - allows incremental target setting
- Live preview shows what will be saved before user commits
- Auto-distributes remaining % to unset holdings
- User sees preview → clicks "Save All Targets" → all saved at once
- *(Strict mode deferred to Phase 4 as optional setting)*

**Holding Targets (per asset class):**
- Each target: 0.00% to 100.00% (2 decimal places)
- Locked targets cannot be auto-adjusted
- Deleting a target redistributes its percentage proportionally to unlocked holdings
- **User-set targets** displayed in bold
- **Auto-calculated previews** displayed in italic/grey with "→" indicator

**Auto-Fill Logic (Live Preview):**
- When user sets target for some holdings but not all:
  - Calculate total allocated: `SUM(set_targets)`
  - Calculate remainder: `100% - total_allocated`
  - Show preview of auto-distributed % in UI (italic, grey)
  - Distribute remainder proportionally among unset holdings based on current market values
  - User clicks "Save All Targets" to commit all values (user-set + auto-calculated)

**Example (Live Preview UX):**
```
Equity Asset Class (4 holdings):

User Action:
- VTI: User enters 40% (locked)
- VOO: User enters 30%

Live Preview Shows:
┌─────────────────────────────────────┐
│ VTI: 40% (bold, user-set) [🔒]     │
│ VOO: 30% (bold, user-set)          │
│ VXUS: → 10% (grey, italic, auto)   │ ← Preview
│ VGT: → 20% (grey, italic, auto)    │ ← Preview
│─────────────────────────────────────│
│ Total: 100% ✓                      │
│ [Save All Targets]                  │
└─────────────────────────────────────┘

Auto-fill calculation (same as before):
- Allocated: 40% + 30% = 70%
- Remainder: 100% - 70% = 30%
- VXUS preview: 30% × ($10k / $30k) = 10%
- VGT preview: 30% × ($20k / $30k) = 20%

When user clicks "Save All Targets":
- Saves VTI: 40% (locked)
- Saves VOO: 30%
- Saves VXUS: 10% (from preview)
- Saves VGT: 20% (from preview)
```

### 5.2 Cascading Percentage Calculation

**Formula:**
```
Portfolio % = Asset Class % × Holding % of Asset Class

Example:
- Equity target: 60% of portfolio
- VTI target: 50% of Equity
- VTI portfolio target: 60% × 50% = 30% of total portfolio
```

**Implementation:**
```typescript
// In use-cascading-percentages.ts
export const calculatePortfolioPercent = (
  assetClassPercent: number,
  holdingPercentOfClass: number
): number => {
  return (assetClassPercent * holdingPercentOfClass) / 100;
};
```

### 5.3 Lock Behavior

**Asset Class Lock:**
- Prevents auto-scaling when other asset classes change
- Does NOT prevent editing via text input or deletion
- Visual indicator: `bg-secondary text-gray-700` (Phase 2 pattern)

**Holding Target Lock:**
- Prevents auto-scaling when other holdings in same asset class change
- Does NOT prevent manual editing via text input or deletion
- Independent of asset class lock
- Visual indicator: Same as asset class lock

---

## 6. User Workflows

### 6.1 Set Holding Targets

**Steps:**
1. User sets asset class targets in main view (e.g., Equity 60%)
2. User clicks "Equity" pie slice → side panel opens
3. Panel shows all Equity holdings with current allocations
4. User enters target percentages:
   - VTI: 50%
   - VOO: 30%
   - VXUS: 20%
5. System validates sum = 100%
6. User clicks outside or saves → targets saved
7. Rebalancing advisor updates with per-holding suggestions

### 6.2 Lock and Delete

**Lock:**
1. User clicks lock icon on VTI holding
2. VTI target is locked (cannot be auto-adjusted)
3. User changes VOO from 30% to 40%
4. System auto-adjusts only VXUS (unlocked): 20% → 10%

**Delete:**
1. User clicks delete icon on VOO holding
2. System removes VOO target
3. VOO's 30% is redistributed proportionally:
   - VTI: 50% → 65% (if unlocked)
   - VXUS: 20% → 35% (if unlocked)

### 6.3 Navigate to Holding Detail

**Steps:**
1. Side panel shows "VTI - Total Stock Market"
2. User clicks holding name (clickable button)
3. Navigates to `/holdings/VTI` detail page
4. User can view transactions, performance, etc.
5. User clicks back → returns to allocation page with side panel still open

---

## 7. Testing Strategy

### 7.1 Unit Tests (Vitest)

**Frontend:**
- `use-cascading-percentages.test.ts` - Percentage calculations
- `use-holding-target-mutations.test.ts` - Mutation logic
- `HoldingTargetRow.test.tsx` - Component rendering and interactions
- `AssetClassSidePanel.test.tsx` - Panel content and navigation

**Backend (Rust):**
- `holding_target_service.rs` - Auto-fill logic, validation, proportional scaling
- `holding_target_repository.rs` - CRUD operations, database constraints

### 7.2 Integration Tests

**Frontend:**
- End-to-end flow: Set asset class → Set holdings → Rebalancing updates
- Lock/delete behavior with auto-scaling
- Navigation between allocation and holding detail pages

**Backend:**
- Tauri command wrappers (desktop mode)
- Axum endpoints (web mode)
- Database migrations and constraints

### 7.3 Manual Testing

**Scenarios:**
1. Set targets for all holdings in asset class (sum to 100%)
2. Set targets for some holdings (auto-fill remainder)
3. Lock one holding, adjust another (verify locked stays fixed)
4. Delete holding target (verify proportional redistribution)
5. Navigate to holding detail and back (verify panel state preserved)
6. Test with 10+ holdings in one asset class (verify scrolling, performance)
7. Test rebalancing with insufficient cash (verify partial suggestions)

### 7.4 Portfolio Feature Test Scenarios (Phase 3)

#### Scenario 1: Create Portfolio in Settings
**Path:** Settings → Portfolios
- Navigate to Settings page
- Click "Add portfolio" button
- Enter name: "Family Portfolio"
- Select Account A + Account B (at least 2)
- Click [Create Portfolio]
- **Expected Results:**
  - ✅ Portfolio created successfully
  - ✅ Unique name enforced
  - ✅ Accounts A + B saved
  - ✅ Portfolio appears in list

#### Scenario 2: Multi-Select Auto-Matching
**Path:** Allocation page (main selection flow)
1. Create portfolio "Family Portfolio" with Account A + Account B (from Scenario 1)
2. Go to Allocation page
3. Current selection: "All Accounts"
4. Click account selector
5. Deselect "All Accounts"
6. Select Account A
7. Select Account B
- **Expected Results:**
  - ✅ Toast appears: "✓ Matched Portfolio "Family Portfolio""
  - ✅ Selector displays: "● Family Portfolio" (briefcase icon)
  - ✅ Existing targets load automatically
  - ✅ Toast only shows once (no spam)

#### Scenario 3: Save Multi-Select as Portfolio
**Path:** Allocation page (new portfolio creation flow)
1. Go to Allocation page
2. Click account selector
3. Select 2 accounts that DON'T match any existing portfolio
4. (e.g., Account A + Account C, if "Family Portfolio" is A+B)
- **Expected Results:**
  - ✅ Banner appears: "💡 Viewing 2 accounts — [Save as Portfolio]"
  - ✅ Click [Save as Portfolio] button
  - ✅ Modal opens with auto-filled name (e.g., "Account A + Account C")
  - ✅ User can edit name before saving
  - ✅ Save button saves new portfolio
  - ✅ Portfolio auto-activates after creation
  - ✅ Selector now shows new portfolio name
  - ✅ Portfolio appears in Settings → Portfolios

#### Scenario 4: Modified Selection Banner (Subset/Superset)
**Path:** Allocation page (modified portfolio selection)
1. Create "Family Portfolio" with Account A + Account B (Scenario 1)
2. Go to Allocation page
3. Click account selector
4. Select only Account A (subset of Family Portfolio)
- **Expected Results:**
  - ✅ **Subset Banner** appears: "⚠️ Modified selection for "Family Portfolio""
  - ✅ Message: "You've selected a subset of this portfolio's accounts"
  - ✅ Banner shows instead of "Save as Portfolio" banner

5. Now select Account A + Account B + Account C (superset)
- **Expected Results:**
  - ✅ **Superset Banner** appears: "⚠️ Modified selection for "Family Portfolio""
  - ✅ Message: "You've selected a superset of this portfolio's accounts"

#### Scenario 5: Duplicate Name Validation
**Path:** Settings → Portfolios (form validation)
1. Create "Family Portfolio" with A + B (Scenario 1)
2. Go to Settings → Portfolios
3. Click "Add portfolio"
4. Try entering name: "Family Portfolio" (duplicate)
- **Expected Results:**
  - ✅ Name field shows error: "Name already exists"
  - ✅ Create button is disabled
  - ✅ Clear error when name changed to new value
  - ✅ Button re-enables with valid name

#### Scenario 6: Selector Display Consistency
**Path:** Allocation page (verification of selector state)
1. Complete Scenarios 2-4
2. Close and reopen the page (refresh browser or restart app)
- **Expected Results:**
  - ✅ Selector remembers last portfolio selection
  - ✅ Allocation data loads for that portfolio
  - ✅ No toast spam on page reload
  - ✅ Banners respect the current selection state

---

## 8. Phase 4 Enhancements (Future)

### 8.1 Allocation Preferences (Settings Toggle)

**Goal:** Give users control over holding target behavior via settings.

**Implementation (1-2 days):**

```tsx
// Settings Page: Allocation Preferences
┌────────────────────────────────────────┐
│ Allocation Preferences                 │
│                                        │
│ Holding Target Behavior:               │
│ ● Preview before distributing (default)│ ← Hybrid #1 (Phase 3)
│ ○ Strict mode (must sum to 100%)      │ ← Option 3 (new)
└────────────────────────────────────────┘
```

**Modes:**

1. **Preview Mode (Default - Hybrid #1):**
   - Shows live preview of auto-distributed %
   - User clicks "Save All Targets" to commit
   - Allows partial allocation (< 100%)
   - Best for casual users

2. **Strict Mode (Opt-in):**
   - Enforces 100% sum validation
   - Blocks save if targets don't sum to 100%
   - Shows error: "Holdings must sum to 100%. Current: X%"
   - For advanced users who want explicit control

**Storage:**
```typescript
// localStorage or user preferences
{
  "allocation": {
    "holdingTargetMode": "preview" | "strict"
  }
}
```

**Mutation Logic Update:**
```typescript
const mode = useAllocationPreferences().holdingTargetMode;

if (mode === 'preview') {
  // Phase 3 behavior: Show preview, allow save
  showAutoDistributedPreview();
  allowSave();

} else if (mode === 'strict') {
  // Phase 4 behavior: Enforce 100%
  const total = calculateTotal();
  if (total !== 100) {
    toast.error(`Must sum to 100%. Current: ${total}%`);
    preventSave();
  }
}
```

### 8.2 Other Deferred Features

**Not included in Phase 3 or 4:**
- ❌ Holdings Allocation table view (optional alternative to side panel)
- ❌ Sub-pie chart visualization in side panel (nice-to-have)
- ❌ Drag-and-drop reordering of holdings
- ❌ Bulk import/export of holding targets
- ❌ Historical tracking of target changes
- ❌ Alerts/notifications when holdings drift from targets
- ❌ Mobile-specific responsive design (will adapt existing responsive patterns)

---

## 9. Sprint Status & Progress Tracking

### Portfolio Feature Implementation ✅ 100% COMPLETE

**Status**: READY FOR TESTING - All implementation complete

Portfolio feature fully implemented! All core functionality and UX polish complete.

**Completed Tasks:**
- ✅ Database migration (portfolios table) - `2026-01-29-044552-0000_create_portfolios_table`
- ✅ Database fields added (is_combined_portfolio, component_account_ids to accounts table)
- ✅ Rust backend models (Portfolio, NewPortfolio in types)
- ✅ Rust backend repository (`find_or_create_combined_portfolio` in accounts service)
- ✅ Tauri commands + Axum endpoints (createPortfolio, listPortfolios, deletePortfolio, etc.)
- ✅ Settings → Portfolios page (`src/pages/settings/portfolios/portfolios-page.tsx`)
- ✅ Portfolio CRUD components (form, item, operations, edit modal)
- ✅ Portfolio hooks (`src/hooks/use-portfolios.ts` with mutations)
- ✅ Command wrappers (`src/commands/portfolio.ts` - desktop/web support)
- ✅ Account selector enhanced (supports portfolio view)
- ✅ Validation logic (minimum 2 accounts, unique names)
- ✅ **Auto-match toast notification** - Detects when selected accounts match a saved portfolio with toast: "✓ Matched Portfolio {name}"
- ✅ **"Save as Portfolio" banner** - Shows blue banner for multi-select without match, opens modal with auto-filled name
- ✅ **"Modified selection" banner** - Shows amber warning for subset/superset selections
- ✅ **SaveAsPortfolioModal component** - Sheet-based modal with form validation, auto-fill, and CRUD integration

**Implementation Files:**
- Modified: `src/pages/allocation/index.tsx` (added auto-match effect, banners, modal integration)
- Created: `src/pages/allocation/components/save-as-portfolio-modal.tsx` (new modal component)

**Key Implementation Details:**
1. **Auto-Match Toast** (lines 337-368):
   - Uses `usePortfolios` hook to fetch all portfolios
   - Detects order-independent matching (A+B = B+A)
   - Deduplicates toasts with `lastToastPortfolioId` ref to prevent spam
   - Shows green success variant toast: "✓ Matched Portfolio {name}"

2. **Save as Portfolio Banner** (lines 675-742):
   - Computed state with `useMemo` for efficiency
   - Shows when 2+ accounts selected without exact portfolio match
   - Blue banner with "Save as Portfolio" button that opens modal
   - Displays account composition: "Includes: Account A, Account B"

3. **Modal Component** (171 lines) - FULLY FEATURED:
   - Auto-fills name from selected account names
   - Form validation with react-hook-form + Zod
   - **Real-time duplicate name validation**: Shows error message "This portfolio name is already taken." when user types duplicate
   - **Save button UX feedback**: Button becomes semi-transparent/disabled when form has validation errors
   - Shows selected accounts with currencies in scrollable list
   - Auto-closes after save, resets form
   - Fully functional portfolio creation

4. **Portfolio Composition Display** (lines 789-795):
   - Shows portfolio name and selected accounts when viewing a multi-account portfolio
   - Simple, clear display: portfolio name on first line, "Includes: [accounts]" on second

**Changes Made After User Feedback:**
- Removed "Modified Selection" banner (subset/superset detection) - was confusing and didn't add value
- Updated combined accounts banner to show portfolio composition instead of "saved separately" message
- Fixed SaveAsPortfolioModal to properly handle form submission and save new portfolios
- Added duplicate name validation with real-time error message feedback
- Added disabled button state when form validation fails for better UX

**Test Scenarios Status:**
- ✅ **Scenario 1**: Create Portfolio in Settings - IMPLEMENTED & WORKING (Settings page, form validation, duplicate checking)
- ✅ **Scenario 2**: Multi-Select Auto-Matching - IMPLEMENTED & WORKING (toast fires on match, order-independent)
- ✅ **Scenario 3**: Save Multi-Select as Portfolio - IMPLEMENTED & WORKING (banner + modal, validation, auto-save works)
- ✅ **Scenario 5**: Duplicate Name Validation - IMPLEMENTED & WORKING (real-time error message + disabled button)
- ✅ **Scenario 6**: Selector Display Consistency - IMPLEMENTED & WORKING (React Query caching, state persists)

---

### Sprint 1: Backend Foundation ✅ COMPLETE
- ✅ Database schema (holding_targets table) - Migration `2026-01-20-000001`
- ✅ is_locked added to holding_targets - Migration `2026-01-28-101335-0000`
- ✅ is_locked added to asset_class_targets - Migration `2026-01-28-120000-0000`
- ✅ Rust backend commands (get_holding_targets, save_holding_target, toggle_holding_target_lock)
- ✅ TypeScript types (HoldingTarget, AssetClassTarget)
- ✅ Migrations applied
- ✅ Core data layer working (rebalancing repository/service)

### Sprint 2: Enhanced Side Panel UI ✅ COMPLETE + Portfolio Feature ✅ 100% COMPLETE

**Portfolio Feature - FULLY IMPLEMENTED & READY FOR PRODUCTION:**
- ✅ Database migration (portfolios table) - `2026-01-29-044552-0000_create_portfolios_table`
- ✅ Rust backend models (Portfolio, NewPortfolio)
- ✅ Rust backend repository (`find_or_create_combined_portfolio` in accounts service)
- ✅ Tauri commands + Axum endpoints (createPortfolio, listPortfolios, deletePortfolio, etc.)
- ✅ Settings → Portfolios page (full CRUD UI with form validation)
- ✅ Account selector enhanced (multi-select, portfolio grouping)
- ✅ **Auto-match toast notification** - Detects when selected accounts match a saved portfolio
- ✅ **"Save as Portfolio" banner** - Shows when 2+ accounts selected without match
- ✅ **SaveAsPortfolioModal component** - Full form with validation
- ✅ **Real-time duplicate name validation** - Error message appears immediately when name already exists
- ✅ **Save button visual feedback** - Button becomes semi-transparent when form invalid
- ✅ **Portfolio composition display** - Shows portfolio name + accounts when exact match detected
- ✅ All validation logic (minimum 2 accounts, unique names)
- ✅ Build verification (all changes passing compilation)

**Implementation Files Modified:**
- `src/pages/allocation/index.tsx` - Added auto-match effect, banners, modal integration
- `src/pages/allocation/components/save-as-portfolio-modal.tsx` - NEW component with full validation

**Side Panel UI - PARTIALLY COMPLETE:**
- ✅ React Query hooks (use-holding-target-queries, use-holding-target-mutations)
- ✅ HoldingTargetRow component with text input (`src/pages/allocation/components/holding-target-row.tsx`)
- ✅ Side panel integration with sub-asset class grouping (allocation-pie-chart-view.tsx)
- ✅ Lock/delete functionality for holdings
- ✅ Visual progress bars (h-3 compact size)
- ✅ Custom toast notifications for lock/unlock actions (with holding names)
- ✅ Lock state synchronization fixes (localStorage + database persistence)
- ✅ Proportional calculation respects locks (proportional auto-adjustment)
- ✅ Navigation to holding detail pages (clickable holding names)
- ✅ Lock toggle shows custom toast: "VTI is now locked" (not generic "updated" message)

**In Progress:**
- 🔄 Live Preview functionality (bold vs italic styling)
- 🔄 Auto-distribution calculation display
- 🔄 "Save All Targets" button (batch save)
- 🔄 Total % indicator: "Total: 100% ✓"

**Blocked/Known Issues:**
- ⚠️ Toast notification appears behind side panel Sheet overlay (minor UX issue - toast visible when sheet closes)

### Sprint 3: Rebalancing Integration ⏳ NOT STARTED
- ⏳ Per-holding buy suggestions
- ⏳ Cash allocation logic
- ⏳ Rebalancing advisor UI updates
- ⏳ Integration tests

---

## 10. Known Issues & Technical Debt

### Minor UX Issues
1. **Toast Behind Side Panel**: Lock/unlock toast notification appears behind Sheet overlay
   - **Impact**: Low - toast becomes visible when sheet closes
   - **Root Cause**: Shadcn Sheet and Toast z-index layering
   - **Status**: Deferred - not blocking Sprint 2 completion

### Future Enhancements
- Consider adding undo/redo for target changes
- Explore keyboard shortcuts for power users (Tab to navigate, Enter to save)
- Add visual indicator when targets are being auto-distributed vs user-set

---

## 11. Success Criteria

**Phase 3 is complete when:**
- ✅ User can set target percentages for individual holdings within asset classes
- ✅ Targets validate to sum to 100% per asset class
- ✅ Lock/delete work at holding level (independent of asset class locks)
- ✅ Side panel shows holdings with text input (no sliders)
- ✅ Holding names are clickable and navigate to detail pages
- ✅ Rebalancing advisor shows per-holding BUY suggestions
- ✅ All tests pass (unit + integration)
- ✅ Desktop and web modes both work
- ✅ No regressions in Phase 2 asset class functionality

---

## 10. Questions to Resolve Before Starting

- [x] Should we keep asset class section in panel? **DECISION: Yes, keep current implementation (bars + text input) - evaluate space later**
- [x] Sliders or text input for holdings? **DECISION: Text input only (consistent, compact)**
- [x] Preserve clickable holdings navigation? **DECISION: Yes, critical requirement**
- [ ] Show sub-pie chart in panel or defer? **PENDING**
- [ ] Mobile responsiveness strategy? **PENDING**
- [ ] Should auto-fill be opt-in or automatic? **PENDING**

---

## 11. Critical Implementation Reminders

**DO NOT FORGET:**

✅ **Navigation Preservation:**
- Holding names MUST be clickable → navigate to `/holdings/{symbol}`
- Use `onNavigate` callback pattern shown in component designs
- Test navigation flow: click holding → detail page → back button → panel still open

✅ **Text Input Pattern (No Sliders in Panel):**
- Holdings use text input only (like current asset class section)
- Visual bars are read-only feedback (show current vs target)
- Consistent with current panel UX
- Saves vertical space for more holdings

✅ **Validation Rules (Phase 3 - Hybrid #1):**
- NO strict 100% validation in Phase 3 (deferred to Phase 4 settings)
- Live preview shows auto-distributed % for unset holdings
- User-set targets in bold, auto-calculated in italic/grey
- "Save All Targets" button commits all values at once
- Locked holdings cannot be auto-adjusted
- Show total % indicator: "Total: 100% ✓" or "Total: 75% (25% auto)"

✅ **Lock Behavior:**
- Lock icon pattern: `bg-secondary text-gray-700` (Phase 2 standard)
- Locked holdings protected from auto-scaling
- Can still manually edit locked holdings via text input
- Delete locked holding → show AlertDialog (same as Phase 2)

✅ **Cascading Percentages:**
- Formula: `Portfolio % = Asset Class % × Holding % of Asset Class`
- Example: VTI 50% of Equity × 60% Equity = 30% of portfolio
- Display both percentages in UI for clarity

✅ **Backend Validation:**
- ✅ Phase 3: 100% sum constraint DISABLED (commented out)
- Repository has foreign key constraints (asset_class_id, asset_id)
- Use existing `holding_targets` table (confirmed in migrations)
- TODO: Re-enable strict validation in Phase 4 as optional mode

✅ **Rebalancing Integration:**
- Must update rebalancing-advisor.tsx in Sprint 3
- Generate per-holding BUY suggestions (cash-first, never SELL)
- Group suggestions by asset class for clarity

✅ **Component Reuse:**
- Reuse existing Sheet component (don't create new side panel)
- Reuse Collapsible for expandable sections
- Reuse AlertDialog for locked deletion warnings
- Icons: Lock, LockOpen, Trash2 (same as Phase 2)

**Last Updated:** January 28, 2026
**Status:** Sprint 1 Complete ✅, Sprint 2 In Progress 🔄
**Current Focus:** Live Preview UI (Hybrid #1)
**Next Step:** Complete Sprint 2 - Add live preview and "Save All Targets" button
