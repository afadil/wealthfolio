# Portfolio Allocations- Complete Project Specification

**Date Created**: January 19, 2026
**Branch**: `allocations`
**Status**: Planning Phase InComplete

---

## Project Overview

Adding a comprehensive portfolio rebalancing tool to Wealthfolio that enables users to:
1. Set target asset allocations (Level 1: Asset Classes, Level 2: Individual Holdings)
2. Visualize current vs target allocation
3. Calculate rebalancing trades needed
4. Use smart deposit planning for tax-efficient rebalancing
5. Apply professional drift detection (5/25 rule)

---

## Design Philosophy

Following Wealthfolio's \"Calm Finance\" ethos:
- **Local-first**: All calculations happen on device
- **Privacy-focused**: No external API calls for rebalancing
- **Beautiful & Boring**: Clean, professional interface using Flexoki colors
- **Tax-aware**: Prioritize new contributions over selling (soft rebalancing)

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2) ⭐ START HERE
**Goal**: Get core rebalancing functionality working

**Features**:
- [ ] Database schema for storing allocation targets
- [ ] Rust backend commands (save/load targets)
- [ ] TypeScript hooks to interact with backend
- [ ] Visual allocation bars (current vs target)
- [ ] Basic target editing interface
- [ ] Rebalancing calculations (buy/sell amounts)
- [ ] Dual metrics display (relative % and absolute %)
- [ ] Real-time validation (\"X% remaining to allocate\")
- [ ] **Deposit Planner** (tax-efficient rebalancing)

**Deliverables**:
- New page: `/allocation` route
- Working UI with Flexoki colors
- Functional deposit calculator
- Database persistence

---

### Phase 2: Advanced Features (Days 3-4)
**Goal**: Add professional-grade capabilities

**Features**:
- [ ] 5/25 threshold rule implementation
- [ ] Drift detection with visual indicators
- [ ] Status badges (rebalance needed vs on-target)
- [ ] Proportional allocation sliders
- [ ] Lock mechanism for holdings
- [ ] Combined input/slider components
- [ ] Per-account rebalancing support

---

## Technical Architecture

### Database Schema

```sql
CREATE TABLE rebalancing_strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE asset_class_targets (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_percent REAL NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id)
);

CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    target_percent_of_class REAL NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id)
);
```

---

## Key Algorithms

### 1. Deposit Planner

```typescript
function calculateDepositAllocation(
  currentHoldings: Holding[],
  targets: AllocationTarget[],
  depositAmount: number
): DepositAllocation[]
```

### 2. 5/25 Threshold Rule

```typescript
function shouldRebalance(
  currentPercent: number,
  targetPercent: number
): boolean
```

---

## Development Workflow

**Day 1**: Database + Backend
**Day 2**: Frontend UI
**Day 3**: Testing + Polish

---

**Status**: Need to improve with user.
