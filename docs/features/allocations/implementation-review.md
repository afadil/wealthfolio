# Portfolio Allocation Rebalancing - Implementation Review & Roadmap

**Date**: January 19, 2026  
**Branch**: `allocations`  
**Reviewer**: Claude  
**Status**: ⚠️ NEEDS CAREFUL PLANNING - Previous attempts failed due to database issues

---

## 📋 Executive Summary

You want to build a **portfolio rebalancing tool** with two-level target allocation (asset classes + individual holdings), visual comparison, and a smart deposit planner. Your documentation is comprehensive and well-thought-out. However, **previous implementation attempts failed due to database issues**, so we need to be extra careful this time.

### Key Insights from Review

✅ **What's Good:**
- Excellent feature selection (Deposit Planner is brilliant!)
- Well-documented planning (conversation_summary.md is thorough)
- Phased approach is smart
- Design philosophy aligns with Wealthfolio's "Calm Finance" ethos
- You correctly identified the database as the risky part

⚠️ **What Needs Work:**
- Database schema needs refinement (more on this below)
- Implementation spec lacks concrete code examples
- Missing critical error handling patterns
- No rollback strategy for failed migrations
- Need to understand existing codebase patterns better

---

## 🔍 Detailed Review of Your Documents

### 1. **conversation_summary.md** - Grade: A

**Strengths:**
- Comprehensive record of design decisions
- Clear feature prioritization
- Good UI mockup descriptions
- Algorithms are well-explained (5/25 rule, deposit planner)

**Issues Found:**
- ❌ Database schema has potential foreign key issues
- ❌ Missing details on how to handle asset class assignment (what if a holding has no asset class?)
- ❌ No consideration for data migration (what if user already has holdings?)

**Recommended Changes:**
1. Add section on "Migration Strategy" for existing portfolios
2. Define default asset class behavior
3. Add error scenarios and recovery plans

---

### 2. **allocations_project_spec.md** - Grade: B-

**Strengths:**
- Phased approach is correct
- Identifies key deliverables
- Database schema structure is on the right track

**Critical Issues:**
- ❌ Database schema has a fundamental design flaw (see below)
- ❌ No Rust command specifications
- ❌ No TypeScript type definitions
- ❌ Missing integration points with existing portfolio code
- ❌ No test strategy defined

**Database Schema Problem:**

Your proposed schema:
```sql
CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    symbol TEXT NOT NULL,  -- ⚠️ PROBLEM HERE
    target_percent_of_class REAL NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id)
);
```

**Why this is problematic:**
1. Uses `symbol` (string) instead of linking to actual holdings/assets
2. What happens if the user renames/deletes an asset?
3. No foreign key relationship to ensure the asset exists
4. Difficult to join with existing `assets` table for calculations

**Proposed Fix:**
```sql
CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ✅ Link to actual asset
    target_percent_of_class REAL NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)  -- ✅ Prevent duplicates
);
```

---

### 3. **selected-features-difficulty.md** - Grade: A-

**Strengths:**
- Realistic time estimates
- Good complexity assessments
- Honest about the hardest parts (proportional sliders)
- Recommends phased approach (smart!)

**Minor Issues:**
- Doesn't mention database complexity enough
- Could emphasize testing more

---

## 🚨 Why Previous Attempts Failed - Root Cause Analysis

Based on your mention of "database problems," here are likely culprits:

### Common Database Migration Mistakes

1. **Foreign Key Violations**
   - Migration tries to create references before tables exist
   - Solution: Create tables in correct order

2. **Data Type Mismatches**
   - SQLite is flexible but not forgiving with FOREIGN KEYs
   - Using TEXT for IDs requires exact matches

3. **Missing ON DELETE Cascades**
   - Deleting an account/asset breaks the allocation
   - Solution: Add proper CASCADE rules

4. **Migration Not Running**
   - Diesel migrations need to be in correct folder structure
   - Migration might have syntax errors that fail silently

5. **Schema Lock Issues**
   - Database might be locked during migration
   - Solution: Ensure app is not running during migration

---

## 🛠️ Corrected Database Schema

Here's a production-ready schema that fixes all issues:

```sql
-- Migration file: 2026-01-19-000001_portfolio_allocation_targets/up.sql

-- 1. First table: Rebalancing strategies (parent)
CREATE TABLE rebalancing_strategies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,  -- NULL means "All Portfolio"
    is_active INTEGER NOT NULL DEFAULT 1,  -- SQLite uses INTEGER for BOOLEAN
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_rebalancing_strategies_account ON rebalancing_strategies(account_id);

-- 2. Second table: Asset class targets (child of strategy)
CREATE TABLE asset_class_targets (
    id TEXT NOT NULL PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,  -- e.g., 'STOCK', 'BOND', 'CASH', 'CRYPTOCURRENCY'
    target_percent REAL NOT NULL CHECK (target_percent >= 0 AND target_percent <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id) ON DELETE CASCADE,
    UNIQUE(strategy_id, asset_class)  -- Prevent duplicate asset classes per strategy
);

-- Create indexes
CREATE INDEX idx_asset_class_targets_strategy ON asset_class_targets(strategy_id);

-- 3. Third table: Holding-level targets (child of asset class)
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ✅ Link to assets table
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)  -- Prevent duplicate holdings per asset class
);

-- Create indexes
CREATE INDEX idx_holding_targets_asset_class ON holding_targets(asset_class_id);
CREATE INDEX idx_holding_targets_asset ON holding_targets(asset_id);

-- 4. Insert a default "All Portfolio" strategy for initial setup
INSERT INTO rebalancing_strategies (id, name, account_id, is_active)
VALUES ('default_all_portfolio', 'All Portfolio', NULL, 1);
```

**Key Improvements:**
1. ✅ Uses `asset_id` instead of `symbol` (prevents orphaned data)
2. ✅ Proper CASCADE rules (deleting account/asset cleans up allocations)
3. ✅ CHECK constraints (ensures percentages are valid 0-100)
4. ✅ UNIQUE constraints (prevents duplicate entries)
5. ✅ Indexes for performance (faster queries)
6. ✅ Creates default strategy automatically

**Down Migration:**
```sql
-- Migration file: 2026-01-19-000001_portfolio_allocation_targets/down.sql

DROP TABLE IF EXISTS holding_targets;
DROP TABLE IF EXISTS asset_class_targets;
DROP TABLE IF EXISTS rebalancing_strategies;
```

---

## 🏗️ Complete Implementation Roadmap

### Phase 0: Pre-Implementation (CRITICAL - Don't Skip!)

**Goals:**
- Understand existing codebase patterns
- Set up proper development environment
- Create safety nets

**Tasks:**
1. [ ] Backup current database (`~/Library/Application Support/com.teymz.wealthfolio/wealthfolio.db`)
2. [ ] Study existing commands pattern
   - Read `/src-tauri/src/commands/goal.rs` (similar feature)
   - Read `/src-tauri/src/commands/budget.rs` (similar feature)
3. [ ] Study existing page patterns
   - Read `/src/pages/settings/goals/goals-page.tsx`
   - Read `/src/pages/settings/budget/budget-page.tsx`
4. [ ] Create test database with sample data
5. [ ] Document current asset/holding structure

**Deliverables:**
- ✅ Database backup
- ✅ Understanding of Diesel ORM patterns in this codebase
- ✅ Understanding of React Query patterns used
- ✅ Sample data for testing

---

### Phase 1: Database & Backend Foundation (Days 1-2)

**Goal:** Get data persistence working reliably

#### Day 1 Morning: Migration

**Tasks:**
1. [ ] Create migration folder: `/src-core/migrations/2026-01-19-000001_portfolio_allocation_targets/`
2. [ ] Write `up.sql` (using schema above)
3. [ ] Write `down.sql`
4. [ ] Test migration locally:
   ```bash
   cd src-core
   diesel migration run
   diesel migration redo  # Test rollback
   ```

**Success Criteria:**
- Migration runs without errors
- Tables exist in database
- Can rollback successfully

#### Day 1 Afternoon: Rust Backend

**Tasks:**
1. [ ] Create `/src-tauri/src/commands/rebalancing.rs`
2. [ ] Define Rust structs (mirroring database schema)
3. [ ] Implement basic commands:
   - `get_rebalancing_strategy(account_id: Option<String>)` → Returns strategy + targets
   - `save_asset_class_targets(strategy_id: String, targets: Vec<AssetClassTarget>)`
   - `save_holding_targets(asset_class_id: String, targets: Vec<HoldingTarget>)`
   - `calculate_rebalancing_actions(account_id: Option<String>)` → Returns buy/sell recommendations

4. [ ] Register commands in `/src-tauri/src/commands/mod.rs`
5. [ ] Update `/src-tauri/src/lib.rs` to expose commands

**Code Template:**
```rust
// /src-tauri/src/commands/rebalancing.rs

use crate::commands::CommandResult;
use crate::schema::{rebalancing_strategies, asset_class_targets, holding_targets};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = rebalancing_strategies)]
pub struct RebalancingStrategy {
    pub id: String,
    pub name: String,
    pub account_id: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = asset_class_targets)]
pub struct AssetClassTarget {
    pub id: String,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f64,
    pub created_at: String,
    pub updated_at: String,
}

// TODO: Add more structs and commands...
```

**Success Criteria:**
- All commands compile
- Can call commands from Tauri frontend
- Data persists correctly

#### Day 2: TypeScript Integration

**Tasks:**
1. [ ] Create `/src/commands/rebalancing.ts`
2. [ ] Define TypeScript types (matching Rust structs)
3. [ ] Write wrapper functions for Tauri invoke
4. [ ] Test commands in browser console

**Code Template:**
```typescript
// /src/commands/rebalancing.ts

import { invokeTauri } from '@/adapters';

export interface RebalancingStrategy {
  id: string;
  name: string;
  accountId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetClassTarget {
  id: string;
  strategyId: string;
  assetClass: string;
  targetPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface HoldingTarget {
  id: string;
  assetClassId: string;
  assetId: string;
  targetPercentOfClass: number;
  createdAt: string;
  updatedAt: string;
}

export async function getRebalancingStrategy(
  accountId?: string
): Promise<RebalancingStrategy | null> {
  return invokeTauri('get_rebalancing_strategy', { accountId });
}

export async function saveAssetClassTargets(
  strategyId: string,
  targets: AssetClassTarget[]
): Promise<void> {
  return invokeTauri('save_asset_class_targets', { strategyId, targets });
}

// TODO: Add more functions...
```

**Success Criteria:**
- TypeScript types match Rust exactly
- Can fetch data from frontend
- Can save data from frontend

---

### Phase 2: Basic UI (Days 3-4)

**Goal:** Create working interface (no fancy features yet)

#### Day 3: Page Structure

**Tasks:**
1. [ ] Create `/src/pages/allocation/` folder
2. [ ] Create main page: `allocation-rebalancing-page.tsx`
3. [ ] Add route to `/src/routes.tsx`
4. [ ] Create basic layout (header, account selector, placeholder cards)

**UI Structure:**
```
/allocation
├── Account Selector (All Portfolio, Account 1, Account 2...)
├── Summary Card (Total Value, Drift %, Status)
├── Asset Class Section
│   ├── Stocks (60% target, 65% current, +5% drift)
│   ├── Bonds (30% target, 28% current, -2% drift)
│   └── Cash (10% target, 7% current, -3% drift)
└── Deposit Planner (coming in Phase 2)
```

#### Day 4: Visual Bars & Editing

**Tasks:**
1. [ ] Create horizontal bar component (current vs target)
2. [ ] Create modal for editing targets
3. [ ] Wire up save functionality
4. [ ] Test with real data

**Success Criteria:**
- Can see current allocation
- Can edit targets
- Targets persist after refresh

---

### Phase 3: Deposit Planner (Days 5-6)

**Goal:** Add the killer feature!

**Algorithm Implementation:**
```typescript
// /src/lib/rebalancing-calculator.ts

interface Holding {
  assetId: string;
  symbol: string;
  currentValue: number;
  targetPercent: number; // as decimal (0.30 = 30%)
}

interface DepositAllocation {
  assetId: string;
  symbol: string;
  amount: number;
  reason: string;
}

export function calculateDepositAllocation(
  holdings: Holding[],
  depositAmount: number
): DepositAllocation[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const newTotal = totalValue + depositAmount;

  // Calculate shortfalls
  const shortfalls = holdings.map(h => ({
    ...h,
    targetValue: newTotal * h.targetPercent,
    shortfall: (newTotal * h.targetPercent) - h.currentValue
  }))
  .filter(h => h.shortfall > 0)
  .sort((a, b) => b.shortfall - a.shortfall);

  // Allocate deposit proportionally
  let remaining = depositAmount;
  const allocations: DepositAllocation[] = [];

  for (const holding of shortfalls) {
    if (remaining <= 0) break;

    const amount = Math.min(remaining, holding.shortfall);
    allocations.push({
      assetId: holding.assetId,
      symbol: holding.symbol,
      amount,
      reason: `Underweight by ${formatPercent(holding.shortfall / newTotal)}`
    });
    remaining -= amount;
  }

  return allocations;
}
```

---

### Phase 4: Advanced Features (Optional, Days 7-8)

Only if Phase 1-3 work perfectly:
- [ ] 5/25 threshold rule
- [ ] Proportional sliders with locks
- [ ] Per-account support

---

## 🧪 Testing Strategy

### Critical Test Cases

1. **Database Integrity**
   - [ ] Create strategy → asset classes → holdings
   - [ ] Delete account → verify cascade deletes work
   - [ ] Delete asset → verify holding targets removed
   - [ ] Percentages must sum to 100%

2. **Edge Cases**
   - [ ] Empty portfolio
   - [ ] Portfolio with only cash
   - [ ] Holdings without asset class assigned
   - [ ] Target percentages = 0%
   - [ ] Deposit amount = $0

3. **Real Data Tests**
   - [ ] Import your actual portfolio
   - [ ] Set targets for your assets
   - [ ] Verify calculations match manual math
   - [ ] Test deposit planner with $1,000

---

## 🎯 Step-by-Step Implementation Plan

### Week 1: Foundation

**Monday:**
- [ ] Morning: Study existing codebase patterns (2 hours)
- [ ] Afternoon: Create database migration (3 hours)
- [ ] Evening: Test migration thoroughly (1 hour)

**Tuesday:**
- [ ] Morning: Write Rust commands (4 hours)
- [ ] Afternoon: Test Rust commands (2 hours)

**Wednesday:**
- [ ] Morning: Write TypeScript wrappers (3 hours)
- [ ] Afternoon: Create basic page structure (3 hours)

**Thursday:**
- [ ] Morning: Build visual bars component (3 hours)
- [ ] Afternoon: Wire up editing (3 hours)

**Friday:**
- [ ] Full day: Testing and bug fixes (6 hours)

### Week 2: Advanced Features (If Week 1 Succeeds)

**Monday-Tuesday:**
- [ ] Deposit planner implementation

**Wednesday-Thursday:**
- [ ] Polish UI, add animations, improve UX

**Friday:**
- [ ] Final testing, documentation, commit

---

## 📝 Pre-Implementation Checklist

Before writing any code:

- [ ] Read this entire document
- [ ] Backup your database
- [ ] Study `/src-tauri/src/commands/goal.rs` and `/src-tauri/src/commands/budget.rs`
- [ ] Study `/src/pages/settings/goals/goals-page.tsx`
- [ ] Understand Diesel ORM patterns used in this project
- [ ] Create test database with sample holdings
- [ ] Verify you're on the `allocations` branch
- [ ] Commit any pending work

---

## 🚫 What NOT to Do

1. ❌ Don't start coding frontend before backend works
2. ❌ Don't skip testing the migration
3. ❌ Don't use `symbol` instead of `asset_id` in schema
4. ❌ Don't forget CASCADE rules
5. ❌ Don't implement proportional sliders in Phase 1
6. ❌ Don't work on multiple phases simultaneously
7. ❌ Don't commit broken migrations

---

## ✅ Success Metrics

**Phase 1 Complete When:**
- [ ] Migration runs successfully
- [ ] Rust commands compile
- [ ] Can save and retrieve targets from frontend
- [ ] Data persists after app restart

**Phase 2 Complete When:**
- [ ] Can see visual comparison of current vs target
- [ ] Can edit targets via modal
- [ ] UI looks integrated with Wealthfolio design

**Phase 3 Complete When:**
- [ ] Deposit planner provides accurate recommendations
- [ ] Calculations match manual math
- [ ] UI is clear and helpful

**Final Success:**
- [ ] All tests pass
- [ ] Works with your real portfolio
- [ ] Performance is good (< 100ms for calculations)
- [ ] No database errors in logs
- [ ] Code is committed and documented

---

## 🆘 If Things Go Wrong

### Database Migration Fails

1. Check Diesel version: `diesel --version`
2. Check migration syntax
3. Look at existing migrations for patterns
4. Ensure tables referenced by FOREIGN KEY exist first

### Commands Don't Compile

1. Check Rust types match database schema
2. Ensure all fields are pub
3. Check for typos in table names
4. Verify Diesel derives are correct

### Data Doesn't Persist

1. Check if command is actually being called
2. Look for errors in console
3. Verify database file location
4. Check if transaction is being committed

---

## 💬 Next Steps

**Ready to start?** Let's begin with Phase 0:

1. I'll help you study existing codebase patterns
2. We'll create a safe test environment
3. We'll implement the database migration carefully
4. We'll test everything before moving forward

**Questions to answer first:**
1. Do you have a recent database backup?
2. What error did you get in previous attempts?
3. Should we start with a simpler version first?

---

**Estimated Total Time:** 40-60 hours (2-3 weeks)  
**Confidence Level:** High (if we follow this plan)  
**Risk Level:** Medium (database work is always risky)  

**My Recommendation:** Start with Phase 0-1 this week. Get the database and backend solid. Don't rush to UI. The foundation must be perfect.
