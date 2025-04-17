-- Create a temporary table with the original structure (without the new columns).
CREATE TABLE "accounts_temp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'SECURITIES',
    "group" TEXT,
    "currency" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform_id" TEXT,
    CONSTRAINT "account_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data from the current accounts table into the temporary one.
INSERT INTO "accounts_temp" ("id", "name", "account_type", "group", "currency", "is_default", "is_active", "created_at", "updated_at", "platform_id")
SELECT "id", "name", "account_type", "group", "currency", "is_default", "is_active", "created_at", "updated_at", "platform_id"
FROM "accounts";

-- Drop the original accounts table.
DROP TABLE "accounts";

-- Rename the temporary table to the original table name.
ALTER TABLE "accounts_temp" RENAME TO "accounts";
