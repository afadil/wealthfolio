# Critical Database Schema Fixes - Quick Reference

## ❌ WRONG (Your Original Schema)

```sql
CREATE TABLE holding_targets (
    id TEXT PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    symbol TEXT NOT NULL,  -- ❌ BAD: String reference
    target_percent_of_class REAL NOT NULL,
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id)
);
```

**Problems:**
1. Uses `symbol` (string) instead of linking to actual asset
2. No cascade deletion
3. No uniqueness constraint
4. No validation on percentages
5. Will break if asset is renamed/deleted

---

## ✅ CORRECT (Fixed Schema)

```sql
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ✅ GOOD: Foreign key to assets table
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,  -- ✅ Protects referential integrity
    UNIQUE(asset_class_id, asset_id)  -- ✅ Prevents duplicate holdings per class
);
```

**Benefits:**
1. ✅ Links to actual asset (referential integrity)
2. ✅ Auto-cleans up if asset deleted (CASCADE)
3. ✅ Prevents duplicate entries (UNIQUE constraint)
4. ✅ Validates percentages (CHECK constraint)
5. ✅ Includes timestamps for audit trail

---

## Complete Fixed Migration

### File: `/src-core/migrations/2026-01-19-000001_portfolio_allocation_targets/up.sql`

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

CREATE INDEX idx_rebalancing_strategies_account ON rebalancing_strategies(account_id);

-- 2. Asset class targets (child of strategy)
CREATE TABLE asset_class_targets (
    id TEXT NOT NULL PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_percent REAL NOT NULL CHECK (target_percent >= 0 AND target_percent <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (strategy_id) REFERENCES rebalancing_strategies(id) ON DELETE CASCADE,
    UNIQUE(strategy_id, asset_class)
);

CREATE INDEX idx_asset_class_targets_strategy ON asset_class_targets(strategy_id);

-- 3. Holding targets (child of asset class)
CREATE TABLE holding_targets (
    id TEXT NOT NULL PRIMARY KEY,
    asset_class_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,  -- ⭐ KEY FIX
    target_percent_of_class REAL NOT NULL CHECK (target_percent_of_class >= 0 AND target_percent_of_class <= 100),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (asset_class_id) REFERENCES asset_class_targets(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,  -- ⭐ KEY FIX
    UNIQUE(asset_class_id, asset_id)  -- ⭐ KEY FIX
);

CREATE INDEX idx_holding_targets_asset_class ON holding_targets(asset_class_id);
CREATE INDEX idx_holding_targets_asset ON holding_targets(asset_id);

-- 4. Create default strategy
INSERT INTO rebalancing_strategies (id, name, account_id, is_active)
VALUES ('default_all_portfolio', 'All Portfolio', NULL, 1);
```

### File: `/src-core/migrations/2026-01-19-000001_portfolio_allocation_targets/down.sql`

```sql
DROP TABLE IF EXISTS holding_targets;
DROP TABLE IF EXISTS asset_class_targets;
DROP TABLE IF EXISTS rebalancing_strategies;
```

---

## Why CASCADE is Critical

### Without CASCADE:
```sql
-- User deletes an asset
DELETE FROM assets WHERE id = 'AAPL';

-- Result: holding_targets still references 'AAPL'
-- This breaks queries and causes errors ❌
```

### With CASCADE:
```sql
FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE

-- User deletes an asset
DELETE FROM assets WHERE id = 'AAPL';

-- Result: holding_targets automatically cleaned up ✅
```

---

## Why UNIQUE Constraint is Critical

### Without UNIQUE:
```sql
-- User can accidentally create duplicate targets
INSERT INTO holding_targets (id, asset_class_id, asset_id, target_percent_of_class)
VALUES ('1', 'stocks_class', 'AAPL', 30.0);

INSERT INTO holding_targets (id, asset_class_id, asset_id, target_percent_of_class)
VALUES ('2', 'stocks_class', 'AAPL', 25.0);  -- ❌ DUPLICATE!

-- Now we have conflicting targets for the same asset
```

### With UNIQUE:
```sql
UNIQUE(asset_class_id, asset_id)

-- Attempting duplicate fails gracefully ✅
-- Can handle with proper error messaging in UI
```

---

## Migration Testing Checklist

Before committing:

```bash
# 1. Test migration runs
cd src-core
diesel migration run

# 2. Verify tables exist
sqlite3 ../path/to/wealthfolio.db
.tables  # Should see rebalancing_strategies, asset_class_targets, holding_targets

# 3. Test rollback
diesel migration redo

# 4. Check for errors
# Look for any SQL errors in output

# 5. Test constraints
sqlite3 ../path/to/wealthfolio.db
INSERT INTO holding_targets (id, asset_class_id, asset_id, target_percent_of_class) 
VALUES ('test1', 'stocks', 'fake_asset_id', 30.0);
-- Should fail: foreign key violation ✅

INSERT INTO holding_targets (id, asset_class_id, asset_id, target_percent_of_class) 
VALUES ('test2', 'stocks', 'AAPL', 150.0);
-- Should fail: CHECK constraint ✅
```

---

## Key Takeaways

1. **Always use foreign keys** to link related data
2. **Always add CASCADE rules** for cleanup
3. **Always add UNIQUE constraints** to prevent duplicates
4. **Always add CHECK constraints** for validation
5. **Always test migrations** before committing
6. **Always have a rollback plan** (down.sql)

---

## Next Step

After migration succeeds, verify in code:

```rust
// /src-tauri/src/commands/rebalancing.rs

use crate::schema::{rebalancing_strategies, asset_class_targets, holding_targets};
use diesel::prelude::*;

// This struct MUST match the table exactly
#[derive(Debug, Queryable, Insertable)]
#[diesel(table_name = holding_targets)]
pub struct HoldingTarget {
    pub id: String,
    pub asset_class_id: String,
    pub asset_id: String,  // ⭐ Must match database column
    pub target_percent_of_class: f64,
    pub created_at: String,
    pub updated_at: String,
}
```

If Rust compiler complains about fields, your migration didn't run correctly.
