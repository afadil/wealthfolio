# Quick Start Guide - Allocations Feature

**Status:** Backend Complete ✅ | Tauri Commands In Progress ⏳

---

## TL;DR - Where We Are

```
Phase 1: Database      ✅ DONE
Phase 2: Backend       ✅ DONE  
Phase 3: Tauri Layer   ⏳ IN PROGRESS (You're here!)
Phase 4: Frontend TS   📅 TODO
Phase 5: React UI      📅 TODO
```

**Build Status:** ✅ Compiles successfully  
**Ready For:** Tauri command creation

---

## What's Working Right Now

### Database ✅
```sql
-- Three tables exist and work:
rebalancing_strategies (id, name, account_id, is_active, ...)
asset_class_targets (id, strategy_id, asset_class, target_percent, ...)
holding_targets (id, asset_class_id, asset_id, target_percent_of_class, ...)
```

Migration: `src-core/migrations/2026-01-20-000001_fix_allocation_schema/`

### Backend ✅
```rust
// Complete implementation in:
src-core/src/rebalancing/
├── rebalancing_model.rs        // 6 models + conversions
├── rebalancing_repository.rs   // CRUD operations
├── rebalancing_service.rs      // Business logic
└── rebalancing_traits.rs       // Async traits
```

Test build:
```bash
cargo check --manifest-path=src-core/Cargo.toml
# ✅ Should finish in ~23 seconds with no errors
```

---

## Next Step: Tauri Commands

### What You Need to Create

**File:** `src-tauri/src/commands/rebalancing.rs`

**Template:**
```rust
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::rebalancing::*;

// Import your AppContext type here
use crate::context::AppContext;

// Strategy commands
#[tauri::command]
pub async fn get_rebalancing_strategies(
    state: State<'_, Arc<AppContext>>
) -> Result<Vec<RebalancingStrategy>, String> {
    state.rebalancing_service
        .get_strategies()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_rebalancing_strategy(
    strategy: NewRebalancingStrategy,
    state: State<'_, Arc<AppContext>>
) -> Result<RebalancingStrategy, String> {
    state.rebalancing_service
        .save_strategy(strategy)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_rebalancing_strategy(
    id: String,
    state: State<'_, Arc<AppContext>>
) -> Result<(), String> {
    state.rebalancing_service
        .delete_strategy(&id)
        .await
        .map_err(|e| e.to_string())
}

// Asset class commands
#[tauri::command]
pub async fn get_asset_class_targets(
    strategy_id: String,
    state: State<'_, Arc<AppContext>>
) -> Result<Vec<AssetClassTarget>, String> {
    state.rebalancing_service
        .get_asset_class_targets(&strategy_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_asset_class_target(
    target: NewAssetClassTarget,
    state: State<'_, Arc<AppContext>>
) -> Result<AssetClassTarget, String> {
    state.rebalancing_service
        .save_asset_class_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_asset_class_target(
    id: String,
    state: State<'_, Arc<AppContext>>
) -> Result<(), String> {
    state.rebalancing_service
        .delete_asset_class_target(&id)
        .await
        .map_err(|e| e.to_string())
}

// Holding target commands
#[tauri::command]
pub async fn get_holding_targets(
    asset_class_id: String,
    state: State<'_, Arc<AppContext>>
) -> Result<Vec<HoldingTarget>, String> {
    state.rebalancing_service
        .get_holding_targets(&asset_class_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_holding_target(
    target: NewHoldingTarget,
    state: State<'_, Arc<AppContext>>
) -> Result<HoldingTarget, String> {
    state.rebalancing_service
        .save_holding_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_holding_target(
    id: String,
    state: State<'_, Arc<AppContext>>
) -> Result<(), String> {
    state.rebalancing_service
        .delete_holding_target(&id)
        .await
        .map_err(|e| e.to_string())
}
```

### Register Commands

**1. Add to `src-tauri/src/commands/mod.rs`:**
```rust
pub mod rebalancing;
```

**2. Add to `src-tauri/src/lib.rs` in `invoke_handler![]`:**
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    
    // Rebalancing commands
    commands::rebalancing::get_rebalancing_strategies,
    commands::rebalancing::save_rebalancing_strategy,
    commands::rebalancing::delete_rebalancing_strategy,
    commands::rebalancing::get_asset_class_targets,
    commands::rebalancing::save_asset_class_target,
    commands::rebalancing::delete_asset_class_target,
    commands::rebalancing::get_holding_targets,
    commands::rebalancing::save_holding_target,
    commands::rebalancing::delete_holding_target,
])
```

### Initialize Service in Context

**Find your AppContext (probably in `src-tauri/src/context/mod.rs`):**

```rust
pub struct AppContext {
    // ... existing fields ...
    pub rebalancing_service: Arc<dyn RebalancingService>,
}

// In initialization:
use wealthfolio_core::rebalancing::{
    RebalancingRepositoryImpl, 
    RebalancingServiceImpl
};

let rebalancing_repo = Arc::new(RebalancingRepositoryImpl::new(
    Arc::clone(&pool),
    writer.clone()
));

let rebalancing_service = Arc::new(RebalancingServiceImpl::new(
    rebalancing_repo
));
```

---

## Testing Your Work

### 1. Build Check
```bash
cargo check --manifest-path=src-tauri/Cargo.toml
# Should compile with no errors
```

### 2. Run App
```bash
pnpm tauri dev
```

App should launch normally. Your commands won't be visible yet (no UI), but they're ready for frontend.

### 3. Verify Commands Exist
In browser DevTools console:
```javascript
// Test if commands are registered
await window.__TAURI__.invoke('get_rebalancing_strategies')
  .then(strategies => console.log('Success!', strategies))
  .catch(err => console.error('Error:', err));
```

---

## Troubleshooting

### Build Fails
1. Check you added `pub mod rebalancing;` to mod.rs
2. Verify all command names in invoke_handler match function names exactly
3. Check AppContext has rebalancing_service field

### Commands Return Errors
1. Check service is initialized in AppContext
2. Verify database migration ran
3. Look for Rust panics in terminal

### Can't Find Types
```rust
use wealthfolio_core::rebalancing::*;
```

This imports all the types you need.

---

## What's Next After Tauri Commands

### Phase 4: Frontend TypeScript
**File:** `src/commands/rebalancing.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface RebalancingStrategy {
  id: string;
  name: string;
  accountId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getRebalancingStrategies = (): Promise<RebalancingStrategy[]> => {
  return invoke('get_rebalancing_strategies');
};

// ... more wrappers
```

### Phase 5: React UI
**File:** `src/pages/allocation/allocation-page.tsx`

Basic component structure to display strategies.

---

## Documentation

📁 **All docs in:** `docs/features/allocations/`

**Essential reads:**
- `IMPLEMENTATION_STATUS.md` - Overall progress
- `BUILD_TROUBLESHOOTING.md` - How we fixed build issues
- `SESSION_END_STATE.md` - Latest session summary
- `architecture.md` - System design
- `api-specification.md` - API contracts

---

## Git & Commit

### Current Branch
```bash
git branch --show-current
# Should show: allocations-v2
```

### Ready to Commit?

When Tauri commands are done:
```bash
git add .
git commit -m "feat(allocations): Add Tauri commands for rebalancing

- Add 10 rebalancing commands to Tauri layer
- Initialize rebalancing service in AppContext
- Register all commands in invoke_handler
- Backend now fully exposed to frontend

Phase 3 complete. Ready for frontend TypeScript integration."
```

---

## Summary

**You are here:** 🏗️ Creating Tauri commands

**Already done:** ✅ Database + Backend (both working!)

**Time estimate:** 30-60 minutes to create commands

**Next:** Frontend TypeScript wrappers (1-2 hours)

**Help:** See BUILD_TROUBLESHOOTING.md if you hit issues

---

**Need Help?** 
- Check existing commands in `src-tauri/src/commands/account.rs` for patterns
- See how services are initialized in context
- Read BUILD_TROUBLESHOOTING.md for common issues
