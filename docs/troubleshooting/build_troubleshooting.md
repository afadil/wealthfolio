# Build Troubleshooting Guide

## Issue Encountered: January 21, 2026

### Symptoms

```bash
cargo check --manifest-path=src-core/Cargo.toml
```

**Error Output:**

```
error[E0432]: unresolved import `crate::db::write_actor::WriteActor`
error[E0277]: the trait bound `(...): CompatibleType<..., ...>` is not satisfied
  --> src/activities/activities_repository.rs:223:47
```

**Total:** 5 compilation errors

- 1 error in our new `rebalancing_repository.rs`
- 4 errors in existing `activities_repository.rs`

---

## Root Cause Analysis

### Problem 1: Missing Backend Implementation ❌

**Our Issue:**

- Created database migration ✅
- Updated schema.rs ✅
- But didn't create backend code ❌

**Result:** Diesel couldn't find the Rust models to match the database schema.

**Why it failed:**

- Import error: `WriteActor` should be `WriteHandle`
- Pattern mismatch: Didn't follow existing repository pattern

### Problem 2: Pre-existing ActivityDB Bug ❌

**Existing Issue (not ours):**

- `ActivityDB` struct had 14 fields
- Database schema has 19 fields
- Missing 5 fields caused Diesel type mismatch

**Missing Fields:**

```rust
pub name: Option<String>,
pub category_id: Option<String>,
pub sub_category_id: Option<String>,
pub event_id: Option<String>,
pub recurrence: Option<String>,
```

---

## Resolution Steps

### Step 1: Diagnose Which Branch Has Issues

```bash
# Test main branch
git checkout main
cargo check --manifest-path=src-core/Cargo.toml
# ✅ Result: Finished successfully

# Test our branch
git checkout allocations-v2
cargo check --manifest-path=src-core/Cargo.toml
# ❌ Result: 5 errors
```

**Conclusion:** Main builds, allocations-v2 doesn't → Our branch has issues

### Step 2: Identify What's Missing

Checked existing modules for patterns:

- `src-core/src/accounts/` ← Has model, repo, service
- `src-core/src/activities/` ← Has model, repo, service
- `src-core/src/rebalancing/` ← **Missing everything!**

**Diagnosis:** We created tables but not the Rust code to use them.

### Step 3: Create Backend Files

Created complete backend following existing patterns:

#### File 1: `rebalancing_model.rs`

```rust
// Domain models (for API)
pub struct RebalancingStrategy { ... }
pub struct AssetClassTarget { ... }
pub struct HoldingTarget { ... }

// Input models (for API)
pub struct NewRebalancingStrategy { ... }
pub struct NewAssetClassTarget { ... }
pub struct NewHoldingTarget { ... }

// Database models (for Diesel)
#[derive(Queryable, Identifiable, Insertable, ...)]
pub struct RebalancingStrategyDB { ... }
pub struct AssetClassTargetDB { ... }
pub struct HoldingTargetDB { ... }

// Conversions
impl From<RebalancingStrategyDB> for RebalancingStrategy { ... }
impl From<NewRebalancingStrategy> for RebalancingStrategyDB { ... }
// etc.
```

#### File 2: `rebalancing_traits.rs`

```rust
#[async_trait]
pub trait RebalancingRepository: Send + Sync {
    async fn get_strategies(&self) -> Result<Vec<RebalancingStrategy>>;
    async fn create_strategy(&self, ...) -> Result<RebalancingStrategy>;
    // ... all CRUD methods
}

#[async_trait]
pub trait RebalancingService: Send + Sync {
    // Business logic methods
}
```

#### File 3: `rebalancing_repository.rs`

**Key Fix:** Use `WriteHandle` not `WriteActor`

```rust
use crate::db::{get_connection, WriteHandle}; // ✅ Correct import

pub struct RebalancingRepositoryImpl {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle, // ✅ Use WriteHandle
}

impl RebalancingRepositoryImpl {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle, // ✅ Not WriteActor
    ) -> Self {
        Self { pool, writer }
    }
}
```

**Pattern:**

- Read operations: Use `get_connection(&self.pool)?`
- Write operations: Use `self.writer.exec(|conn| { ... }).await`

#### File 4: `rebalancing_service.rs`

```rust
pub struct RebalancingServiceImpl {
    repository: Arc<dyn RebalancingRepository>,
}

#[async_trait]
impl RebalancingService for RebalancingServiceImpl {
    async fn save_strategy(...) -> Result<RebalancingStrategy> {
        if strategy.id.is_some() {
            self.repository.update_strategy(strategy).await
        } else {
            self.repository.create_strategy(strategy).await
        }
    }
    // etc.
}
```

#### File 5: `mod.rs`

```rust
pub mod rebalancing_model;
pub mod rebalancing_repository;
pub mod rebalancing_service;
pub mod rebalancing_traits;

pub use rebalancing_model::*;
pub use rebalancing_repository::*;
pub use rebalancing_service::*;
pub use rebalancing_traits::*;
```

#### Updated: `lib.rs`

```rust
pub mod rebalancing; // ✅ Added this line
```

### Step 4: Fix ActivityDB Bug

**File:** `src-core/src/activities/activities_model.rs`

**Before:**

```rust
pub struct ActivityDB {
    pub id: String,
    // ... 13 more fields
    pub updated_at: String,
}
```

**After:**

```rust
pub struct ActivityDB {
    pub id: String,
    // ... 13 more fields
    pub updated_at: String,
    // ✅ Added missing fields
    pub name: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub event_id: Option<String>,
    pub recurrence: Option<String>,
}
```

**Also Updated:** Two `From` implementations to initialize these fields:

```rust
impl From<NewActivity> for ActivityDB {
    fn from(domain: NewActivity) -> Self {
        Self {
            // ... existing fields
            name: None,
            category_id: None,
            sub_category_id: None,
            event_id: None,
            recurrence: None,
        }
    }
}

impl From<ActivityUpdate> for ActivityDB {
    fn from(domain: ActivityUpdate) -> Self {
        Self {
            // ... existing fields
            name: None,
            category_id: None,
            sub_category_id: None,
            event_id: None,
            recurrence: None,
        }
    }
}
```

### Step 5: Verify Build

```bash
cargo check --manifest-path=src-core/Cargo.toml
```

**Result:**

```
Checking wealthfolio_core v2.1.0
Finished `dev` profile in 23.57s
```

✅ **Success!** No errors.

---

## Key Learnings

### 1. Test Main Branch First

When encountering build errors:

```bash
git checkout main
cargo check --manifest-path=src-core/Cargo.toml
```

If main fails → Pre-existing issue If main works → Your branch has problems

### 2. Database Changes Require Backend Code

Creating a migration is not enough:

- ✅ Migration creates tables
- ✅ Schema.rs updates automatically
- ❌ But Rust models don't exist yet

**Always create:** Model → Traits → Repository → Service

### 3. Follow Existing Patterns

Study similar modules:

- How do they structure files?
- What imports do they use?
- How do they handle async operations?

**In Wealthfolio:**

- Read ops: `get_connection(&pool)?`
- Write ops: `writer.exec(|conn| { ... }).await`
- NOT: `WriteActor` (doesn't exist, use `WriteHandle`)

### 4. Pre-existing Bugs Can Block Progress

The ActivityDB bug blocked our feature:

- Not our fault
- But we had to fix it
- Always fix blocking bugs before proceeding

### 5. Diesel Type Mismatches

**Error Pattern:**

```
trait bound `(...): CompatibleType<..., ...>` is not satisfied
```

**Common Causes:**

1. Struct fields don't match schema columns
2. Field order is wrong
3. Missing fields
4. Type mismatch (e.g., i32 vs bool)

**Solution:**

- Compare struct to schema.rs
- Count fields
- Check types
- Ensure order matches

---

## Prevention Checklist

When adding a new database feature:

### ✅ Database Layer

- [ ] Create migration file
- [ ] Run migration: `diesel migration run`
- [ ] Verify schema.rs updated
- [ ] Check tables exist in database

### ✅ Backend Layer (Don't skip!)

- [ ] Create model.rs (domain + DB models)
- [ ] Create traits.rs (async traits)
- [ ] Create repository.rs (CRUD ops)
- [ ] Create service.rs (business logic)
- [ ] Create mod.rs (exports)
- [ ] Add to lib.rs

### ✅ Build Verification

- [ ] `cargo check --manifest-path=src-core/Cargo.toml`
- [ ] Fix any errors before proceeding
- [ ] Test on main branch if errors persist

### ✅ Pattern Compliance

- [ ] Use `WriteHandle` not `WriteActor`
- [ ] Use `get_connection(&pool)` for reads
- [ ] Use `writer.exec(...)` for writes
- [ ] Match field order in schema
- [ ] Initialize all struct fields

---

## Common Errors & Solutions

### Error: "unresolved import WriteActor"

**Cause:** Wrong import **Fix:** Use `WriteHandle` instead

```rust
use crate::db::{get_connection, WriteHandle};
```

### Error: "trait bound CompatibleType not satisfied"

**Cause:** Struct doesn't match database schema **Fix:**

1. Check schema.rs for table definition
2. Count fields - must match exactly
3. Check field types
4. Ensure field order matches

### Error: "no field X on struct Y"

**Cause:** Missing field in struct **Fix:** Add field to struct and initialize
in `From` implementations

### Error: Build succeeds but runtime panic

**Cause:** Logic error or uninitialized service **Fix:** Check AppContext
initialization and error handling

---

## Success Criteria

Build is successful when:

```bash
cargo check --manifest-path=src-core/Cargo.toml
# Output: Finished `dev` profile [unoptimized + debuginfo] target(s) in XX.XXs
# No errors, only possible warnings
```

Runtime test:

```bash
pnpm tauri dev
# App should launch without panics
```

---

## Resources

**Diesel Documentation:**

- https://diesel.rs/guides/getting-started
- https://diesel.rs/guides/all-about-updates

**Wealthfolio Patterns:**

- Study `src-core/src/accounts/` for reference
- Study `src-core/src/activities/` for reference
- Follow the same structure for new modules

**Git Commands:**

```bash
# Compare branches
git diff main...allocations-v2

# See what changed
git log --oneline allocations-v2 ^main

# Reset if needed
git reset --hard origin/allocations-v2
```
