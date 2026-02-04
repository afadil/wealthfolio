# Phase 0: Pre-Implementation Setup - Detailed Guide

**Goal:** Prepare a safe environment before touching any code  
**Time Required:** 2-3 hours  
**Risk Level:** Zero (read-only operations)

---

## Step 1: Backup Everything (15 minutes)

### 1.1 Backup Database

```bash
# Find your database
open ~/Library/Application\ Support/com.teymz.wealthfolio/

# Create backup
cp ~/Library/Application\ Support/com.teymz.wealthfolio/wealthfolio.db \
   ~/Desktop/wealthfolio-backup-$(date +%Y%m%d).db

# Verify backup
ls -lh ~/Desktop/wealthfolio-backup*.db
```

**Success Check:** You should see a file like `wealthfolio-backup-20260119.db` on your Desktop

### 1.2 Backup Current Branch

```bash
cd /Users/admin/Desktop/wealthfolio

# Make sure you're on allocations branch
git branch  # Should show * allocations

# Create safety tag
git tag -a "before-rebalancing-impl" -m "State before implementing rebalancing feature"

# Verify
git tag
```

**Success Check:** Tag `before-rebalancing-impl` appears in list

---

## Step 2: Study Existing Codebase Patterns (90 minutes)

### 2.1 Study Database Migration Pattern (20 minutes)

```bash
# Look at a recent migration
cat /Users/admin/Desktop/wealthfolio/src-core/migrations/2025-12-17-000001_create_budget_tables/up.sql
```

**What to notice:**
- [ ] How tables are created
- [ ] Foreign key syntax
- [ ] Index creation pattern
- [ ] Default values

**Questions to answer:**
1. How are UUIDs generated for `id` fields?
2. What's the pattern for `created_at` / `updated_at`?
3. How are foreign keys defined?
4. Are CHECK constraints used?

### 2.2 Study Rust Command Pattern (30 minutes)

```bash
# Read budget commands (similar feature)
code /Users/admin/Desktop/wealthfolio/src-tauri/src/commands/budget.rs

# Read goal commands (also similar)
code /Users/admin/Desktop/wealthfolio/src-tauri/src/commands/goal.rs
```

**What to notice:**
- [ ] Struct definitions with `#[derive(...)]`
- [ ] How Diesel queries are written
- [ ] Error handling pattern
- [ ] Transaction usage

**Key patterns to copy:**
```rust
// Pattern 1: Struct with Diesel derives
#[derive(Debug, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = your_table)]
pub struct YourStruct {
    // fields
}

// Pattern 2: Command function
#[tauri::command]
pub async fn your_command_name(
    conn: tauri::State<'_, AppState>,
    param: Type
) -> CommandResult<ReturnType> {
    // implementation
}

// Pattern 3: Database query
use crate::schema::your_table;

let result = your_table::table
    .filter(your_table::id.eq(id))
    .first::<YourStruct>(&mut conn.get()?)?;
```

### 2.3 Study TypeScript Integration Pattern (20 minutes)

```bash
# Read TypeScript commands
code /Users/admin/Desktop/wealthfolio/src/commands/budget.ts
code /Users/admin/Desktop/wealthfolio/src/commands/goal.ts
```

**What to notice:**
- [ ] TypeScript interfaces match Rust structs
- [ ] How `invokeTauri` is used
- [ ] Error handling
- [ ] Type exports

**Key pattern to copy:**
```typescript
import { invokeTauri } from '@/adapters';

export interface YourType {
  id: string;
  // ... fields match Rust struct
}

export async function yourCommand(param: Type): Promise<ReturnType> {
  return invokeTauri('your_command_name', { param });
}
```

### 2.4 Study React Page Pattern (20 minutes)

```bash
# Read goals page (similar feature)
code /Users/admin/Desktop/wealthfolio/src/pages/settings/goals/goals-page.tsx
```

**What to notice:**
- [ ] How React Query is used (`useQuery`, `useMutation`)
- [ ] Form handling patterns
- [ ] Card/Modal usage
- [ ] Account selector integration

---

## Step 3: Understand Current Asset Structure (30 minutes)

### 3.1 Examine Assets Table

```bash
# Open database in SQLite
sqlite3 ~/Library/Application\ Support/com.teymz.wealthfolio/wealthfolio.db

# Examine assets table
.schema assets

# Look at sample data
SELECT id, symbol, asset_type, asset_sub_type FROM assets LIMIT 10;

# Exit
.quit
```

**What to notice:**
- What's the `id` format? (UUID, integer, etc.)
- What values exist in `asset_type`? (STOCK, BOND, CRYPTO, etc.)
- What values exist in `asset_sub_type`?

### 3.2 Understand Holdings Structure

```sql
-- In sqlite3:
.schema holdings

SELECT h.id, h.symbol, h.quantity, a.asset_type, a.asset_sub_type 
FROM holdings h 
LEFT JOIN assets a ON h.symbol = a.symbol 
LIMIT 10;
```

**Critical Question:**
Do all holdings have a matching asset in the `assets` table?
- If YES → Can use `asset_id` foreign key ✅
- If NO → Need to handle orphaned holdings ⚠️

---

## Step 4: Create Test Environment (30 minutes)

### 4.1 Copy Database for Testing

```bash
# Create a test database
cp ~/Library/Application\ Support/com.teymz.wealthfolio/wealthfolio.db \
   ~/Desktop/wealthfolio-test.db
```

### 4.2 Prepare Sample Data

```sql
-- Open test database
sqlite3 ~/Desktop/wealthfolio-test.db

-- Insert sample assets if needed
INSERT OR IGNORE INTO assets (id, symbol, asset_type, asset_sub_type, name)
VALUES 
  ('test-asset-1', 'VTI', 'STOCK', 'ETF', 'Vanguard Total Stock Market ETF'),
  ('test-asset-2', 'BND', 'BOND', 'ETF', 'Vanguard Total Bond Market ETF'),
  ('test-asset-3', 'CASH', 'CASH', NULL, 'Cash');

-- Verify
SELECT * FROM assets WHERE id LIKE 'test-asset%';

.quit
```

---

## Step 5: Document Findings (15 minutes)

Create a findings document:

```bash
# Create findings file
touch /Users/admin/Desktop/wealthfolio/docs/features/allocations/codebase-analysis.md
```

Fill it with answers to these questions:

```markdown
# Codebase Analysis Results

## Database Structure
- [ ] ID format: UUID / Integer / Other: ___________
- [ ] Asset types found: ___________
- [ ] All holdings have matching assets? YES / NO
- [ ] Foreign key constraints exist? YES / NO

## Patterns Observed

### Rust Command Pattern
- Typical struct derives: ___________
- Error type used: ___________
- Transaction pattern: ___________

### TypeScript Pattern
- Command wrapper pattern: ___________
- Error handling: ___________
- React Query keys pattern: ___________

### UI Pattern
- Form library: ___________
- Modal component: ___________
- Card component: ___________

## Potential Issues Identified
1. ___________
2. ___________
3. ___________

## Questions for Implementation
1. ___________
2. ___________
3. ___________
```

---

## Step 6: Validation Checklist

Before moving to Phase 1:

- [ ] ✅ Database backed up
- [ ] ✅ Git tag created
- [ ] ✅ Understand migration pattern
- [ ] ✅ Understand Rust command pattern
- [ ] ✅ Understand TypeScript integration
- [ ] ✅ Understand React page pattern
- [ ] ✅ Know asset table structure
- [ ] ✅ Test database created
- [ ] ✅ Findings documented

---

## Common Issues & Solutions

### Issue: Can't find database
**Solution:**
```bash
# Search for it
find ~/Library -name "wealthfolio.db" 2>/dev/null
```

### Issue: SQLite not installed
**Solution:**
```bash
# Install via Homebrew
brew install sqlite
```

### Issue: Can't open .rs files
**Solution:**
```bash
# Use VS Code
code /Users/admin/Desktop/wealthfolio/src-tauri/src/commands/budget.rs

# Or use cat to view
cat /Users/admin/Desktop/wealthfolio/src-tauri/src/commands/budget.rs | less
```

---

## Next Steps

Once all checkboxes are ticked:

1. Review the main implementation document
2. Review the database schema fixes
3. Create a detailed implementation plan
4. Get feedback before starting Phase 1

**DO NOT** start Phase 1 until you understand:
- How migrations work in this project
- How Rust commands are structured
- How TypeScript integrates with Tauri
- What the current asset/holding structure looks like

---

## Time Tracking

- [ ] Step 1 completed: _____ minutes
- [ ] Step 2 completed: _____ minutes
- [ ] Step 3 completed: _____ minutes
- [ ] Step 4 completed: _____ minutes
- [ ] Step 5 completed: _____ minutes
- [ ] Total time: _____ minutes

**Expected:** 2-3 hours  
**Your actual:** _____ hours

---

## Ready for Phase 1?

Answer these questions:

1. Can I create a Diesel migration? YES / NO / MAYBE
2. Can I write a basic Rust command? YES / NO / MAYBE
3. Can I integrate Tauri command in TypeScript? YES / NO / MAYBE
4. Do I understand the asset table structure? YES / NO / MAYBE

**If all YES:** Proceed to Phase 1
**If any NO:** Study that area more
**If any MAYBE:** Ask for help before proceeding
