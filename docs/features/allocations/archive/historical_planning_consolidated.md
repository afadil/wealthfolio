# Historical Planning Documentation (Consolidated)

**Archive Date**: January 2025 **Purpose**: Preserve early planning, design
decisions, and implementation history

This document consolidates multiple historical planning artifacts from the
initial allocation feature development.

---

## Table of Contents

1. [Initial Project Specification](#1-initial-project-specification)
2. [Design Decisions & Conversation Summary](#2-design-decisions--conversation-summary)
3. [Database Schema Evolution](#3-database-schema-evolution)
4. [Implementation Phase Guide](#4-implementation-phase-guide)
5. [Feature Difficulty Assessment](#5-feature-difficulty-assessment)
6. [UI Information Architecture](#6-ui-information-architecture)

---

## 1. Initial Project Specification

**Original Date**: January 19, 2026 **Status**: Superseded by PHASE_3_PLAN.md

### Project Overview

Adding a comprehensive portfolio rebalancing tool to Wealthfolio that enables
users to:

1. Set target asset allocations (Level 1: Asset Classes, Level 2: Individual
   Holdings)
2. Visualize current vs target allocation
3. Calculate rebalancing trades needed
4. Use smart deposit planning for tax-efficient rebalancing
5. Apply professional drift detection (5/25 rule)

### Design Philosophy

Following Wealthfolio's "Calm Finance" ethos:

- **Local-first**: All calculations happen on device
- **Privacy-focused**: No external API calls for rebalancing
- **Beautiful & Boring**: Clean, professional interface using Flexoki colors
- **Tax-aware**: Prioritize new contributions over selling (soft rebalancing)

### Original Implementation Phases

**Phase 1: Foundation (Days 1-2)**

- Database schema for storing allocation targets
- Rust backend commands (save/load targets)
- TypeScript hooks to interact with backend
- Visual allocation bars (current vs target)
- Basic target editing interface
- Rebalancing calculations (buy/sell amounts)
- Dual metrics display (relative % and absolute %)
- Real-time validation
- Deposit Planner (tax-efficient rebalancing)

**Phase 2: Advanced Features (Days 3-4)**

- 5/25 threshold rule implementation
- Drift detection with visual indicators
- Status badges (rebalance needed vs on-target)
- Proportional allocation sliders
- Lock mechanism for holdings
- Combined input/slider components
- Per-account rebalancing support

---

## 2. Design Decisions & Conversation Summary

### User Requirements (Original Quote)

> "I would like a page where we can see properly the allocation of the assets.
> Plus, I would like to offer the possibility to the user to rebalance his
> portfolio (something important for strategy). So to have the possibility to
> adjust the percentage and see the whole balance. We could do this for the 'All
> portfolio' or also per 'Account' separately."

**Additional Requirements:**

- Two-level hierarchy: Asset Class (the ones existing) + Individual Holdings
- Better visualization than current treemap
- Ability to set target allocations
- See what trades are needed to rebalance

### Selected Features from Research

Reviewed two detailed proposals and selected:

- ✅ Flexoki Design Integration (already in app)
- ✅ 5/25 Threshold Rule (professional drift detection)
- ✅ Soft Rebalancing Priority (tax-efficient via new contributions)
- ✅ **Deposit Planner** ⭐ (calculate how to invest $1,000 to rebalance)
- ✅ Dual Metrics (relative % and absolute %)
- ✅ Database Schema (comprehensive architecture)
- ✅ Proportional Allocation Sliders (with lock mechanism)
- ✅ Combined Input/Slider Component
- ✅ Real-time Validation

### Key Design Decisions

**UI Design:**

- **Horizontal stacked bars** instead of pie charts
- Expandable asset class cards
- Flexoki color scheme (already in app)
- Clean, "calm finance" aesthetic

**Technical Architecture:**

- SQLite database for persistence
- Rust backend commands
- React + TypeScript frontend
- Local-first (no external APIs)

**User Experience:**

- Progressive disclosure (expand for details)
- Two-level hierarchy (asset class → holdings)
- Real-time validation
- Tax-aware recommendations

---

## 3. Database Schema Evolution

### ❌ Original Schema (INCORRECT)

```sql
CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    symbol TEXT NOT NULL,  -- ❌ BAD: String reference
    target_percent_of_class REAL NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id)
);
```

**Problems Identified:**

1. Uses `symbol` (string) instead of linking to actual asset
2. No cascade deletion
3. No uniqueness constraint
4. No validation on percentages
5. Will break if asset is renamed/deleted

### ✅ Corrected Schema (FINAL)

```sql
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ✅ Foreign key to assets table
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)
);
```

**Benefits:**

1. ✅ Links to actual asset (referential integrity)
2. ✅ Auto-cleans up if asset deleted (CASCADE)
3. ✅ Prevents duplicate entries (UNIQUE constraint)
4. ✅ Validates percentages (CHECK constraint)
5. ✅ Includes timestamps for audit trail

### Complete Final Migration

```sql
-- 1. Rebalancing strategies (parent)
CREATE TABLE rebalancing_strategies (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,  -- NULL means "All Portfolio"
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 2. Asset class targets (child of strategy)
CREATE TABLE asset_class_targets (
    id TEXT NOT NULL PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_percent REAL NOT NULL CHECK (target_percent >= 0 AND target_percent <= 100),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,  -- Added in Sprint 2
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id) ON DELETE CASCADE,
    UNIQUE(strategy_id, asset_class)
);

-- 3. Holding targets (child of asset class)
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,  -- Added in Sprint 2
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    UNIQUE(asset_class_id, asset_id)
);
```

---

## 4. Implementation Phase Guide

### Phase 0: Pre-Implementation Setup (2-3 hours)

**Goal:** Prepare safe environment before touching code

**Step 1: Backup (15 minutes)**

```bash
# Backup database
cp ~/Library/Application\ Support/com.teymz.wealthfolio/wealthfolio.db \
   ~/Desktop/wealthfolio-backup-$(date +%Y%m%d).db

# Create safety tag
git tag -a "before-rebalancing-impl" -m "State before implementing rebalancing feature"
```

**Step 2: Study Patterns (90 minutes)**

- Study database migration patterns
- Study Rust command patterns
- Study React Query hook patterns
- Study Diesel ORM usage

**Step 3: Environment Setup (30 minutes)**

- Verify Rust/Diesel working
- Test TypeScript compilation
- Verify database access

---

## 5. Feature Difficulty Assessment

### 1. Flexoki Design Integration ⭐ EASY

**Time**: 0 hours - Already done!

### 2. Database Schema ⭐⭐ MODERATE

**Time**: 2-3 hours

- Create new tables in SQLite
- Rust backend commands
- TypeScript hooks

### 3. Dual Metrics (Relative % & Absolute %) ⭐ EASY

**Time**: 1 hour

- Pure JavaScript math
- No complex algorithms

**Example:**

```javascript
const absolutePercent = 30; // % of total portfolio
const assetClassPercent = 60; // Stocks are 60% of portfolio
const relativePercent = (absolutePercent / assetClassPercent) * 100; // 50%

// Display: VTI: 30% of portfolio (50% of Stocks)
```

### 4. Deposit Planner ⭐⭐ MODERATE

**Time**: 3-4 hours

- Straightforward algorithm
- Handle edge cases

### 5. Visual Bars ⭐ EASY

**Time**: 1-2 hours

- Use Tailwind width utilities
- Color-coded sections

### 6. Combined Input/Slider ⭐⭐⭐ COMPLEX

**Time**: 4-5 hours

- Two-way data binding
- Validation in both directions

### 7. Lock Mechanism ⭐⭐ MODERATE

**Time**: 2-3 hours

- Database persistence
- UI disabled state
- Proportional recalculation

### 8. Proportional Allocation ⭐⭐⭐ COMPLEX

**Time**: 5-6 hours

- Lock interaction
- Real-time recalculation
- Validation

---

## 6. UI Information Architecture

**Status**: Locked for MVP | **Version**: 1.0

### Architectural Decisions

**Decision 1: Account Scope → Per-Account Targets**

Each account has its own `asset_class_targets`. Special case: "All Portfolio"
view aggregates holdings across all accounts but uses global targets.

**Schema Impact:**

```sql
CREATE TABLE asset_class_targets (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  asset_class TEXT NOT NULL,
  target_percent REAL NOT NULL,
  UNIQUE(account_id, asset_class)
);
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

**Decision 2: Level 2 Granularity → Use `asset_sub_class`**

- Level 1: Asset classes (Equities, Fixed Income, Cash) — user controls via
  targets
- Level 2: Breakdown by `asset_sub_class` (ETF, Individual Stocks, etc.) —
  informational

Example:

```
Equities (60% target) [Level 1]
├─ ETF (40% of Equities)          [asset_sub_class = "ETF"]
│  ├─ VTI: $100k
│  └─ VXUS: $60k
├─ Individual Stocks (20%)         [asset_sub_class = "Stock"]
│  ├─ AAPL: $30k
│  └─ TSLA: $20k
```

**Decision 3: Page Scope → Strategic Targets + Monitoring Only**

**What This Page Does:**

- ✅ View asset class targets (Level 1)
- ✅ Edit asset class targets (set %, ensure 100% total)
- ✅ View current allocation composition (Level 2 breakdown)
- ✅ See drift indicators (over/under weight)

**What It Doesn't Do:**

- ❌ Execute trades
- ❌ Connect to broker APIs
- ❌ Auto-rebalance

---

## Implementation Milestones Achieved

### Sprint 1: Backend Foundation ✅ COMPLETE

- Database migration created and run
- Rust backend commands (10 commands)
- Service layer with business logic
- All CRUD operations working

### Sprint 2: Enhanced UI ✅ 85% COMPLETE

- React Query hooks
- HoldingTargetRow component
- Lock functionality with database persistence
- Custom toast notifications
- Side panel integration

### Sprint 3: Rebalancing ⏳ NOT STARTED

- Per-holding buy suggestions
- Cash allocation logic
- Integration tests

---

## Key Learnings

1. **Database Schema is Critical**: Schema errors caused significant rework
   (symbol vs asset_id)
2. **Follow Existing Patterns**: Studying other modules saved time
3. **Lock State Needs Persistence**: Originally in React state, moved to
   database
4. **Test Main Branch First**: When debugging, verify main works before blaming
   your code
5. **ActivityDB Bug**: Pre-existing bug (missing 5 fields) blocked progress
   until fixed

---

## Historical Context

This consolidated document replaces:

- `allocations_project_spec.md` (original spec)
- `conversation_summary.md` (design decisions)
- `database-schema-fixes.md` (schema evolution)
- `phase-0-setup-guide.md` (implementation guide)
- `selected-features-difficulty.md` (complexity assessment)
- Portions of `UI_INFORMATION_ARCHITECTURE.md` (architectural decisions)

For current implementation status, see **phase-3.md** in the parent directory.
