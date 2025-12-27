-- Restore foreign key constraints to activities table
-- Following SQLite recommended procedure for altering tables with foreign keys

-- Step 1: Disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- Step 2: Start a transaction
BEGIN TRANSACTION;

-- Step 4: Create new activities table with proper foreign key constraints
CREATE TABLE activities_new (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity TEXT NOT NULL,
    unit_price TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee TEXT NOT NULL,
    amount TEXT,
    is_draft BOOLEAN NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT "activity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 5: Transfer content from old table to new table
-- Only copy rows where foreign key constraints are satisfied
INSERT INTO activities_new (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
)
SELECT 
    a.id, a.account_id, a.asset_id, a.activity_type, a.activity_date,
    a.quantity, a.unit_price, a.currency, a.fee, a.amount,
    a.is_draft, a.comment, a.created_at, a.updated_at
FROM activities a
WHERE EXISTS (SELECT 1 FROM accounts WHERE id = a.account_id)
  AND EXISTS (SELECT 1 FROM assets WHERE id = a.asset_id);

-- Step 6: Drop the old table
DROP TABLE activities;

-- Step 7: Rename new table to original name
ALTER TABLE activities_new RENAME TO activities;

-- Step 8: Recreate indexes
CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- Step 11: Commit the transaction
COMMIT;

-- Step 12: Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

