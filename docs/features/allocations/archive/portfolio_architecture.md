# Portfolio Architecture & Implementation Plan

> **⚠️ IMPLEMENTATION STATUS (January 29, 2026)**
>
> This document represents the **original design specification**. The actual
> implementation differs in some UI details:
>
> **✅ Implemented (90% Complete):**
>
> - Database schema (portfolios table)
> - Backend CRUD operations (Rust repository, Tauri commands, Axum endpoints)
> - Settings → Portfolios page (4 components)
> - Portfolio hooks (use-portfolios.ts with mutations)
> - Account selector component (AccountPortfolioSelector)
> - Multi-select state management
> - Validation (2+ accounts, unique names)
>
> **🔄 UI Differences from Spec:**
>
> - **Selector UI**: Uses shadcn Command/CommandItem pattern (NOT checkboxes)
> - **Reasoning**: Matches Insights page style, better UX consistency
> - **Visual**: Check icons instead of checkbox controls
>
> **⏳ Remaining (10%):**
>
> - Auto-matching toast notification
> - "Save as Portfolio" banner
> - "Modified selection" banner
> - Test all 15 scenarios
>
> See [phase-3.md](../phase-3.md) section 1.4 for current implementation status.

## Overview

This document outlines the architecture, UX patterns, and implementation plan
for the Portfolio feature, which allows users to create and manage allocation
strategies across multiple accounts as logical groupings.

## Feature Description

Portfolios are lightweight groupings of accounts that enable unified allocation
management without data duplication. Users can:

- Create named portfolios combining 2+ accounts
- View allocation strategies at the portfolio level
- Quick multi-select accounts for ad-hoc exploration
- Save multi-select combinations as portfolios for future use

## Key Benefits

- **Independent Strategies**: Each portfolio/account gets its own separate
  allocation strategy
- **No Data Duplication**: Portfolios reference accounts, all data stays in
  accounts table
- **Flexible UX**: Support both quick exploration (multi-select) and persistent
  portfolios
- **Multi-Feature Support**: Portfolios can be used across Allocation, Insights,
  Performance pages
- **Clear Separation**: Portfolios ≠ Accounts (no confusion about trading
  accounts)

---

## Architecture Create Portfolio in Settings

**Steps:**

1. Navigate to Settings → Portfolios
2. Click **[+ New Portfolio]**
3. Enter name: "Family Portfolio"
4. Select Account A + Account B
5. Click **[Create Portfolio]**

**Expected Results:**

- ✅ Portfolio created with unique name
- ✅ Accounts saved: A + B
- ✅ Created/updated timestamps set
- ✅ Portfolio appears in list

### Scenario 2: Load Portfolio in Allocation

**Steps:**

1. Navigate to Allocation page
2. Click "Family Portfolio" in selector
3. Verify accounts loaded: A + B
4. Set allocation targets (Stocks 60%, Bonds 40%)

**Expected Results:**

- ✅ Portfolio indicator shows "● Family Portfolio"
- ✅ Checkboxes show A ✓, B ✓
- ✅ Targets editable
- ✅ Strategy saved to portfolio

### Scenario 3: Multi-Select Auto-Matching

**Steps:**

1. Deselect all accounts
2. Check Account A
3. Check Account B
4. Observe auto-detection

**Expected Results:**

- ✅ After A: Shows "Account A"
- ✅ After A+B: Auto-switches to "● Family Portfolio"
- ✅ Toast: "✓ Matched Family Portfolio"
- ✅ Loads existing targets (60% Stocks, 40% Bonds)

### Scenario 4: Subset Selection

**Steps:**

1. Family Portfolio active (A+B)
2. Uncheck Account B
3. Observe behavior

**Expected Results:**

- ✅ Portfolio deactivates
- ✅ Shows "Viewing 1 account" (Account A)
- ✅ Single-account strategy loaded (not portfolio)
- ✅ Different targets shown

### Scenario 5: Superset Selection

**Steps:**

1. Family Portfolio active (A+B)
2. Check Account C
3. Observe behavior

**Expected Results:**

- ✅ Portfolio deactivates
- ✅ Shows "Viewing 3 accounts"
- ✅ Banner: "⚠️ Selection modified from Family Portfolio"
- ✅ Options: [Save as New] [Revert to Family Portfolio]

### Scenario 6: Save Multi-Select as Portfolio

**Steps:**

1. Multi-select: Check A + C (not a saved portfolio)
2. Click banner: **[Save as Portfolio]**
3. Name auto-filled: "Account A + Account C"
4. Edit name: "Investment Portfolio"
5. Save

**Expected Results:**

- ✅ Banner shows: "💡 Viewing 2 accounts — [Save as Portfolio]"
- ✅ Inline form opens with auto-generated name
- ✅ User can edit name
- ✅ Portfolio created and auto-activated
- ✅ Shows "● Investment Portfolio"

### Scenario 7: Exact Match Detection

**Steps:**

1. Create Portfolio X (A+B+C)
2. Deselect all
3. Manually check: A → B → C (in order)
4. Observe auto-matching

**Expected Results:**

- ✅ After A: Single account
- ✅ After A+B: Multi-select (2 accounts, no match)
- ✅ After A+B+C: Auto-switches to "● Portfolio X"
- ✅ Toast confirmation shown

### Scenario 8: Account Deletion Handling

**Steps:**

1. Create Portfolio Y (A+B+D)
2. Delete Account D from Settings → Accounts
3. Navigate to Settings → Portfolios
4. View Portfolio Y

**Expected Results:**

- ✅ Portfolio Y shows warning: "⚠️ Incomplete (Account D deleted)"
- ✅ Options: [Update Portfolio] [Delete Portfolio]
- ✅ If loaded: Only A+B shown, warning toast
- ✅ No crash or data loss

### Scenario 9: Account Renaming Updates Portfolio

**Steps:**

1. Create Portfolio Z = "Degiro + IB"
2. Rename "Degiro" → "Degiro NL" in Settings → Accounts
3. View Settings → Portfolios

**Expected Results:**

- ✅ Portfolio Z name updates: "Degiro NL + IB"
- ✅ Notification shown: "⚠️ Account Degiro was renamed"
- ✅ Portfolio still functional
- ✅ Accounts link preserved

### Scenario 10: Duplicate Name Validation

**Steps:**

1. Create Portfolio "Family Portfolio" (exists)
2. Try creating another "Family Portfolio"
3. Submit form

**Expected Results:**

- ✅ Validation error: "Name already exists"
- ✅ Create button disabled until valid name
- ✅ User must choose unique name
- ✅ No duplicate created

### Scenario 11: Minimum Accounts Validation

**Steps:**

1. Click **[+ New Portfolio]**
2. Try creating with 0 accounts
3. Try creating with 1 account
4. Select 2 accounts

**Expected Results:**

- ✅ 0 accounts: Button disabled, error shown
- ✅ 1 account: Error: "Minimum 2 accounts required"
- ✅ 2 accounts: Button enabled, can create
- ✅ Validation clear and immediate

### Scenario 12: Order Independence

**Steps:**

1. Create Portfolio M (A+B+C)
2. Multi-select: C → B → A (reverse order)
3. Observe matching

**Expected Results:**

- ✅ Auto-switches to "● Portfolio M"
- ✅ Same portfolio loaded (order irrelevant)
- ✅ Account order in JSON array doesn't affect matching
- ✅ No duplicate portfolio created

### Scenario 13: Banner Dismissal Persistence

**Steps:**

1. Multi-select A+D (no portfolio)
2. Dismiss banner (×)
3. Repeat 2 more times
4. Multi-select again

**Expected Results:**

- ✅ After 3 dismissals: Checkbox "Don't show again" appears
- ✅ If checked: Banner doesn't show on future multi-selects
- ✅ Preference saved in settings
- ✅ Can re-enable in Settings → General

### Scenario 14: All Portfolios View

**Steps:**

1. Select "All Portfolios" from dropdown
2. Verify aggregated view
3. Check Account A

**Expected Results:**

- ✅ Shows aggregated data from all accounts
- ✅ Indicator: "● All Portfolios"
- ✅ Selecting individual account: Switches to single-account view
- ✅ "All Portfolios" is separate from saved portfolios

### Scenario 15: Persistence Across Restarts

**Steps:**

1. Create Portfolio R (A+B)
2. Set targets: Stocks 70%, Bonds 30%
3. Quit app
4. Restart app
5. Load Portfolio R

**Expected Results:**

- ✅ Portfolio R exists in list
- ✅ Accounts: A + B loaded
- ✅ Targets: 70% Stocks, 30% Bonds
- ✅ All data persisted correctly

3. See banner: "💡 Viewing 2 accounts — [Save as Portfolio]"
4. Click **[Save as Portfolio]**
5. Name it "Family Portfolio" (auto-filled: "Degiro + IB")
6. Save → Portfolio created
7. Next time: Click "Family Portfolio" from dropdown (instant load)

### Journey C: Proactive Setup (Organized User)

1. Go to Settings → Portfolios
2. Click **[+ New Portfolio]**
3. Name: "Retirement Strategy"
4. Select: IB + Revolut → Create
5. Go to Allocation page
6. Select "Retirement Strategy" from dropdown → Done

---

## UI Components

### 1. Allocation Page - Account Selector

**IMPLEMENTATION NOTE**: The original design spec used checkboxes, but the
**actual implementation uses shadcn Command/CommandItem pattern** to match the
Insights page style and maintain consistency across the app.

**Implementation Choice (shadcn Command Pattern):**

```
┌──────────────────────────────────────┐
│ Search...                          ▼ │
├──────────────────────────────────────┤
│ ○ All Accounts                 ✓    │ ← CommandItem (click to select)
├──────────────────────────────────────┤
│ Portfolios                           │
│   ○ Family Portfolio           ✓    │ ← Check icon when active
│   ○ Retirement Strategy              │
├──────────────────────────────────────┤
│ Accounts                             │
│   ○ Degiro                     ✓    │ ← Click toggles, Check shows when selected
│   ○ Interactive Brokers        ✓    │
│   ○ Revolut                          │
│   ○ Trading212                       │
└──────────────────────────────────────┘
```

**Why Command Pattern Instead of Checkboxes:**

- ✅ Matches Insights page account selector (consistency)
- ✅ Uses shadcn Command component (already in design system)
- ✅ Check icon appears on selected items (cleaner than checkbox styling)
- ✅ Click-to-toggle UX (familiar from Insights)
- ✅ Better mobile responsiveness
- ✅ Cleaner visual hierarchy without checkbox visual weight

**Implementation Details:**

- Component: `src/components/account-portfolio-selector.tsx`
- Pattern: Popover → Command → CommandList → CommandGroup → CommandItem
- Selection state: Array of account IDs (`selectedAccountIds: string[]`)
- Toggle logic: Click adds/removes ID from array
- Visual feedback: Check icon opacity (100% selected, 0% unselected)

**Original Design (NOT Implemented - for reference):**

- **● Portfolio X** → Active portfolio (exact match)
- **○ Portfolio Y** → Inactive portfolio (click to activate)
- **☑ Account** → Checked (part of current selection)
- **□ Account** → Unchecked

### 2. Save Portfolio Banner (Multi-Select)

**When viewing multi-select (no portfolio match):**

```
┌────────────────────────────────────────────────────────┐
│ 💡 Viewing 2 accounts                                   │
│ [Save as Portfolio]  [×]                               │
└────────────────────────────────────────────────────────┘
```

**After 3 dismissals:**

```
┌────────────────────────────────────────────────────────┐
│ 💡 Viewing 2 accounts                                   │
│ ☐ Don't show again                                     │
│ [Save as Portfolio]  [×]                               │
└────────────────────────────────────────────────────────┘
```

**Inline save form:**

```
┌────────────────────────────────────────────────────────┐
│ Save Portfolio                                          │
│                                                         │
│ Name: [Degiro + Interactive Brokers___________]        │
│       (auto-generated, user can edit)                   │
│                                                         │
│ Accounts: Degiro, Interactive Brokers ✓                │
│                                                         │
│ [Cancel]                            [Save Portfolio]   │
└────────────────────────────────────────────────────────┘
```

### 3. Modified Selection Banner

**When user modifies an active portfolio:**

```
┌────────────────────────────────────────────────────────┐
│ ⚠️ Selection modified from Portfolio X                  │
│ Now viewing: Degiro, IB, Revolut, Trading212           │
│                                                         │
│ [Save as New]  [Revert to Portfolio X]  [×]           │
└────────────────────────────────────────────────────────┘
```

### 4. Auto-Match Confirmation (Dismissible)

**When progressive selection matches a portfolio:**

```
┌────────────────────────────────────────────────────────┐
│ ✓ Matched Portfolio X                                   │
│ Accounts: Degiro, Interactive Brokers, Revolut         │
└────────────────────────────────────────────────────────┘
```

(Auto-dismiss after 3 seconds)

### 5. Settings → Portfolios Page

```
┌──────────────────────────────────────────────────────────┐
│ Portfolios                                [+ New Portfolio]│
├──────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ 📊 Family Portfolio                            [⋮]  │  │
│ │ Accounts: Degiro, Interactive Brokers                │  │
│ │ Created: Jan 15, 2026 • Last updated: Jan 20, 2026  │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ 📊 Retirement Strategy                         [⋮]  │  │
│ │ Accounts: IB, Revolut                                │  │
│ │ ⚠️ Account IB was renamed                           │  │
│ │ Created: Jan 20, 2026                                │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Menu ([⋮])**: Edit, Rename, Delete

**Create Portfolio Dialog:**

```
┌─────────────────────────────────────────┐
│ Create Portfolio                        │
│                                         │
│ Name *                                  │
│ [_____________________________]         │
│                                         │
│ Select Accounts * (minimum 2)          │
│ ☑ Degiro                               │
│ ☑ Interactive Brokers                  │
│ □ Revolut                              │
│ □ Trading212                           │
│                                         │
│ 2 accounts selected                    │
│                                         │
│ [Cancel]              [Create Portfolio]│
└─────────────────────────────────────────┘
```

**Validation:**

- Name required, must be unique
- Minimum 2 accounts
- Button disabled until valid

---

## Edge Cases & Handling

### 1. Account Deletion

**Scenario**: Portfolio X (A+B+C), Account B is deleted

**Handling:**

- Detect orphaned portfolio on load
- Show warning in Settings: "⚠️ Portfolio X is incomplete (Account B was
  deleted)"
- Options:
  - **[Update Portfolio]** → Remove B from portfolio (A+C)
  - **[Delete Portfolio]** → Remove portfolio entirely
  - **[Keep as is]** → Portfolio remains but shows warning
- If loading orphaned portfolio: Load only available accounts (A+C)

### 2. Portfolio Deletion

**Scenario**: Portfolio X deleted while active in Allocation page

**Handling:**

- Selection converts to multi-select (A+B+C still checked)
- Banner: "Portfolio X was deleted — [Save as New Portfolio?]"
- Allocation strategy remains (linked to old portfolio ID)
- User can save as new portfolio or continue as multi-select

### 3. Account Deactivation

**Scenario**: Account B deactivated, part of Portfolio X (A+B+C)

**Handling:**

- Portfolio shows warning icon in Settings: "⚠️ Contains inactive accounts"
- When loading Portfolio X: Show warning toast, load only active accounts (A+C)
- Options: **[Remove inactive]** or **[Reactivate Account B]**

### 4. Duplicate Portfolio Names

**Scenario**: User tries to create "Family Portfolio" (name exists)

**Handling:**

- Validation error: "A portfolio with this name already exists"
- Require unique name (enforced by database constraint)
- No auto-numbering (user must choose different name)

### 5. Empty/Single-Account Portfolios

**Scenario**: User tries to create portfolio with <2 accounts

**Handling:**

- **0 accounts**: "Create Portfolio" button disabled (validation)
- **1 account**: Show error: "Portfolios require at least 2 accounts"
- Minimum enforced: **2 accounts**

### 6. Maximum Accounts Limit

**Scenario**: User adds 10+ accounts to portfolio

**Handling:**

- **No hard limit** (user may have many accounts)
- Performance tip at 10+ accounts: "💡 Large portfolios may load slower"
- Recommendation: Keep under 20 accounts for optimal performance

### 7. Account Renaming

**Scenario**: Portfolio X = "Degiro + IB", user renames Degiro → "Degiro NL"

**Handling:**

- **Auto-update portfolio name** to reflect account changes
- Display name updates: "Degiro NL + IB"
- Show notification in Settings: "⚠️ Account Degiro was renamed to Degiro NL"
- User can manually override portfolio name if desired
- Original custom names preserved unless account list changes

**Implementation:**

```typescript
// Trigger on account rename
function updatePortfolioNamesOnAccountRename(oldName: string, newName: string) {
  const affectedPortfolios = portfolios.filter((p) =>
    p.accountIds.some((id) =>
      accounts.find((a) => a.id === id && a.name === oldName),
    ),
  );

  affectedPortfolios.forEach((portfolio) => {
    // Regenerate display name
    const accountNames = portfolio.accountIds.map(
      (id) => accounts.find((a) => a.id === id)?.name,
    );
    portfolio.name = accountNames.join(" + ");
    portfolio.updatedAt = new Date();
  });
}
```

### 8. Banner Dismissal Persistence

**Scenario**: User dismisses "Save as Portfolio" banner 3+ times

**Handling:**

- After 3 dismissals: Show "Don't show again" checkbox
- Store preference: `settings.portfolioBannerDismissed = true`
- User can re-enable: Settings → General → "Show portfolio save prompts"

### 9. Concurrent Editing

**Scenario**: Same portfolio open in desktop + web browser

**Handling:**

- **Last write wins** (acceptable for single-user app)
- Optimistic updates with conflict detection (future enhancement)
- No locking mechanism (overkill for local-first app)

### 10. Portfolio with Hidden Accounts

**Scenario**: Portfolio X (A+B+C), Account A is filtered/hidden in UI

**Handling:**

- Portfolio remains active (uses account IDs, not visibility)
- Banner: "💡 Portfolio X includes 1 hidden account"
- User can still view combined data
- Unhide accounts to see full composition

---

## Implementation Steps

### Step 1: Core Portfolio Infrastructure (Current Sprint)

**Goal**: Replace combined portfolios with proper portfolios table

**Backend (Rust):**

- [x] Create `portfolios` table migration
- [ ] Implement Portfolio repository (CRUD operations)
- [ ] Portfolio service layer (validation, business logic)
- [ ] Migration script: `accounts.is_combined_portfolio=1` → `portfolios` table
- [ ] Update `allocation_strategies` to reference portfolios
- [ ] Commands: `create_portfolio`, `update_portfolio`, `delete_portfolio`,
      `get_portfolios`
- [ ] Web API endpoints: `/api/portfolios/*`

**Frontend (React):**

- [ ] Portfolio types/interfaces
- [ ] Portfolio commands (Tauri + Web adapters)
- [ ] Settings → Portfolios page (list, create, edit, delete)
- [ ] Portfolio form dialog component
- [ ] Portfolio card component (Settings)

**Validation:**

- [ ] Portfolios CRUD working in Settings
- [ ] Minimum 2 accounts enforced
- [ ] Unique name constraint
- [ ] Migration preserves allocation strategies

### Step 2: Allocation Page Integration

**Goal**: Support portfolios in allocation selector + multi-select
reconciliation

**Frontend:**

- [ ] Update AccountSelector component:
  - [ ] Add "Portfolios" section
  - [ ] Implement exact-match reconciliation
  - [ ] Progressive selection auto-matching
  - [ ] Visual state indicators (●/○/☑/□)
- [ ] Multi-select → Portfolio detection
- [ ] Save portfolio banner (inline form)
- [ ] Modified selection banner
- [ ] Auto-match confirmation toast
- [ ] Handle portfolio deletion/modification

**Validation:**

- [ ] Exact match works (A+B+C = Portfolio X)
- [ ] Subset doesn't match (A+B ≠ Portfolio X)
- [ ] Progressive selection auto-switches
- [ ] Modifying portfolio breaks link
- [ ] Save banner works correctly

### Step 3: Multi-Feature Support (Future Sprints)

**Goal**: Use portfolios across other pages

**Features:**

- [ ] Insights page: Filter by portfolio
- [ ] Performance page: Compare portfolios
- [ ] Dashboard: Portfolio summary cards
- [ ] Holdings page: Portfolio-level holdings view
- [ ] Reports: Portfolio-based exports

**Infrastructure:**

- [ ] Portfolio filter component (reusable)
- [ ] Portfolio performance calculations
- [ ] Portfolio-aware data aggregation
- [ ] Portfolio context provider

---

## Test Scenarios

### Scenario 1: Single Account Allocation

**Steps:**

1. Navigate to Allocation page
2. Select Account A only
3. Set allocation targets (e.g., Stocks 60%, Bonds 40%)
4. Lock the targets
5. Verify targets are saved

**Expected Results:**

- ✅ Targets saved successfully
- ✅ Lock state persists
- ✅ No "Combined Portfolio" banner shown
- ✅ Normal single-account experience

### Scenario 2: Create First Combined Portfolio

**Steps:**

1. Select Account A + Account B (multi-select)
2. Wait for combined portfolio creation
3. Observe banner message

**Expected Results:**

- ✅ Loading indicator shows "Setting up combined portfolio view..."
- ✅ Combined portfolio created with name "Combined: Account A + Account B"
- ✅ Banner shows: "Managing allocation for: Combined: Account A + Account B"
- ✅ Info message: "Your allocation targets for this account combination will be
  saved separately."
- ✅ No error toasts

### Scenario 3: Set Targets for Combined Portfolio

**Steps:**

1. With Account A + B selected (from Scenario 2)
2. Navigate to "Targets" tab
3. Add allocation targets (e.g., Stocks 70%, Bonds 30%)
4. Lock the targets
5. Verify targets are different from Account A alone

**Expected Results:**

- ✅ Can edit targets (not read-only)
- ✅ Targets saved to combined portfolio
- ✅ Lock state persists
- ✅ Targets are independent from single-account strategies

### Scenario 4: Data Isolation Verification

**Steps:**

1. Select Account A only
2. Verify targets show 60% Stocks, 40% Bonds (from Scenario 1)
3. Select Account B only
4. Verify targets are empty or different from A
5. Select Account A + B together
6. Verify targets show 70% Stocks, 30% Bonds (from Scenario 3)

**Expected Results:**

- ✅ Account A targets: 60% Stocks, 40% Bonds
- ✅ Account B targets: Independent from A
- ✅ Combined A+B targets: 70% Stocks, 30% Bonds
- ✅ No "phantom targets" appearing across accounts

### Scenario 5: Multiple Combined Portfolios

**Steps:**

1. Select Account A + C (different combination)
2. Wait for new combined portfolio creation
3. Set different targets (e.g., Stocks 80%, Bonds 20%)
4. Switch back to A + B
5. Verify original A+B targets preserved

**Expected Results:**

- ✅ New combined portfolio: "Combined: Account A + Account C"
- ✅ A+C targets: 80% Stocks, 20% Bonds
- ✅ A+B targets still: 70% Stocks, 30% Bonds
- ✅ Each combination has independent strategy

### Scenario 6: Order Independence

**Steps:**

1. Select Account A + B
2. Note the combined portfolio ID/name
3. Deselect all, then select Account B + A (reverse order)
4. Verify same combined portfolio is used

**Expected Results:**

- ✅ Same combined portfolio loaded
- ✅ Same tPortfolio Records

```sql
-- View all portfolios
SELECT id, name, account_ids, created_at, updated_at
FROM portfolios
ORDER BY created_at DESC;

-- Expected: Saved portfolios with account_ids JSON arrays
-- Example: id: xxx, name: "Family Portfolio", account_ids: '["acc1-id","acc2-id"]'
```

### Check Strategy References

```sql
-- View strategies by portfolio/account
SELECT
    ast.id,
    ast.account_id,
    COALESCE(p.name, a.name) as entity_name,
    CASE
        WHEN p.id IS NOT NULL THEN 'portfolio'
        ELSE 'account'
    END as entity_type
FROM allocation_strategies ast
LEFT JOIN portfolios p ON ast.account_id = p.id
LEFT JOIN accounts a ON ast.account_id = a.id
ORDER BY entity_type, entity_name;

-- Expected: Strategies linked to either portfolios or accounts
```

### Check Targets Isolation

````sql
-- View targets per strategy with entity type
SELECT
    ast.account_id,
    COALESCE(p.name, a.name) as entity_name,
    CASE WHEN p.id IS NOT NULL THEN 'portfolio' ELSE 'account' END as type,
    act.asset_class,
    act.target_percentage,
    act.is_locked
FROM asset_class_targets act
JOIN allocation_strategies ast ON act.strategy_id = ast.id
LEFT JOIN portfolios p ON ast.account_id = p.id
LEFTPortfolio CRUD Performance
- ✅ Create portfolio: < 200ms
- ✅ Load portfolios list: < 100ms
- ✅ Update portfolio: < 200ms
- ✅ Delete portfolio: < 200ms
- ✅ UI remains responsive during operations

### Selection Reconciliation Performance
- ✅ Exact match detection: < 50ms (instant)
- ✅ Multi-select with 10 accounts: < 100ms
- ✅ Auto-matching on progressive selection: < 50ms
- ✅ No UI lag when checking/unchecking accounts

### Portfolio selector: "Portfolios" section clearly labeled
- ✅ Active portfolio indicator: ● (filled circle)
- ✅ Inactive portfolio indicator: ○ (empty circle)
- ✅ Account checkboxes: ☑/□ reflect selection
- ✅ Banners: Info (💡), Warning (⚠️), Success (✓) icons clear
- ✅ Color scheme: Matches design system (blue info, yellow warning)
- ✅ Text readable in light and dark modes

### User Feedback
- ✅ Clear indication when viewing portfolio vs multi-select
- ✅ Auto-match confirmation: Toast visible but not intrusive
- ✅ Modified selection: Warning banner actionable
- ✅ Save banner: Dismissible, non-blocking
- ✅ Validation errors: Immediate and clear

### Accessibility
- ✅ Keyboard navigation: Tab through selector items
- ✅ Screen reader: Portfolio names announced correctly
- ✅ Focus indicators: Visible on all interactive elements
- ✅ Color contrast: WCAG AA compliant
- ✅ Recommendation: Keep under 15 accounts optimaled portfolios (should be migrated)
SELECT id, name, is_combined_portfolio, component_account_ids, migrated_to_portfolio_id
FROM accounts
WHERE is_combined_portfolio = 1;

-- Expected after migration: migrated_to_portfolio_id populated
-- Or rows deleted if migration cleanup completed
**Expected Results:**
- ✅ Unused targets hidden by default
- ✅ Eye icon shows/hides unused targets
- ✅ Delete works without confirmation
- ✅ Deleted targets don't appear as "phantom" in other accounts

### Scenario 10: Error Handling
**Steps:**
1. Disconnect network (if using web mode)
2. Try selecting multiple accounts
3. Observe error handling

**Expected Results:**
- ✅ Error toast shows: "Failed to create combined portfolio view"
- ✅ App doesn't crash
- ✅ Graceful degradation

## Database Verification

### Check Combined Portfolio Records
```sql
-- View all combined portfolios
SELECT id, name, is_combined_portfolio, component_account_ids
FROM accounts
WHERE is_combined_portfolio = 1;

-- Expected: Multiple rows showing combinations like:
-- id: xxx-xxx-xxx, name: "Combined: Account A + Account B", component_account_ids: '["acc1-id","acc2-id"]'
````

### Check Strategy Isolation

```sql
-- View strategies by account
SELECT account_id, COUNT(*) as strategy_count
FROM allocation_strategies
GROUP BY account_id;

-- Expected: Separate strategy counts for:
-- - Individual accounts (A, B, C)
-- - Combined portfolios (A+B, A+C, etc.)
```

& Future Enhancements

### Current Limitations

1. **Single-User Focus**: No concurrent editing conflict resolution (last write
   wins)
2. **No Undo**: Deleted portfolios cannot be recovered (future: soft delete)
3. **Manual Cleanup**: Orphaned portfolios (deleted accounts) require manual
   handling
4. **No Import/Export**: Cannot export/import portfolio configurations (future
   feature)

### Future Enhancements (Step 4+)

- [ ] Soft delete portfolios (trash/restore functionality)
- [ ] Portfolio templates (e.g., "Aggressive Growth", "Conservative")
- [ ] Copy allocation targets from one portfolio to another
- [ ] Portfolio analytics dashboard (performance over time)
- [ ] Recently used portfolios quick-access
- [ ] Portfolio sharing/export (JSON format)
- [ ] Batch portfolio operations (archive, duplicate)
- [ ] Portfolio tags/categories for organization
- [ ] Automatic cleanup: Suggest removing unused portfolios
- [ ] Portfolio change history/audit log

-- Expected: Targets grouped by account/combined portfolio -- - No
cross-contamination between accounts

```

## Performance Checks

### Combined Portfolio Creation Speed
- ✅ Creation completes in < 500ms
- ✅ UI remains responsive during creation
- ✅ Loading indicator visible during creation

### Query Cache Efficiency
- ✅ Switching between accounts loads instantly (from cache)
- ✅ Creating targets invalidates cache correctly
- ✅ No stale data shown

## UI/UX Validatallocation features still work after portfolio migration:
- ✅ Single account allocation
- ✅ "All Portfolios" aggregate view
- ✅ Lock state persistence
- ✅ Asset class target CRUD operations
- ✅ Pie chart visualization
- ✅ Rebalancing advisor calculations
- ✅ "Show unused targets" toggle
- ✅ "Show zero-share holdings" toggle (Issue #6)
- ✅ Delete targets without confirmation
- ✅ Multi-account selection (backward compatible)

## Test Status - Step 1 (Infrastructure)

- [ ] Scenario 1: Create Portfolio in Settings
- [ ] Scenario 10: Duplicate Name Validation
- [ ] Scenario 11: Minimum Accounts Validation
- [ ] Database migration successful
- [ ] All existing strategies preserved
- [ ] No data loss during migration

## Test Status - Step 2 (Allocation Integration)

- [ ] Scenario 2: Load Portfolio in Allocation
- [ ] Scenario 3: Multi-Select Auto-Matching
- [ ] Scenario 4: Subset Selection
- [ ] Scenario 5: Superset Selection
- [ ] Scenario 6: Save Multi-Select as Portfolio
- [ ] Scenario 7: Exact Match Detection
- [ ] Scenario 8: Account Deletion Handling
- [ ] Scenario 9: Account Renaming Updates Portfolio
- [ ] Scenario 12: Order Independence
- [ ] Scenario 13: Banner Dismissal Persistence
- [ ] Scenario 14: All Portfolios View
- [ ] Scenario 15: Persistence Across Restarts

---

## Decision Summary

### Terminology
- **"Portfolio"** = Grouping of 2+ accounts (user-created)
- **"Account"** = Individual trading account (Degiro, IB, etc.)
- **"All Portfolios"** = Virtual aggregate view (all accounts combined)

### Selection Behavior
1. **Exact match only**: Portfolio loads when accounts match exactly
2. **No mixing**: Cannot combine portfolio + additional accounts
3. **Auto-matching**: Progressive selection detects portfolios automatically
4. **Deselection breaks**: Removing account deactivates portfolio

### Data Architecture
- **Separate table**: `portfolios` table (not stored in `accounts`)
- **No duplication**: Portfolios reference accounts, all data in accounts table
- **Account renaming**: Auto-updates portfolio display names
- **Migration path**: Preserve existing allocation strategies during migration

### UX Approach
- **Hybrid model**: Support both quick multi-select and persistent portfolios
- **Proactive creation**: Settings → Portfolios page
- **Reactive save**: Inline banner when multi-selecting
- **Clear feedback**: Visual indicators, banners, toasts for all state changes

---

**Note**: Mark each scenario with ✅ when verified working correctly during testing
- [ ] Add combined portfolio indicator/badge in account selector
- [ ] Copy targets from one account/combination to another

## Regression Checks

Ensure existing features still work:
- ✅ Single account allocation (Scenario 1)
- ✅ Lock state persistence
- ✅ Asset class target CRUD operations
- ✅ Pie chart visualization
- ✅ Rebalancing advisor calculations
- ✅ "Show unused targets" toggle
- ✅ Delete targets without confirmation

## Test Status

- [ ] Scenario 1: Single Account Allocation
- [ ] Scenario 2: Create First Combined Portfolio
- [ ] Scenario 3: Set Targets for Combined Portfolio
- [ ] Scenario 4: Data Isolation Verification
- [ ] Scenario 5: Multiple Combined Portfolios
- [ ] Scenario 6: Order Independence
- [ ] Scenario 7: Persistence After Restart
- [ ] Scenario 8: All Portfolio View
- [ ] Scenario 9: Unused Targets Cleanup
- [ ] Scenario 10: Error Handling

---

**Note**: Mark each scenario with ✅ when verified working correctly.
```
