# Lock State Persistence Implementation

## Summary

Implemented database persistence for asset class lock state in the allocation
page. Previously, lock toggle state was stored in local React component state
and would reset when switching tabs or closing the app. Now, lock state is
stored in the `asset_class_targets` database table and persists across sessions.

## Changes Made

### 1. Database Migration

**File**:
`src-core/migrations/2026-01-28-120000-0000_add_is_locked_to_asset_class_targets/`

Created migration to add `is_locked` column to `asset_class_targets` table:

```sql
-- up.sql
ALTER TABLE asset_class_targets
ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- down.sql
ALTER TABLE asset_class_targets
DROP COLUMN is_locked;
```

### 2. Database Schema

**File**: `src-core/src/schema.rs`

Updated Diesel schema to include the new field:

```rust
diesel::table! {
    asset_class_targets (id) {
        id -> Text,
        strategy_id -> Text,
        asset_class -> Text,
        target_percent -> Float,
        is_locked -> Bool,  // ← NEW
        created_at -> Text,
        updated_at -> Text,
    }
}
```

### 3. Rust Backend Models

**File**: `src-core/src/rebalancing/rebalancing_model.rs`

#### Updated Domain Model

```rust
pub struct AssetClassTarget {
    pub id: String,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
    pub is_locked: bool,  // ← NEW
    pub created_at: String,
    pub updated_at: String,
}
```

#### Updated Input Model

```rust
pub struct NewAssetClassTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
    #[serde(default)]  // ← Defaults to false if not provided
    pub is_locked: bool,  // ← NEW
}
```

#### Updated Database Model

```rust
pub struct AssetClassTargetDB {
    pub id: String,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
    pub is_locked: bool,  // ← NEW
    pub created_at: String,
    pub updated_at: String,
}
```

#### Updated Conversion Functions

```rust
impl From<AssetClassTargetDB> for AssetClassTarget {
    fn from(db: AssetClassTargetDB) -> Self {
        Self {
            id: db.id,
            strategy_id: db.strategy_id,
            asset_class: db.asset_class,
            target_percent: db.target_percent,
            is_locked: db.is_locked,  // ← NEW
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewAssetClassTarget> for AssetClassTargetDB {
    fn from(domain: NewAssetClassTarget) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            strategy_id: domain.strategy_id,
            asset_class: domain.asset_class,
            target_percent: domain.target_percent,
            is_locked: domain.is_locked,  // ← NEW
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
```

### 4. Frontend TypeScript Types

**File**: `src/lib/types.ts`

Updated interface to include lock state:

```typescript
export interface AssetClassTarget {
  id: string;
  strategyId: string;
  assetClass: string;
  targetPercent: number;
  isLocked: boolean; // ← NEW
  createdAt: string;
  updatedAt: string;
}
```

### 5. Frontend Component Updates

**File**: `src/pages/allocation/components/allocation-pie-chart-view.tsx`

#### Updated Props Interface

```typescript
interface AllocationPieChartViewProps {
  currentAllocation: CurrentAllocation;
  targets: AssetClassTarget[];
  onSliceClick: (assetClass: string) => void;
  onUpdateTarget?: (
    assetClass: string,
    newPercent: number,
    isLocked?: boolean,
  ) => Promise<void>; // ← Added isLocked param
  onAddTarget?: () => void;
  onDeleteTarget?: (assetClass: string) => Promise<void>;
  accountId?: string;
}
```

#### Initialize Lock State from Database

**Before**:

```typescript
const [lockedAssets, setLockedAssets] = useState<Set<string>>(new Set());
// ❌ Always starts empty, loses state on tab switch
```

**After**:

```typescript
// ✅ Load lock state from database on mount
const [lockedAssets, setLockedAssets] = useState<Set<string>>(() => {
  const locked = new Set<string>();
  targets.forEach((target) => {
    if (target.isLocked) {
      locked.add(target.assetClass);
    }
  });
  return locked;
});
```

#### Save Lock State to Database

**Before**:

```typescript
onToggleLock={() => {
  const newLocked = new Set(lockedAssets);
  if (newLocked.has(target.assetClass)) {
    newLocked.delete(target.assetClass);
  } else {
    newLocked.add(target.assetClass);
  }
  setLockedAssets(newLocked);  // ❌ Only updates local state
}}
```

**After**:

```typescript
onToggleLock={async () => {
  const isCurrentlyLocked = lockedAssets.has(target.assetClass);
  const newLocked = new Set(lockedAssets);

  if (isCurrentlyLocked) {
    newLocked.delete(target.assetClass);
  } else {
    newLocked.add(target.assetClass);
  }

  setLockedAssets(newLocked);  // ✅ Update local state immediately for UI responsiveness

  // ✅ Save to database
  if (onUpdateTarget) {
    try {
      await onUpdateTarget(target.assetClass, target.targetPercent, !isCurrentlyLocked);
    } catch (error) {
      console.error("Failed to update lock state:", error);
      setLockedAssets(lockedAssets);  // Revert on error
    }
  }
}}
```

**File**: `src/pages/allocation/index.tsx`

Updated parent component to pass `isLocked` to mutation:

```typescript
onUpdateTarget={async (assetClass: string, newPercent: number, isLocked?: boolean) => {
  const target = targets.find((t) => t.assetClass === assetClass);
  if (target && strategy?.id) {
    await saveTargetMutation.mutateAsync({
      id: target.id,
      strategyId: strategy.id,
      assetClass,
      targetPercent: newPercent,
      isLocked: isLocked !== undefined ? isLocked : target.isLocked,  // ← Pass isLocked to backend
    });
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
    });
  }
}}
```

## How It Works

### Data Flow

1. **Load**: When `AllocationPieChartView` mounts, it initializes `lockedAssets`
   Set from `targets[].isLocked` (loaded from database)
2. **Toggle**: When user clicks lock icon:
   - Update local React state immediately (for responsive UI)
   - Call `onUpdateTarget(assetClass, percent, newLockState)`
   - Parent passes `isLocked` to `saveTargetMutation`
   - Mutation sends full target object (including `isLocked`) to backend
   - Backend saves to database via existing repository logic
3. **Persist**: Lock state is now in database, will load correctly on next mount

### Migration Embedded in Application

The migration is **NOT** run manually via Diesel CLI. Instead:

- Tauri app embeds migrations and runs them automatically on startup
- Web server embeds migrations and runs them automatically on startup
- This is the standard pattern in this codebase

See:

- `src-tauri/src/main.rs` - Tauri app migration runner
- `src-server/src/main.rs` - Web server migration runner

## Testing

After the app starts and runs the migration, test:

1. ✅ **Lock persists across tabs**
   - Go to Allocation Overview, lock an asset class
   - Switch to Composition tab
   - Return to Allocation Overview → Lock state should still be active

2. ✅ **Lock persists across app sessions**
   - Lock an asset class
   - Close the application
   - Reopen the application
   - Navigate to Allocation Overview → Lock state should still be active

3. ✅ **Lock prevents deletion**
   - Lock an asset class
   - Try to delete it → Should show locked dialog

4. ✅ **Lock prevents slider editing**
   - Lock an asset class
   - Slider should be disabled

5. ✅ **Unlock works correctly**
   - Unlock a locked asset class
   - Should be able to edit and delete again
   - Lock state should persist as unlocked

## Database Migration Notes

- Migration timestamp: `2026-01-28-120000-0000`
- Migration naming follows existing pattern:
  `YYYY-MM-DD-HHMMSS-NNNN_description/`
- Default value `FALSE` ensures existing targets are unlocked by default
- NOT NULL constraint ensures data integrity

## Backward Compatibility

- ✅ Existing asset class targets will have `is_locked = FALSE` after migration
- ✅ Frontend gracefully handles missing `isLocked` field via
  `#[serde(default)]`
- ✅ TypeScript types are compatible (boolean type)
- ✅ Existing save operations automatically include the new field
- ✅ Repository uses `.set(&db_target)` which includes all fields

## Files Modified

### Backend (Rust)

- `src-core/migrations/2026-01-28-120000-0000_add_is_locked_to_asset_class_targets/up.sql`
  (created)
- `src-core/migrations/2026-01-28-120000-0000_add_is_locked_to_asset_class_targets/down.sql`
  (created)
- `src-core/src/schema.rs` (modified)
- `src-core/src/rebalancing/rebalancing_model.rs` (modified)

### Frontend (TypeScript)

- `src/lib/types.ts` (modified)
- `src/pages/allocation/components/allocation-pie-chart-view.tsx` (modified)
- `src/pages/allocation/index.tsx` (modified)

### No Changes Needed

- ✅ `src-core/src/rebalancing/rebalancing_repository.rs` - Uses
  `.set(&db_target)` which automatically includes new field
- ✅ `src/commands/rebalancing.ts` - Passes through full object, no changes
  needed
- ✅ `src/pages/allocation/hooks/use-asset-class-mutations.ts` - Type already
  extends AssetClassTarget
- ✅ Tauri commands - Generic serialization handles new field
- ✅ Web API endpoints - Generic serialization handles new field

## Next Steps (Future Work)

See `MULTI_ACCOUNT_STRATEGY_PROPOSAL.md` for planned virtual account feature
that will enable different allocation strategies for different account
combinations.
