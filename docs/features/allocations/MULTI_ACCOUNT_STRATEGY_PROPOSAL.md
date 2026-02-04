# Multi-Account Strategy & Lock State Persistence

## Issue 1: Lock State Not Persisting ✅ FIXABLE

### Problem
The lock state is stored in local component state (`useState`) in `allocation-pie-chart-view.tsx`. When you switch tabs, the component unmounts and the state is lost.

### Current Code (Problematic)
```typescript
const [lockedAssets, setLockedAssets] = useState<Set<string>>(new Set());
```

### Solution Options

#### Option A: Add isLocked to AssetClassTarget (Recommended)
**Difficulty**: Easy ⭐
**Impact**: Minimal changes, proper persistence

1. **Update Database Schema**:
   - Add `is_locked` column to `asset_class_targets` table
   
2. **Update Type**:
```typescript
interface AssetClassTarget {
  // ... existing fields
  isLocked?: boolean;
}
```

3. **Update Component**: Initialize lock state from database
```typescript
const [lockedAssets, setLockedAssets] = useState<Set<string>>(() => {
  const locked = new Set<string>();
  targets.forEach(t => {
    if (t.isLocked) locked.add(t.assetClass);
  });
  return locked;
});
```

4. **Save on Toggle**:
```typescript
onToggleLock={() => {
  const isCurrentlyLocked = lockedAssets.has(target.assetClass);
  const newLocked = new Set(lockedAssets);
  
  if (isCurrentlyLocked) {
    newLocked.delete(target.assetClass);
  } else {
    newLocked.add(target.assetClass);
  }
  setLockedAssets(newLocked);
  
  // Save to database
  onUpdateTarget?.(target.assetClass, target.targetPercent, !isCurrentlyLocked);
}}
```

**Required Changes**:
- ✅ Add database migration for `is_locked` column
- ✅ Update Rust backend to handle isLocked field
- ✅ Update frontend to save/load isLocked state
- ✅ ~50 lines of code across 3 files

---

## Issue 2: Multi-Account Allocation Strategies ⚠️ COMPLEX

### User's Request
- **Account A alone**: Strategy A (e.g., Cash 10%, Gold 60%, Equities 30%)
- **Account B alone**: Strategy B (e.g., Cash 5%, Equities 95%)
- **Account A + B together**: Strategy C (e.g., Cash 5%, Gold 30%, Equities 65%)
- Each should persist independently

### Current Architecture
```
RebalancingStrategy (table)
  - id
  - name
  - account_id (single account only)
  - is_active

AssetClassTarget (table)
  - id
  - strategy_id (FK to RebalancingStrategy)
  - asset_class
  - target_percent
```

**Limitation**: Each strategy is linked to ONE account only.

### Proposed Solution

#### Approach 1: Virtual Account for Combinations (Recommended)
**Difficulty**: Medium ⭐⭐⭐
**Implementation Time**: 2-3 hours

Create a special "virtual account" for each unique combination of accounts:

```
Account (existing table, add type field)
  - id
  - name
  - account_type (SECURITIES, CASH, CRYPTOCURRENCY, PORTFOLIO, VIRTUAL)
  - is_virtual (boolean)
  - component_account_ids (JSON array) <- [accountA_id, accountB_id]
```

**How it works**:
1. User selects Account A + Account B
2. System checks if virtual account exists for this combination
3. If not, creates: `Virtual_Account_A_B` with component_account_ids = ["A", "B"]
4. Strategy is created for this virtual account
5. When loading data for Account A + B, system:
   - Looks up virtual account by component_account_ids
   - Loads strategy for virtual account
   - Aggregates holdings from real accounts A & B

**Benefits**:
- ✅ Minimal database changes
- ✅ Reuses existing strategy system
- ✅ Easy to understand and debug
- ✅ Works with existing UI

**Changes Required**:
```
Backend (Rust):
1. Add `is_virtual` and `component_account_ids` to Account model
2. Add helper function: findOrCreateVirtualAccount(accountIds: string[])
3. Update holdings aggregation to handle virtual accounts
4. ~200 lines of code

Frontend (TypeScript):
1. Update account selection to detect multi-select
2. Call findOrCreateVirtualAccount when multiple selected
3. Use virtual account ID for strategy queries
4. ~100 lines of code
```

#### Approach 2: Strategy Account Mapping Table
**Difficulty**: Hard ⭐⭐⭐⭐
**Implementation Time**: 4-5 hours

Create a many-to-many relationship:

```sql
CREATE TABLE strategy_accounts (
  strategy_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  PRIMARY KEY (strategy_id, account_id)
);
```

**How it works**:
1. Each strategy can be associated with multiple accounts
2. Query: "Get strategy WHERE strategy_accounts contains exactly [A, B]"
3. More flexible but more complex

**Benefits**:
- ✅ More flexible
- ✅ Can handle any combination

**Drawbacks**:
- ❌ More complex queries
- ❌ Harder to maintain
- ❌ More database migrations
- ❌ ~400 lines of code changes

### Comparison

| Feature | Approach 1 (Virtual Accounts) | Approach 2 (Mapping Table) |
|---------|-------------------------------|----------------------------|
| Complexity | Medium | High |
| Code Changes | ~300 lines | ~400 lines |
| Database Impact | 1 migration | 2 migrations |
| Performance | Fast | Slower (complex joins) |
| Maintenance | Easy | Harder |
| Flexibility | Good enough | Maximum |
| **Recommendation** | ✅ **Recommended** | ⚠️ Only if needed |

### Implementation Steps (Approach 1)

#### Phase 1: Backend (Rust)
```rust
// 1. Add migration
// src-core/migrations/YYYY-MM-DD-add-virtual-accounts.sql
ALTER TABLE accounts ADD COLUMN is_virtual BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN component_account_ids TEXT; -- JSON array

// 2. Update Account model
#[derive(Queryable, Insertable, Serialize, Deserialize)]
pub struct Account {
    // ... existing fields
    pub is_virtual: Option<bool>,
    pub component_account_ids: Option<String>, // JSON string
}

// 3. Add helper function
pub fn find_or_create_virtual_account(
    conn: &mut SqliteConnection,
    account_ids: Vec<String>,
) -> Result<Account, String> {
    // Sort IDs for consistent lookup
    let mut sorted_ids = account_ids.clone();
    sorted_ids.sort();
    let ids_json = serde_json::to_string(&sorted_ids)?;
    
    // Try to find existing virtual account
    if let Some(account) = accounts::table
        .filter(accounts::component_account_ids.eq(&ids_json))
        .first::<Account>(conn)
        .optional()? 
    {
        return Ok(account);
    }
    
    // Create new virtual account
    let name = format!("Combined: {}", sorted_ids.join(" + "));
    let new_account = NewAccount {
        name,
        account_type: "VIRTUAL",
        is_virtual: Some(true),
        component_account_ids: Some(ids_json),
        // ... other fields
    };
    
    diesel::insert_into(accounts::table)
        .values(&new_account)
        .execute(conn)?;
        
    Ok(/* return created account */)
}
```

#### Phase 2: Frontend (TypeScript)
```typescript
// 1. Add command
export async function findOrCreateVirtualAccount(
  accountIds: string[]
): Promise<Account> {
  if (RUN_ENV === 'desktop') {
    return invokeTauri('find_or_create_virtual_account', { accountIds });
  } else {
    return invokeWeb('/api/accounts/virtual', 'POST', { accountIds });
  }
}

// 2. Update AllocationPage
const selectedAccountId = useMemo(async () => {
  if (selectedAccounts.length === 1) {
    return selectedAccounts[0].id;
  } else if (selectedAccounts.length > 1) {
    // Get or create virtual account for this combination
    const virtualAccount = await findOrCreateVirtualAccount(
      selectedAccounts.map(a => a.id)
    );
    return virtualAccount.id;
  }
  return PORTFOLIO_ACCOUNT_ID;
}, [selectedAccounts]);
```

### Migration Path

**Week 1**: Implement lock state persistence (Issue 1)
- Day 1-2: Backend migration + Rust changes
- Day 3: Frontend updates
- Day 4: Testing

**Week 2**: Implement virtual accounts (Issue 2)
- Day 1-2: Backend virtual account system
- Day 3-4: Frontend integration
- Day 5: Testing with various account combinations

### Testing Scenarios

1. **Lock Persistence**:
   - ✅ Lock asset class A
   - ✅ Switch to Composition tab
   - ✅ Return to Allocation Overview
   - ✅ Verify A is still locked

2. **Multi-Account Strategy**:
   - ✅ Set targets for Account A alone
   - ✅ Set targets for Account B alone
   - ✅ Select A + B, set different targets
   - ✅ Switch back to A alone
   - ✅ Verify A's targets are preserved
   - ✅ Switch back to A + B
   - ✅ Verify combined targets are preserved

### Effort Estimate

**Issue 1 (Lock State)**:
- Backend: 2 hours
- Frontend: 1 hour
- Testing: 1 hour
- **Total: 4 hours**

**Issue 2 (Multi-Account Strategy)**:
- Database design: 1 hour
- Backend implementation: 4 hours
- Frontend integration: 3 hours
- Testing: 2 hours
- **Total: 10 hours**

**Combined: ~14 hours of development**

### Recommendation

1. **Start with Issue 1**: Quick win, improves UX immediately
2. **Implement Issue 2 with Approach 1**: Virtual accounts are the sweet spot between complexity and flexibility
3. **Iterate**: Get feedback after Issue 1, then refine Issue 2 implementation

The multi-account strategy feature is **definitely implementable** and would be a great addition for users managing multiple accounts with different strategies!
