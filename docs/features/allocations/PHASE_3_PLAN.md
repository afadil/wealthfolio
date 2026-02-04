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

### Sprint 2: Enhanced Side Panel UI (2-3 days)

**Tasks:**
1. Create `AssetClassSidePanel.tsx`:
   - Read-only asset class header
   - Holdings breakdown section
   - Integration with Sheet component
2. Create `HoldingTargetRow.tsx`:
   - Text input for target percentage
   - Visual progress bar
   - Lock/delete buttons
   - Clickable holding name (navigation)
   - Validation feedback
3. Create React Query hooks:
   - `use-holding-target-queries.ts`
   - `use-holding-target-mutations.ts`
   - `use-cascading-percentages.ts`
4. Update `allocation-pie-chart-view.tsx`:
   - Pass selected asset class to side panel
   - Replace current side panel content with `AssetClassSidePanel`
5. Update `index.tsx`:
   - Import new components
   - Wire up data flow

**Validation:**
- Click pie slice → side panel opens with holdings
- Enter target percentage → saves to backend
- Lock holding → prevents auto-adjustment
- Delete holding target → proportional auto-fill
- Click holding name → navigates to detail page
- Sum validation: cannot save if holdings don't sum to 100%

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

### 5.1 Validation Rules

**Holding Targets (per asset class):**
- Sum of all holding targets in same asset class must equal 100%
- Each target: 0.00% to 100.00% (2 decimal places)
- Locked targets cannot be auto-adjusted
- Deleting a target redistributes its percentage proportionally to unlocked holdings

**Auto-Fill Logic:**
- When user sets target for some holdings but not all:
  - Calculate total allocated: `SUM(set_targets)`
  - Calculate remainder: `100% - total_allocated`
  - Distribute remainder proportionally among unset holdings based on current market values

**Example:**
```
Equity Asset Class (4 holdings):
- VTI: Set to 40% (locked)
- VOO: Set to 30%
- VXUS: Not set (current value: $10k)
- VGT: Not set (current value: $20k)

Auto-fill calculation:
- Allocated: 40% + 30% = 70%
- Remainder: 100% - 70% = 30%
- VXUS gets: 30% × ($10k / $30k) = 10%
- VGT gets: 30% × ($20k / $30k) = 20%
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

---

## 8. Deferred to Phase 4

**Features NOT included in Phase 3:**
- ❌ Holdings Allocation table view (optional alternative to side panel)
- ❌ Sub-pie chart visualization in side panel (nice-to-have)
- ❌ Drag-and-drop reordering of holdings
- ❌ Bulk import/export of holding targets
- ❌ Historical tracking of target changes
- ❌ Alerts/notifications when holdings drift from targets
- ❌ Mobile-specific responsive design (will adapt existing responsive patterns)

---

## 9. Success Criteria

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

✅ **Validation Rules:**
- Holdings within asset class MUST sum to 100%
- Show error if user tries to save with incorrect total
- Locked holdings cannot be auto-adjusted
- Auto-fill distributes remainder proportionally

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
- Service layer enforces 100% sum constraint
- Repository has foreign key constraints (asset_class_id, asset_id)
- Use existing `holding_targets` table (confirmed in migrations)

✅ **Rebalancing Integration:**
- Must update rebalancing-advisor.tsx in Sprint 3
- Generate per-holding BUY suggestions (cash-first, never SELL)
- Group suggestions by asset class for clarity

✅ **Component Reuse:**
- Reuse existing Sheet component (don't create new side panel)
- Reuse Collapsible for expandable sections
- Reuse AlertDialog for locked deletion warnings
- Icons: Lock, LockOpen, Trash2 (same as Phase 2)

**Last Updated:** January 27, 2026
**Status:** Planning Complete, Ready for Implementation
**Next Step:** Sprint 1 - Backend Foundation
