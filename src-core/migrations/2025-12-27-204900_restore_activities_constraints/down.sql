-- Revert to activities table without foreign key constraints
-- Following SQLite recommended procedure for altering tables with foreign keys

-- Step 1: Disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- Step 2: Start a transaction
BEGIN TRANSACTION;

-- Step 4: Create table without foreign key constraints
CREATE TABLE activities_old (
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
    updated_at TEXT NOT NULL
);

-- Step 5: Transfer content from table with constraints
INSERT INTO activities_old (
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
)
SELECT 
    id, account_id, asset_id, activity_type, activity_date,
    quantity, unit_price, currency, fee, amount,
    is_draft, comment, created_at, updated_at
FROM activities;

-- Step 6: Drop table with constraints
DROP TABLE activities;

-- Step 7: Rename back to original name
ALTER TABLE activities_old RENAME TO activities;

-- Step 8: Recreate indexes
CREATE INDEX idx_activities_account_id ON activities(account_id);
CREATE INDEX idx_activities_asset_id ON activities(asset_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_activity_date ON activities(activity_date);

-- Step 11: Commit the transaction
COMMIT;

-- Step 12: Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
