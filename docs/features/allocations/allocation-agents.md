# Allocation Feature - Agent Guide

**Purpose**: Feature-specific architecture, patterns, and workflow for AI agents working on the Allocation feature.

**Related Docs**:
- [phase-3.md](phase-3.md) - Master implementation plan
- [readme.md](readme.md) - Feature overview and navigation
- Root [AGENTS.md](../../AGENTS.md) - General repository guidelines

---

## Feature Overview

The Allocation feature enables users to:
1. Set target allocation percentages for asset classes (e.g., 60% Equity, 40% Fixed Income)
2. Set target percentages for individual holdings within each asset class
3. Create portfolios (groups of accounts) with independent strategies
4. Get automated rebalancing advice (which holdings to buy)

**Current Status**: Phase 3 Sprint 2 (85% complete, blocked by Portfolio feature)

---

## Critical Architecture Decisions

### Multi-Level Target System

```
Portfolio (All Accounts) 100%
└── Asset Class Target: 60% Equity
    └── Holding Target: 40% VWCE
    └── Holding Target: 60% VTI
```

**Key Rules**:
- Holding targets are percentages **of their asset class**, not the portfolio
- Example: VTI 50% of Equity × 60% Equity = 30% of total portfolio
- Constraint: All holding targets within an asset class must sum to 100%
- Auto-fill: Unallocated holdings receive remainder proportionally

### Portfolio Architecture

**Portfolios are lightweight groupings** of 2+ accounts:
- Stored in `portfolios` table with JSON array of account IDs
- Enable unified allocation management without data duplication
- Each portfolio/account has independent allocation strategy
- Support quick multi-select for ad-hoc exploration

**Implementation Priority**: 🚨 **Portfolio feature MUST be completed before Sprint 2**

---

## Database Schema

### Core Tables

```sql
-- Portfolios (groups of accounts)
CREATE TABLE portfolios (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    account_ids TEXT NOT NULL,  -- JSON: ["id1", "id2"]
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Rebalancing strategies (one per portfolio/account)
CREATE TABLE rebalancing_strategies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,  -- NULL = "All Portfolio"
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Asset class targets (e.g., 60% Equity)
CREATE TABLE asset_class_targets (
    id TEXT NOT NULL PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_percent REAL NOT NULL CHECK (target_percent >= 0 AND target_percent <= 100),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,  -- Prevents auto-adjustment
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id) ON DELETE CASCADE,
    UNIQUE(strategy_id, asset_class)
);

-- Holding targets (e.g., 40% VTI within Equity)
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- FK to assets table, NOT symbol string
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)
);
```

**Migration Locations**:
- `src-core/migrations/2026-01-20-000001_fix_allocation_schema/up.sql`
- `src-core/migrations/2026-01-28-120000-0000_add_is_locked_to_asset_class_targets/up.sql`

---

## Key Files & Patterns

### Frontend (React/TypeScript)

**Main Page**:
- `src/pages/allocation/index.tsx` - Main allocation page with account selector
- Pattern: Uses Sheet component for side panel (40% width)

**Components**:
- `src/pages/allocation/components/allocation-pie-chart-view.tsx` - Target vs Actual section (right panel)
- `src/pages/allocation/components/holding-target-row.tsx` - Individual holding row with text input
- `src/pages/allocation/components/asset-class-target-card.tsx` - Asset class card (main view)

**Hooks (React Query)**:
- `src/pages/allocation/hooks/use-asset-class-mutations.ts` - Asset class CRUD + lock toggle
- `src/pages/allocation/hooks/use-holding-target-mutations.ts` - Holding CRUD + lock toggle
- `src/pages/allocation/hooks/use-holding-target-queries.ts` - Fetch holding targets

**Command Wrappers** (Desktop/Web):
- `src/commands/allocation.ts` - Frontend bridge (switches on `RUN_ENV`)
- Pattern: `invokeTauri()` for desktop, `invokeWeb()` for web mode

### Backend (Rust)

**Core Models**:
- `src-core/src/rebalancing/rebalancing_model.rs` - Domain models (RebalancingStrategy, AssetClassTarget, HoldingTarget)
- Pattern: Separate domain models from database models (DTO pattern)

**Repository**:
- `src-core/src/rebalancing/rebalancing_repository.rs` - Database operations
- Pattern: Use `get_connection(&pool)` for reads, `writer.exec(...)` for writes

**Service**:
- `src-core/src/rebalancing/rebalancing_service.rs` - Business logic
- Pattern: Service wraps repository, handles validation

**Tauri Commands**:
- `src-tauri/src/commands/rebalancing.rs` - Desktop IPC commands
- Registered in: `src-tauri/src/lib.rs`

**Axum Endpoints** (Web mode):
- `src-server/src/api.rs` - HTTP endpoints
- Mirror Tauri commands for web compatibility

---

## Common Patterns

### Toast Notifications with Custom Messages

```typescript
// In mutation
const saveTargetMutation = useMutation({
  mutationFn: async (payload: SaveTargetPayload & { toastMessage?: string }) => {
    const result = await saveAssetClassTarget(payload);
    return { result, toastMessage: payload.toastMessage };
  },
  onSuccess: (data) => {
    toast({
      description: data.toastMessage || "Allocation target saved successfully",
    });
  },
});

// In component
onUpdateTarget={async (assetClass, newPercent, isLocked?) => {
  const isLockChange = isLocked !== undefined && isLocked !== target.isLocked;
  const isPercentChange = newPercent !== target.targetPercent;

  let customMessage: string | undefined;
  if (isLockChange && !isPercentChange) {
    customMessage = `${assetClass} is now ${isLocked ? 'locked' : 'unlocked'}`;
  }

  await saveTargetMutation.mutateAsync({
    assetClass,
    targetPercent: newPercent,
    isLocked,
    toastMessage: customMessage,
  });
}}
```

### Proportional Calculation with Locks

```typescript
function calculateProportionalTargets(
  targets: AssetClassTarget[],
  newTotal: number,
  lockedAssets: Set<string>
): AssetClassTarget[] {
  const locked = targets.filter(t => lockedAssets.has(t.assetClass));
  const unlocked = targets.filter(t => !lockedAssets.has(t.assetClass));

  const lockedSum = locked.reduce((sum, t) => sum + t.targetPercent, 0);
  const remaining = newTotal - lockedSum;

  const unlockedSum = unlocked.reduce((sum, t) => sum + t.targetPercent, 0);

  return targets.map(target => {
    if (lockedAssets.has(target.assetClass)) {
      return target; // Keep locked values
    }
    const proportion = unlockedSum > 0 ? target.targetPercent / unlockedSum : 1 / unlocked.length;
    return {
      ...target,
      targetPercent: remaining * proportion,
    };
  });
}
```

### Lock State Styling

```typescript
// Visual feedback for locked state
const lockClasses = isLocked
  ? 'bg-muted/50 opacity-50 cursor-not-allowed'
  : '';

// Disable input when locked
<Input
  disabled={isLocked}
  className={cn(lockClasses)}
/>

// Lock button styling
<Button
  variant={isLocked ? "secondary" : "ghost"}
  size="sm"
  onClick={onToggleLock}
>
  {isLocked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
</Button>
```

---

## Sprint Workflow & Git Commits

### When Completing a Task/Step

**1. Verify Changes Work**:
```bash
# Test desktop mode
pnpm tauri dev

# Test web mode (if touched server/adapters)
pnpm run dev:web

# Run tests
pnpm test
```

**2. Commit with Clear Message** (follow AGENTS.md):
```bash
# Format: <type>: <description>
# Types: feat, fix, refactor, docs, test, chore

# Examples:
git add .
git commit -m "feat(allocation): add Portfolio table migration and models"
git commit -m "feat(allocation): create Settings → Portfolios page"
git commit -m "fix(allocation): lock toggle toast showing incorrect message"
git commit -m "refactor(allocation): extract proportional calculation to hook"
```

**Commit Message Guidelines**:
- Use present tense ("add" not "added")
- Be specific about what changed
- Reference sprint/section if helpful: "Sprint 2: add live preview"
- Keep subject line under 72 characters
- Add body if complex change (explain why, not what)

**3. Update phase-3.md Checklist**:
```markdown
### Portfolio Feature Implementation 🔄 IN PROGRESS

**Tasks:**
- ✅ Database migration (portfolios table)  ← Mark complete
- ✅ Rust backend (models, repository, commands)
- 🔄 Settings → Portfolios page  ← Update status
- ⏳ Portfolio CRUD hooks
```

**4. Add Remarks/Troubleshooting** (if needed):
```markdown
**Known Issues:**
- ⚠️ Portfolio auto-matching doesn't work with 10+ accounts (performance)
  - Solution: Add debouncing to auto-match logic
  - Tracked in: issue #123

**Implementation Notes:**
- Used JSON array for account_ids (simpler than junction table)
- Portfolio name auto-updates on account rename (see edge case handler)
```

### When Completing a Sprint

**1. Update Sprint Status in phase-3.md**:
```markdown
### Sprint 2: Enhanced Side Panel UI ✅ COMPLETE

**Completed:**
- ✅ React Query hooks
- ✅ HoldingTargetRow component
- ✅ Live Preview functionality
- ✅ "Save All Targets" button
- ✅ Total % indicator

**Blocked/Known Issues:**
- ⚠️ Toast behind side panel (minor, deferred)
```

**2. Create Sprint Completion Commit**:
```bash
git add .
git commit -m "feat(allocation): complete Sprint 2 - Enhanced Side Panel UI

- Implemented live preview with auto-distribution
- Added 'Save All Targets' batch save button
- Added total % validation indicator
- All 6 test scenarios passing
- Known issue: Toast z-index (documented, deferred)

Closes Sprint 2. Next: Sprint 3 (Rebalancing Integration)"
```

**3. Document Lessons Learned**:
Add to phase-3.md section 10 (Known Issues) or archive/session_end_state.md

### When Completing a Phase

**1. Update Phase Status**:
```markdown
## Overview

**Goal:** Enable per-holding target allocation ✅ COMPLETE

**Timeline:** 4-6 days across 3 sprints ✅ COMPLETE

**Date Completed:** January 29, 2026
```

**2. Create Phase Summary Document**:
```bash
# Archive current phase details
cp phase-3.md archive/phase-3-completed.md

# Create phase-4.md for next phase
```

**3. Create Phase Completion Commit**:
```bash
git add .
git commit -m "feat(allocation): complete Phase 3 - Per-Holding Target Allocation

Phase 3 Summary:
- Sprint 1: Backend foundation (migrations, models, commands)
- Sprint 2: Enhanced side panel UI with live preview
- Sprint 3: Rebalancing integration with per-holding suggestions
- Portfolio feature: Multi-account grouping and strategies

All success criteria met:
✅ Users can set holding targets within asset classes
✅ Targets validate to 100% per asset class
✅ Lock/delete work at holding level
✅ Side panel with text inputs functional
✅ Rebalancing shows per-holding buy suggestions
✅ Desktop and web modes both working

Next: Phase 4 (Advanced Features)"
```

---

## Test Scenarios Checklist

### Portfolio Feature (Must Pass Before Sprint 2)

- [ ] **Scenario 1**: Create Portfolio in Settings
- [ ] **Scenario 2**: Multi-Select Auto-Matching
- [ ] **Scenario 3**: Save Multi-Select as Portfolio
- [ ] **Scenario 4**: Account Deletion Handling
- [ ] **Scenario 5**: Duplicate Name Validation
- [ ] **Scenario 6**: Minimum Accounts Validation

### Sprint 2: Live Preview & Batch Save

- [ ] Enter holding targets → see live preview (italic/grey)
- [ ] Lock holding → preview excludes it from auto-calculation
- [ ] Click "Save All Targets" → saves user-set + auto-calculated
- [ ] Total % indicator shows "100% ✓" or "X% (incomplete)"
- [ ] Click holding name → navigates to detail page
- [ ] Delete holding target → redistributes proportionally

### Sprint 3: Rebalancing

- [ ] Set holding targets → rebalancing shows per-holding suggestions
- [ ] Lock holding → suggestion skips that holding
- [ ] Insufficient cash → shows partial + "Need $X more"
- [ ] No holding targets → falls back to asset class suggestions

---

## Common Troubleshooting

### Build Errors

**"unresolved import WriteActor"**:
- Use `WriteHandle` not `WriteActor`
- Import: `use crate::db::{get_connection, WriteHandle};`

**"trait bound CompatibleType not satisfied"**:
- Struct fields don't match database schema
- Check field count, types, and order in schema.rs
- Ensure all fields initialized in `From` implementations

**ActivityDB missing fields**:
- Pre-existing bug (missing 5 fields)
- Fixed in: `src-core/src/activities/activities_model.rs`

### Runtime Errors

**Toast not showing**:
- Check if custom message passed through mutation
- Verify `toastMessage` parameter in payload type
- Ensure onSuccess handler uses `data.toastMessage`

**Lock state not persisting**:
- Check `is_locked` column exists in migration
- Verify Diesel schema includes `is_locked -> Bool`
- Ensure `From` implementations map the field

**Proportional calculation wrong**:
- Verify `lockedAssets` Set is passed correctly
- Check filter logic separates locked/unlocked
- Ensure remainder calculated after locked sum

---

## Quick Reference

### File Naming Conventions
- **Lowercase with underscores**: `allocation_agents.md`, `phase_3.md`
- **React components**: PascalCase files, kebab-case directories
- **Hooks**: `use-*-queries.ts`, `use-*-mutations.ts`

### Key Commands
```bash
# Desktop dev
pnpm tauri dev

# Web dev
pnpm run dev:web

# Run tests
pnpm test

# Database migration
cd src-core
diesel migration run

# Check Rust
cargo check --manifest-path=src-core/Cargo.toml
```

### Documentation Updates
- Always update phase-3.md sprint status after completing tasks
- Add known issues to section 10
- Update test scenario checkboxes as you verify them
- Keep readme.md "Getting Started" section current

---

## File Management Rules

**Philosophy**: "Less is more" - consolidate documentation, avoid scattered summary files.

### Creating New Files

**Before creating any new file**, ask yourself:
- Is this truly **technical documentation** (e.g., architecture decision, tricky algorithm)?
- Or is this a **summary/checklist** (which belongs in phase-3.md)?

**Rules**:
1. **Update existing phase file first** - Add to the current `phase-N.md` file before creating new files
2. **File naming**: Use `lowercase_with_underscores`, not `UPPERCASE-WITH-HYPHENS`
3. **Phase files are canonical** - Each phase has ONE file: `phase-1.md`, `phase-2.md`, `phase-3.md`, etc.
4. **Archive folder** (`archive/`) - Use ONLY for truly important technical documentation:
   - Complex algorithm explanations (not just implementation)
   - Architecture diagrams and decision records
   - Historical technical notes for understanding code
   - Do NOT archive checklists, summaries, or process docs
5. **Get approval first** - Ask before creating new files outside phase files

### What Goes Where

| Type | Location | Notes |
|------|----------|-------|
| Test scenarios | `phase-N.md` section 7.x | Consolidated into main phase file |
| Implementation checklist | `phase-N.md` section 9 | Sprint status section |
| UI visual reference | Inline in test scenarios or phase file | Keep descriptions in test scenarios |
| Architecture decisions | `allocation-agents.md` | This file for patterns, core decisions |
| Tricky algorithms | `archive/` + reference from code | Only if truly complex |
| Temporary planning docs | Delete when done | Don't commit temporary files |
| Summary/delivery notes | `phase-N.md` section 9 | Update sprint status, not separate file |

### Recent Consolidation (Phase 3)

Consolidated into [phase-3.md](phase-3.md):
- Test scenarios (section 7.4)
- Implementation completion details (section 9 Portfolio Feature)
- Completion summary (section 9)
- Testing checklist (section 7.4)

Files deleted:
- `TESTING_CHECKLIST.md` (consolidated)
- `COMPLETION_SUMMARY.md` (consolidated)
- `IMPLEMENTATION_CHECKLIST.md` (consolidated)
- `UI_VISUAL_REFERENCE.md` (consolidat)
- `PHASE3_DELIVERY.md` (consolidated)
- `documentation_cleanup_plan.md` (temporary)

---

## Next Steps (Current Priority)

🚨 **PRIORITY 1**: Portfolio Feature Implementation (section 1.4)
1. Create portfolios table migration
2. Add Rust models (Portfolio, NewPortfolio, PortfolioDB)
3. Implement repository methods (CRUD + auto-match)
4. Create Settings → Portfolios page
5. Add portfolio hooks (queries + mutations)
6. Update account selector (portfolios section + multi-select)
7. Implement banners and auto-matching
8. Handle edge cases (validation, deletion, renaming)
9. Verify all 6 test scenarios pass

**After Portfolio Complete**:
- Resume Sprint 2: Live Preview functionality
- Add "Save All Targets" button
- Add Total % indicator
- Complete Sprint 2 checklist

**Reference**: See [phase-3.md section 1.4](phase-3.md#14-portfolio-feature-implementation-plan) for detailed implementation plan.
