-- diesel setup
-- diesel migration generate
-- diesel migration run


CREATE TABLE "platforms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "url" TEXT NOT NULL
);

CREATE TABLE "accounts" (
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

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT,
    "name" TEXT,
    "asset_type" TEXT,
    "symbol" TEXT NOT NULL,
    "symbol_mapping" TEXT,
    "asset_class" TEXT,
    "asset_sub_class" TEXT,
    "comment" TEXT,
    "countries" TEXT,
    "categories" TEXT,
    "classes" TEXT,
    "attributes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,
    "sectors" TEXT,
    "url" TEXT
);

CREATE TABLE "activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_date" DATETIME NOT NULL,
    "quantity" NUMERIC NOT NULL,
    "unit_price" NUMERIC NOT NULL,
    "currency" TEXT NOT NULL,
    "fee" NUMERIC NOT NULL,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);


-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_source" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "symbol" TEXT NOT NULL,
    "open" NUMERIC NOT NULL,
    "high" NUMERIC NOT NULL,
    "low" NUMERIC NOT NULL,
    "volume" NUMERIC NOT NULL,
    "close" NUMERIC NOT NULL,
    "adjclose" NUMERIC NOT NULL,
    CONSTRAINT "quotes_asset_id_fkey" FOREIGN KEY ("symbol") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE settings (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    theme TEXT  NOT NULL DEFAULT 'light',
    font TEXT NOT NULL,
    base_currency TEXT NOT NULL
);


-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_amount" REAL NOT NULL,
    "is_achieved" BOOLEAN
);

-- CreateTable
CREATE TABLE "goals_allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "percent_allocation" INTEGER NOT NULL,
    "goal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    CONSTRAINT "account_goal_allocation_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "account_goal_allocation_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_data_source_symbol_key" ON "assets"("data_source", "symbol");

-- CreateIndex
CREATE INDEX "market_data_symbol_idx" ON "quotes"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "market_data_data_source_date_symbol_key" ON "quotes"("data_source", "date", "symbol");

