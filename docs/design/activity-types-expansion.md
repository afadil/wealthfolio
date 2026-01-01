# Activity System Redesign: Events, Compiler & Provider Integration

## Executive Summary

This document outlines a redesigned activity system for Wealthfolio that:

1. **Stores events** - One row per real-world event (what the broker/user thinks happened)
2. **Compiles to postings** - Runtime expansion into canonical primitives the calculator understands
3. **Supports robust provider integration** - Idempotent syncing with SnapTrade, Plaid, and future providers
4. **Remains future-proof** - New event types require only subtype + compiler rules, not schema changes

This architecture enables DRIP, crypto staking, options trading, and future event types without calculator changes or schema migrations.

---

## Part 1: Core Design Principles

### 1.1 Store Events, Calculate from Postings

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STORAGE LAYER                                │
│  One row per real-world event (what broker/user reports)            │
│  activity_type = canonical | subtype = semantic variation           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         COMPILER                                     │
│  compile(Activity) → Vec<Activity>                                  │
│  Expands events into 1..N canonical postings                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CALCULATOR                                   │
│  Only understands canonical primitives (BUY, SELL, DIVIDEND, etc.)  │
│  Never changes for new subtypes                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- Calculator remains simple and stable
- One source of truth per real-world event
- New event types = new subtype + compiler rule (no migrations)
- UI shows one row, details drawer shows compiled legs

### 1.2 Freeze the Calculator's Semantic Surface

The calculator only understands a **small, stable set of canonical types**:

| Category | Canonical Types | Purpose |
|----------|-----------------|---------|
| **Trading** | `BUY`, `SELL`, `SPLIT` | Position changes |
| **Holdings** | `ADD_HOLDING`, `REMOVE_HOLDING` | Non-trade position changes |
| **Income** | `DIVIDEND`, `INTEREST` | Passive income |
| **Cash Flow** | `DEPOSIT`, `WITHDRAWAL` | External money movement |
| **Transfers** | `TRANSFER_IN`, `TRANSFER_OUT` | Internal/cross-account |
| **Fees** | `FEE`, `TAX` | Deductions |
| **Credits** | `CREDIT` | Cash-in not from sale/dividend/deposit (refunds, bonuses) |
| **Fallback** | `UNKNOWN` | Unmapped provider type (needs user review) |

**Total: 15 canonical types** - This list should rarely change.

#### CREDIT Subtypes

`CREDIT` is cash-in that isn't a sale, dividend, interest, deposit, or transfer. Classified as **internal flow** (doesn't affect net contribution/TWR).

| Subtype | Description | Example |
|---------|-------------|---------|
| `FEE_REFUND` | Refund of previously charged fee | Commission rebate |
| `TAX_REFUND` | Refund of withheld tax | Foreign tax reclaim |
| `BONUS` | Promotional/referral credit | Welcome bonus, referral reward |
| `ADJUSTMENT` | Miscellaneous broker credit | Account adjustment, correction |

Everything else becomes a **subtype** that the compiler expands into these primitives.

### 1.3 Idempotent Ingestion via Fingerprinting

Provider IDs are unreliable:
- SnapTrade's `id` can change when they reprocess history
- Plaid transaction IDs may shift
- CSV re-imports need deduplication

**Solution**: Compute your own stable fingerprint for upsert/dedupe:

```
provider_fingerprint = hash(
    account_id,
    normalized_type,
    trade_date,
    symbol/asset_id,
    quantity,
    unit_price,
    amount,
    currency,
    provider_reference_id,  // Include if available (huge win)
    description
)
```

### 1.4 Performance Correctness = Cashflow Classification

| Flow Type | Examples | Affects Net Contribution | Breaks TWR Subperiods |
|-----------|----------|--------------------------|----------------------|
| **External** | DEPOSIT, WITHDRAWAL | Yes | Yes |
| **Internal** | DIVIDEND, INTEREST, BUY, SELL, transfers | No | No |

Only external flows (money crossing the portfolio boundary) affect TWR calculation.

### 1.5 Income Events Are Not Cash Events

**Critical semantic distinction:**

| Activity Type | `amount` Means | Cash Movement | Position Effect |
|---------------|----------------|---------------|-----------------|
| `DEPOSIT` | Cash added | +amount to cash | None |
| `WITHDRAWAL` | Cash removed | -amount from cash | None |
| `BUY` | Purchase cost | -amount from cash | +quantity |
| `SELL` | Sale proceeds | +amount to cash | -quantity |
| `DIVIDEND` | **Income recognition** | **None** (income tracking only) | None |
| `INTEREST` | **Income recognition** | **None** (income tracking only) | None |
| `FEE` | Fee paid | -amount from cash | None |
| `TAX` | Tax paid | -amount from cash | None |

**DIVIDEND and INTEREST are income recognition events, not cash movement events.**

For a regular cash dividend, the broker sends two events:
1. **DIVIDEND**: Income earned (amount = dividend value)
2. **DEPOSIT** (or implicit cash credit): Cash received

For DRIP, the compiler expands to:
1. **DIVIDEND**: Income earned
2. **BUY**: Shares acquired (cash-neutral, funded by dividend)

This keeps the calculator clean: only DEPOSIT/WITHDRAWAL/BUY/SELL/FEE/TAX/TRANSFER move cash.

### 1.6 Yahoo Finance: Use Close, Not Adj Close

Since Wealthfolio tracks dividends explicitly via DIVIDEND activities:
- Use **Close** price for valuation
- **Adj Close** would double-count dividends

For splits: Apply cumulative split factor to quantities at valuation time.

---

## Part 2: New Data Model

### 2.1 Schema Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         activities                                   │
├─────────────────────────────────────────────────────────────────────┤
│ IDENTITY                                                            │
│   id                    - Internal UUID (PK)                        │
│   account_id            - Owning account                            │
│   asset_id              - Asset for trades/holdings (nullable)      │
│                                                                     │
│ CLASSIFICATION                                                      │
│   activity_type         - Canonical type (closed set of 13)         │
│   activity_type_override - User override (never touched by sync)    │
│   source_type           - Raw provider label (REI, DIV, etc.)       │
│   subtype               - Semantic variation (DRIP, STAKING...)     │
│   status                - POSTED | PENDING | DRAFT | VOID           │
│                                                                     │
│ TIMING                                                              │
│   activity_date         - Occurred-at timestamp (UTC)               │
│   settlement_date       - Settled-at timestamp (nullable)           │
│                                                                     │
│ QUANTITIES                                                          │
│   quantity              - Units of asset (nullable)                 │
│   unit_price            - Price per unit (nullable)                 │
│   amount                - Cash delta (nullable)                     │
│   fee                   - Explicit fees (nullable)                  │
│   currency              - ISO 4217 code                             │
│   fx_rate               - FX rate to account/base (nullable)        │
│                                                                     │
│ METADATA                                                            │
│   notes                 - Human memo                                │
│   metadata              - JSON blob for subtype/provider fields     │
│                                                                     │
│ SOURCE IDENTITY                                                     │
│   source_system         - Origin: SNAPTRADE | PLAID | MANUAL | CSV  │
│   source_record_id      - Provider's record ID (traceability)       │
│   source_group_id       - Provider grouping key (pairing legs)      │
│   idempotency_key       - Stable hash for upsert/dedupe             │
│   import_run_id         - Batch/run identifier for sync             │
│                                                                     │
│ SYNC FLAGS                                                          │
│   is_user_modified      - User has edited (sync protects economics) │
│   needs_review          - Needs user review (low confidence, etc.)  │
│                                                                     │
│ AUDIT                                                               │
│   created_at            - Insert timestamp (UTC)                    │
│   updated_at            - Last update timestamp (UTC)               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | No | Internal UUID (PK). Never use provider IDs. |
| `account_id` | TEXT | No | Owning account. |
| `asset_id` | TEXT | Yes | Asset for trades/holdings. NULL for pure cash events (or use `$CASH:USD` if you don't want NULLs). |
| `activity_type` | TEXT | No | Canonical type from closed set of 13. Enforce with CHECK constraint. |
| `activity_type_override` | TEXT | Yes | User override for type mapping. **Effective type = COALESCE(override, activity_type)**. Never overwritten by sync. |
| `source_type` | TEXT | Yes | Raw provider label (REI, CRYPTO_STAKING_REWARD, etc.). Don't overload subtype with provider noise. |
| `subtype` | TEXT | Yes | Semantic variation you own (DRIP, STAKING_REWARD, DIVIDEND_IN_KIND, COUPON, OPTION_OPEN, etc.). Open set but you define the supported ones. |
| `activity_date` | TEXT | No | Occurred-at timestamp. ISO8601/RFC3339 (UTC). If date-only input, normalize to `T00:00:00Z`. |
| `settlement_date` | TEXT | Yes | Settled-at timestamp. Useful for reconciliation/cash availability. |
| `quantity` | TEXT | Yes | Units of asset. NULL for cash-only events. Fractional allowed. |
| `unit_price` | TEXT | Yes | Price per unit in `currency`. NULL if not applicable. |
| `currency` | TEXT | No | ISO 4217 code for amount, unit_price, fee. |
| `amount` | TEXT | Yes | Cash delta in `currency`. Can differ from qty×price (rounding/provider netting). |
| `fee` | TEXT | Yes | Explicit fees in `currency`. Avoid double-counting if amount is already net. |
| `fx_rate` | TEXT | Yes | FX rate to account/base currency (optional). Compute lazily if missing. |
| `status` | TEXT | No | `POSTED`, `PENDING`, `DRAFT`, `VOID`. Default `POSTED`. DRAFT = user-created not yet confirmed. |
| `notes` | TEXT | Yes | Human memo. Don't encode logic here. |
| `metadata` | TEXT | Yes | JSON blob for subtype/provider-specific fields (split ratio, option details, raw payload pointers, etc.). |
| `source_system` | TEXT | Yes | Origin namespace: `SNAPTRADE`, `PLAID`, `MANUAL`, `CSV`. NULL for legacy/manual if needed. |
| `source_record_id` | TEXT | Yes | Provider's record ID (traceability; may be unstable). |
| `source_group_id` | TEXT | Yes | Provider grouping key (e.g., SnapTrade `external_reference_id`). |
| `idempotency_key` | TEXT | Yes | Stable hash for upsert/dedupe. Enforce unique on `(source_system, idempotency_key)` when present. |
| `import_run_id` | TEXT | Yes | Batch/run identifier for the sync that last created/updated this row (enables ledger filtering by import). |
| `is_user_modified` | INTEGER | No | 0/1 flag. Set when user edits economic fields. Sync protects economics but still updates bookkeeping. Default 0. |
| `needs_review` | INTEGER | No | 0/1 flag. Set when: mapping confidence low, missing required fields, ambiguous type. Default 0. |
| `created_at` | TEXT | No | Insert timestamp (UTC). |
| `updated_at` | TEXT | No | Last update timestamp (UTC). |

### 2.3 Effective Type Resolution

The calculator and compiler use the **effective type**, not the raw `activity_type`:

```rust
impl Activity {
    /// Returns the effective activity type, respecting user overrides
    pub fn effective_type(&self) -> &str {
        self.activity_type_override
            .as_deref()
            .unwrap_or(&self.activity_type)
    }
}
```

**SQL equivalent:**
```sql
SELECT
    COALESCE(activity_type_override, activity_type) AS effective_type,
    *
FROM activities
WHERE status = 'POSTED';
```

This pattern allows:
- **Sync** writes to `activity_type` freely
- **User** writes to `activity_type_override` (never touched by sync)
- **Calculator** reads `effective_type()` for all logic

### 2.4 Sync Rules (is_user_modified Policy)

Simple sync protection: when user edits economic fields, sync protects those but still updates bookkeeping.

#### Sync Algorithm

```
For each incoming activity:
1. Compute idempotency_key
2. Find existing by (source_system, idempotency_key):
   - No existing → INSERT (with import_run_id)
   - Existing AND is_user_modified = 0 → UPDATE all provider-owned fields
   - Existing AND is_user_modified = 1 → UPDATE bookkeeping only, protect economics
```

#### Field Categories

**Always updated by sync** (even when `is_user_modified = 1`):
- `source_type` (raw provider label)
- `source_record_id`
- `source_group_id`
- `import_run_id`
- `metadata.source.*` (deep-merge into source namespace)
- `updated_at`

**Never touched by sync**:
- `activity_type_override`
- `notes`
- `is_user_modified` (only app sets this)
- `metadata.*` (user fields outside `source` namespace)

**Protected when `is_user_modified = 1`** (economic fields):
- `activity_type`, `subtype`
- `asset_id`
- `activity_date`, `settlement_date`
- `quantity`, `unit_price`, `amount`, `fee`, `currency`, `fx_rate`
- `status`

#### When to Set is_user_modified = 1

Set when user explicitly edits any economic field:
- `activity_type_override` (implies user disagrees with provider)
- `asset_id`, `quantity`, `unit_price`, `amount`, `fee`, `currency`
- `activity_date`, `settlement_date`
- `status`

#### When to Set needs_review = 1

Set when:
- Mapping confidence is low (unknown `source_type`)
- Missing required fields
- Provider gives ambiguous type
- Amount/quantity don't reconcile

### 2.5 Database Migration

Recreate the activities table with new schema. SQLite doesn't support many ALTER operations, so we use the rename-and-copy pattern.

```sql
-- Migration: Recreate activities table with new architecture

-- Step 1: Rename old table
ALTER TABLE activities RENAME TO activities_old;

-- Step 2: Create new table with full schema
CREATE TABLE activities (
    -- Identity
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    asset_id TEXT,

    -- Classification
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'BUY', 'SELL', 'SPLIT',
        'ADD_HOLDING', 'REMOVE_HOLDING',
        'DIVIDEND', 'INTEREST',
        'DEPOSIT', 'WITHDRAWAL',
        'TRANSFER_IN', 'TRANSFER_OUT',
        'FEE', 'TAX',
        'CREDIT',
        'UNKNOWN'
    )),
    activity_type_override TEXT,
    source_type TEXT,
    subtype TEXT,
    status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'PENDING', 'DRAFT', 'VOID')),

    -- Timing
    activity_date TEXT NOT NULL,
    settlement_date TEXT,

    -- Quantities (stored as TEXT for precise decimals)
    quantity TEXT,
    unit_price TEXT,
    amount TEXT,
    fee TEXT,
    currency TEXT NOT NULL,
    fx_rate TEXT,

    -- Metadata
    notes TEXT,
    metadata TEXT,  -- JSON blob

    -- Source identity
    source_system TEXT,
    source_record_id TEXT,
    source_group_id TEXT,
    idempotency_key TEXT,
    import_run_id TEXT,

    -- Sync flags
    is_user_modified INTEGER NOT NULL DEFAULT 0,
    needs_review INTEGER NOT NULL DEFAULT 0,

    -- Audit
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    -- Foreign keys
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

-- Step 3: Copy data from old table
INSERT INTO activities (
    id, account_id, asset_id,
    activity_type, activity_type_override, source_type, subtype,
    status,
    activity_date, settlement_date,
    quantity, unit_price, amount, fee, currency, fx_rate,
    notes, metadata,
    source_system, source_record_id, source_group_id, idempotency_key, import_run_id,
    is_user_modified, needs_review,
    created_at, updated_at
)
SELECT
    id, account_id, asset_id,
    -- activity_type: keep existing, will need app-layer fixup for non-canonical values
    activity_type, NULL, NULL, NULL,
    -- status: map is_draft to DRAFT/POSTED
    CASE WHEN is_draft = 1 THEN 'DRAFT' ELSE 'POSTED' END,
    activity_date, NULL,
    quantity, unit_price, amount, fee, currency, NULL,
    comment, NULL,  -- comment → notes, no metadata yet
    -- source identity: map from old columns
    provider_type, external_provider_id, NULL, NULL, NULL,
    -- sync flags: all existing are not user-modified
    0, 0,
    created_at, updated_at
FROM activities_old;

-- Step 4: Create indexes
CREATE UNIQUE INDEX ux_activities_idempotency
ON activities(source_system, idempotency_key)
WHERE source_system IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE INDEX ix_activities_account
ON activities(account_id);

CREATE INDEX ix_activities_asset
ON activities(asset_id)
WHERE asset_id IS NOT NULL;

CREATE INDEX ix_activities_date
ON activities(account_id, activity_date);

CREATE INDEX ix_activities_source_group
ON activities(source_system, source_group_id)
WHERE source_group_id IS NOT NULL;

CREATE INDEX ix_activities_effective_type
ON activities(COALESCE(activity_type_override, activity_type), status);

CREATE INDEX ix_activities_subtype
ON activities(activity_type, subtype)
WHERE subtype IS NOT NULL;

CREATE INDEX ix_activities_import_run
ON activities(import_run_id)
WHERE import_run_id IS NOT NULL;

CREATE INDEX ix_activities_needs_review
ON activities(needs_review, account_id)
WHERE needs_review = 1;

-- Step 5: Drop old table (after verifying migration succeeded)
DROP TABLE activities_old;
```

### 2.6 Import Runs Table

The `import_runs` table tracks sync/import batches for auditing, review, and ledger filtering.

```sql
-- Create import_runs table
CREATE TABLE IF NOT EXISTS import_runs (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    source_system TEXT NOT NULL,           -- SNAPTRADE, PLAID, CSV, MANUAL
    run_type TEXT NOT NULL,                -- SYNC (API pull) or IMPORT (CSV/manual)
    mode TEXT NOT NULL,                    -- INITIAL, INCREMENTAL, BACKFILL, REPAIR
    status TEXT NOT NULL,                  -- RUNNING, APPLIED, NEEDS_REVIEW, FAILED, CANCELLED
    started_at TEXT NOT NULL,              -- RFC3339 UTC
    finished_at TEXT,                      -- RFC3339 UTC when done
    review_mode TEXT NOT NULL,             -- NEVER, ALWAYS, IF_WARNINGS
    applied_at TEXT,                       -- When changes committed to ledger
    checkpoint_in TEXT,                    -- JSON: what you used to fetch
    checkpoint_out TEXT,                   -- JSON: what to persist after success
    summary TEXT,                          -- JSON: counts (fetched, inserted, updated, etc.)
    warnings TEXT,                         -- JSON array of warning messages
    error TEXT,                            -- Error string/JSON if failed
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Indexes for import_runs
CREATE INDEX IF NOT EXISTS ix_import_runs_account_started
ON import_runs(account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_import_runs_source_status
ON import_runs(source_system, status);

CREATE INDEX IF NOT EXISTS ix_import_runs_last_per_account_source
ON import_runs(account_id, source_system, started_at DESC);
```

#### Import Runs Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | No | Internal UUID (PK) for this run/batch. |
| `account_id` | TEXT | No | Owning account being synced/imported. |
| `source_system` | TEXT | No | `SNAPTRADE`, `PLAID`, `CSV`, `MANUAL`. |
| `run_type` | TEXT | No | `SYNC` (API pull) or `IMPORT` (CSV/manual). |
| `mode` | TEXT | No | `INITIAL`, `INCREMENTAL`, `BACKFILL`, `REPAIR`. |
| `status` | TEXT | No | `RUNNING`, `APPLIED`, `NEEDS_REVIEW`, `FAILED`, `CANCELLED`. |
| `started_at` | TEXT | No | RFC3339 UTC timestamp when run started. |
| `finished_at` | TEXT | Yes | RFC3339 UTC timestamp when run completed. |
| `review_mode` | TEXT | No | Policy: `NEVER`, `ALWAYS`, `IF_WARNINGS`. |
| `applied_at` | TEXT | Yes | When changes were committed to ledger (null if not applied). |
| `checkpoint_in` | TEXT | Yes | JSON. What you used to fetch (date range, cursor, etc.). |
| `checkpoint_out` | TEXT | Yes | JSON. What to persist after success (next cursor, last synced date). |
| `summary` | TEXT | Yes | JSON counts: fetched, inserted, updated, skipped, warnings, errors. |
| `warnings` | TEXT | Yes | JSON array of warning codes/messages. |
| `error` | TEXT | Yes | Error string/JSON if failed. |
| `created_at` | TEXT | No | Insert timestamp. |
| `updated_at` | TEXT | No | Last update timestamp. |

#### Checkpoint Examples

**SnapTrade (date windows):**
```json
// checkpoint_in
{
  "startDate": "2025-12-01",
  "endDate": "2025-12-31",
  "offset": 0,
  "limit": 1000,
  "lookbackDays": 45
}

// checkpoint_out
{
  "lastSyncedDate": "2025-12-31",
  "lookbackDays": 45
}
```

**Plaid (cursor-based sync):**
```json
// checkpoint_in
{
  "cursor": "abc123"
}

// checkpoint_out
{
  "nextCursor": "def456"
}
```

#### Summary JSON Schema

```json
{
  "fetched": 150,
  "inserted": 45,
  "updated": 10,
  "skipped": 95,
  "warnings": 3,
  "errors": 0,
  "removed": 0
}
```

#### Rust Model

```rust
// crates/core/src/sync/import_run_model.rs

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunType {
    Sync,    // API pull (SnapTrade, Plaid)
    Import,  // CSV/manual upload
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunMode {
    Initial,      // First sync ever
    Incremental,  // Normal incremental sync
    Backfill,     // Historical data fetch
    Repair,       // Fix/reconcile data
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImportRunStatus {
    Running,      // In progress
    Applied,      // Successfully committed
    NeedsReview,  // Waiting for user review
    Failed,       // Error occurred
    Cancelled,    // User cancelled
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewMode {
    Never,       // Auto-apply everything
    Always,      // Always require review
    IfWarnings,  // Review only if warnings
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRun {
    pub id: String,
    pub account_id: String,
    pub source_system: String,
    pub run_type: ImportRunType,
    pub mode: ImportRunMode,
    pub status: ImportRunStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub review_mode: ReviewMode,
    pub applied_at: Option<DateTime<Utc>>,
    pub checkpoint_in: Option<Value>,
    pub checkpoint_out: Option<Value>,
    pub summary: Option<ImportRunSummary>,
    pub warnings: Option<Vec<String>>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRunSummary {
    pub fetched: u32,
    pub inserted: u32,
    pub updated: u32,
    pub skipped: u32,
    pub warnings: u32,
    pub errors: u32,
    pub removed: u32,
}
```

### 2.7 Sync State Table

The `brokers_sync_state` table tracks sync checkpoints per account+provider combination.

**Key Design Decisions:**
- **Composite PK** `(account_id, provider)` - supports multiple providers per account
- **Generic `checkpoint_json`** - works for SnapTrade date windows, Plaid cursors, etc.
- **Links to `import_runs`** via `last_run_id` for debugging/UI
- **`sync_status`** for UX (show sync state in UI)

```sql
-- Create sync state table with composite PK
CREATE TABLE IF NOT EXISTS brokers_sync_state (
    account_id TEXT NOT NULL,
    provider TEXT NOT NULL,              -- 'SNAPTRADE', 'PLAID', etc.

    -- Generic sync checkpoint (JSON)
    -- SnapTrade: {"lastSyncedDate":"2025-12-31","lookbackDays":45}
    -- Plaid sync: {"cursor":"..."}
    -- Plaid investments: {"lastSyncedDate":"2025-12-31","lookbackDays":90}
    checkpoint_json TEXT,

    last_attempted_at TEXT,
    last_successful_at TEXT,
    last_error TEXT,

    -- Link to import_runs for debugging/UI
    last_run_id TEXT,

    -- UX: show sync state in UI
    sync_status TEXT NOT NULL DEFAULT 'IDLE',  -- IDLE, RUNNING, NEEDS_REVIEW, FAILED

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (account_id, provider),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (last_run_id) REFERENCES import_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_brokers_sync_state_provider
ON brokers_sync_state(provider);

CREATE INDEX IF NOT EXISTS ix_brokers_sync_state_status
ON brokers_sync_state(sync_status)
WHERE sync_status != 'IDLE';
```

#### Sync State Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `account_id` | TEXT | No | Account being synced (PK part 1). |
| `provider` | TEXT | No | Provider/aggregator: `SNAPTRADE`, `PLAID` (PK part 2). |
| `checkpoint_json` | TEXT | Yes | Generic checkpoint - date windows, cursors, etc. |
| `last_attempted_at` | TEXT | Yes | Last sync attempt timestamp. |
| `last_successful_at` | TEXT | Yes | Last successful sync timestamp. |
| `last_error` | TEXT | Yes | Error from last failed attempt. |
| `last_run_id` | TEXT | Yes | FK to import_runs for debugging/UI. |
| `sync_status` | TEXT | No | `IDLE`, `RUNNING`, `NEEDS_REVIEW`, `FAILED`. |
| `created_at` | TEXT | No | Insert timestamp. |
| `updated_at` | TEXT | No | Last update timestamp. |

#### Checkpoint Examples

```json
// SnapTrade activities
{
  "lastSyncedDate": "2025-12-31",
  "lookbackDays": 45
}

// Plaid /transactions/sync (cursor-based)
{
  "cursor": "abc123def456"
}

// Plaid investments (windowed)
{
  "lastSyncedDate": "2025-12-31",
  "lookbackDays": 90
}
```

#### Why Composite PK Matters

With `PRIMARY KEY(account_id)` only:
- Can't store both SnapTrade AND Plaid sync state for the same account
- Can't have separate checkpoints per endpoint (activities vs balances)

With `PRIMARY KEY(account_id, provider)`:
- Multiple providers per account ✓
- Extensible to `(account_id, provider, scope)` later if needed (e.g., `activities|transactions|holdings`)

#### Rust Model

```rust
// crates/core/src/sync/sync_state_model.rs

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncStatus {
    Idle,
    Running,
    NeedsReview,
    Failed,
}

impl Default for SyncStatus {
    fn default() -> Self {
        SyncStatus::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerSyncState {
    pub account_id: String,
    pub provider: String,
    pub checkpoint_json: Option<Value>,
    pub last_attempted_at: Option<DateTime<Utc>>,
    pub last_successful_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub last_run_id: Option<String>,
    pub sync_status: SyncStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl BrokerSyncState {
    /// Get typed checkpoint
    pub fn get_checkpoint<T: serde::de::DeserializeOwned>(&self) -> Option<T> {
        self.checkpoint_json.as_ref()
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Set checkpoint
    pub fn set_checkpoint<T: Serialize>(&mut self, checkpoint: &T) -> Result<()> {
        self.checkpoint_json = Some(serde_json::to_value(checkpoint)?);
        Ok(())
    }
}

// Provider-specific checkpoint types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapTradeCheckpoint {
    pub last_synced_date: NaiveDate,
    pub lookback_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidSyncCheckpoint {
    pub cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidInvestmentsCheckpoint {
    pub last_synced_date: NaiveDate,
    pub lookback_days: u32,
}
```

---

### 2.8 Provider vs Platform Distinction

**Critical distinction:**
- **Provider / Aggregator**: How you fetch data (SnapTrade, Plaid)
- **Platform / Brokerage**: Where the account actually lives (Questrade, IBKR, Wealthsimple)

These are different layers and should not be conflated.

#### Platform Table Updates

```sql
-- Extend platforms table
ALTER TABLE platforms ADD COLUMN kind TEXT NOT NULL DEFAULT 'BROKERAGE';
  -- BROKERAGE, BANK, CRYPTO, OTHER

ALTER TABLE platforms ADD COLUMN website_url TEXT;
ALTER TABLE platforms ADD COLUMN logo_url TEXT;
```

#### Platform Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | No | Platform identifier (e.g., `QUESTRADE`, `IBKR`). |
| `name` | TEXT | No | Display name. |
| `kind` | TEXT | No | `BROKERAGE`, `BANK`, `CRYPTO`, `OTHER`. |
| `website_url` | TEXT | Yes | Platform website. |
| `logo_url` | TEXT | Yes | Logo for UI. |

#### Account Table Updates

The account needs to track three things:
1. **Where it is** - `platform_id` (Questrade, IBKR, etc.)
2. **How you connect** - `provider` (SnapTrade, Plaid, Manual)
3. **Remote identifier** - `provider_account_id` (the ID inside SnapTrade/Plaid)

```sql
-- Extend accounts table
ALTER TABLE accounts ADD COLUMN platform_id TEXT;
  -- FK to platforms.id (e.g., 'QUESTRADE')

ALTER TABLE accounts ADD COLUMN provider TEXT;
  -- 'SNAPTRADE', 'PLAID', 'MANUAL'

ALTER TABLE accounts ADD COLUMN provider_account_id TEXT;
  -- The account ID inside SnapTrade/Plaid

-- Index for provider lookups
CREATE INDEX IF NOT EXISTS ix_accounts_provider
ON accounts(provider, provider_account_id)
WHERE provider IS NOT NULL;

-- FK to platforms (if platforms table exists)
-- ALTER TABLE accounts ADD CONSTRAINT fk_accounts_platform
--   FOREIGN KEY (platform_id) REFERENCES platforms(id);
```

#### Account Triad

| Field | Example | Purpose |
|-------|---------|---------|
| `platform_id` | `QUESTRADE` | Where the account lives |
| `provider` | `SNAPTRADE` | How you fetch data |
| `provider_account_id` | `abc123` | Remote ID in the provider's system |

This triad disambiguates everything:
- Same platform via different providers (Questrade via SnapTrade vs manual)
- Same provider accessing different platforms (SnapTrade → Questrade vs SnapTrade → IBKR)

#### Rust Models

```rust
// crates/core/src/platforms/platform_model.rs

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlatformKind {
    Brokerage,
    Bank,
    Crypto,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: String,
    pub name: String,
    pub kind: PlatformKind,
    pub website_url: Option<String>,
    pub logo_url: Option<String>,
}

// crates/core/src/accounts/account_model.rs (additions)

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    // ... existing fields ...

    /// Where the account lives (Questrade, IBKR, etc.)
    pub platform_id: Option<String>,

    /// How data is fetched (SNAPTRADE, PLAID, MANUAL)
    pub provider: Option<String>,

    /// Account ID in the provider's system
    pub provider_account_id: Option<String>,
}
```

---

### 2.9 Asset Table Refactoring

The `kind` field should be a real column, not buried in JSON. It's too central to pricing/valuation rules, allowed activities, and UX.

#### Target Assets Schema

```sql
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY NOT NULL,
    symbol TEXT NOT NULL,                    -- Display symbol (AAPL, BTC, $CASH-USD, USDCAD=X)
    name TEXT,                               -- Display name

    -- Behavior classification (central to pricing/valuation/activity rules)
    kind TEXT NOT NULL,                      -- SECURITY, CRYPTO, CASH, FX_RATE, OPTION, PROPERTY, VEHICLE, OTHER

    -- Provider/market taxonomy (keep existing, but don't use for behavior)
    asset_type TEXT,                         -- EQUITY, CRYPTOCURRENCY, FOREX, etc.
    asset_class TEXT,                        -- Planning bucket: Equity, Fixed Income, Cash, Alternatives
    asset_sub_class TEXT,                    -- More granular: US Equity, IG Bonds, Gold, etc.

    -- Identifiers
    isin TEXT,                               -- Security identifier (null for crypto/options/manual)
    currency TEXT NOT NULL,                  -- Primary quote/trading currency (USD)

    -- Pricing
    data_source TEXT NOT NULL,               -- YAHOO, MANUAL, COINGECKO, etc.
    quote_symbol TEXT,                       -- Symbol for pricing lookup (e.g., Yahoo ticker)

    -- Status
    is_active INTEGER NOT NULL DEFAULT 1,   -- 1/0 for usability

    -- Extensions (JSON)
    metadata TEXT,                           -- Options spec, exposures, risk, property details, etc.

    -- Audit
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_assets_data_source_quote_symbol
ON assets(data_source, quote_symbol)
WHERE quote_symbol IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_assets_kind ON assets(kind);
CREATE INDEX IF NOT EXISTS ix_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS ix_assets_currency ON assets(currency);
```

#### Asset Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | No | Internal stable ID (UUID or slug). PK. Don't couple to provider symbols. |
| `symbol` | TEXT | No | Display symbol (AAPL, BTC, $CASH-USD, USDCAD=X, option OCC symbol). For manual: HOUSE-1. |
| `name` | TEXT | Yes | Display name. Provider names can change; OK. |
| `kind` | TEXT | No | **Behavior class**: `SECURITY`, `CRYPTO`, `CASH`, `FX_RATE`, `OPTION`, `PROPERTY`, `VEHICLE`, `OTHER`. |
| `asset_type` | TEXT | Yes | Provider/market taxonomy (EQUITY, CRYPTOCURRENCY, FOREX). Keep existing, don't use for behavior. |
| `asset_class` | TEXT | Yes | Planning bucket (Equity, Fixed Income, Cash, Alternatives, Real Estate). |
| `asset_sub_class` | TEXT | Yes | More granular bucket (US Equity, IG Bonds, Gold, etc.). Optional. |
| `isin` | TEXT | Yes | Security identifier (null for crypto/options/manual). |
| `currency` | TEXT | No | Primary quote/trading currency. For CASH this is the currency itself. |
| `data_source` | TEXT | No | Pricing source (YAHOO, MANUAL, COINGECKO). Manual assets use MANUAL. |
| `quote_symbol` | TEXT | Yes | Symbol for pricing lookup in data_source. For $CASH-USD: null. |
| `is_active` | INTEGER | No | 1/0 for usability. |
| `metadata` | TEXT | Yes | JSON for extensions (options spec, exposures, risk, property details). Validate per kind. |
| `created_at` | TEXT | No | UTC timestamp. |
| `updated_at` | TEXT | No | UTC timestamp. |

#### Asset Kind Values

| Kind | Description | Examples |
|------|-------------|----------|
| `SECURITY` | Stocks, ETFs, bonds, funds | AAPL, VTI, BND |
| `CRYPTO` | Cryptocurrencies | BTC, ETH, SOL |
| `CASH` | Holdable cash position | $CASH-USD, $CASH-EUR |
| `FX_RATE` | Currency exchange rate (not holdable) | USDCAD=X, EURUSD=X |
| `OPTION` | Options contracts | AAPL260320C00150000 |
| `COMMODITY` | Holdable commodities (physical/allocations) | GOLD-1, SILVER-1 |
| `PRIVATE_EQUITY` | Private shares, startup equity, unlisted holdings | PRIVATE-ACME, RSU-1 |
| `PROPERTY` | Real estate | HOUSE-1, RENTAL-APT |
| `VEHICLE` | Vehicles | CAR-TESLA-2022 |
| `LIABILITY` | Debts, balances owed (negative value) | MORTGAGE-1, LOAN-1, CREDITCARD-1 |
| `OTHER` | Anything else | ART-1, COLLECTIBLE-1 |

#### Metadata Schemas by Kind

**OPTION**
```json
{
  "option": {
    "underlyingAssetId": "AAPL",
    "expiration": "2026-03-20",
    "right": "CALL",
    "strike": "150",
    "multiplier": "100",
    "occSymbol": "AAPL260320C00150000"
  }
}
```

**Exposures (any fund/ETF/security)**
```json
{
  "exposures": {
    "country": {
      "taxonomy": "ISO3166-1-alpha2",
      "asOf": "2025-12-31",
      "source": "YAHOO",
      "weights": [
        { "code": "US", "weight": 1.0, "name": "United States" }
      ]
    },
    "sector": {
      "taxonomy": "YAHOO_SECTOR",
      "asOf": "2025-12-31",
      "source": "YAHOO",
      "weights": [
        { "code": "financial-services", "weight": 0.1829, "name": "Financial Services" },
        { "code": "technology", "weight": 0.2534, "name": "Technology" }
      ]
    }
  }
}
```

**Risk (single-user)**
```json
{
  "risk": {
    "level": "MEDIUM",
    "updatedAt": "2025-12-31T00:00:00Z"
  }
}
```

**PROPERTY / VEHICLE**
```json
{
  "manual": {
    "valuationMethod": "MANUAL"
  },
  "details": {
    "address": "123 Main St, City, Country",
    "purchaseDate": "2020-06-15",
    "squareFootage": 2000
  }
}
```

```json
{
  "manual": {
    "valuationMethod": "MANUAL"
  },
  "details": {
    "vin": "1HGBH41JXMN109186",
    "year": 2022,
    "make": "Tesla",
    "model": "Model 3"
  }
}
```

**LIABILITY**
```json
{
  "manual": {
    "valuationMethod": "MANUAL"
  },
  "liability": {
    "type": "MORTGAGE",
    "originalAmount": "500000",
    "interestRate": "0.065",
    "termMonths": 360,
    "startDate": "2020-01-15",
    "lender": "Bank of Example"
  }
}
```

**COMMODITY**
```json
{
  "commodity": {
    "purity": "0.9999",
    "weight": "31.1035",
    "weightUnit": "GRAM",
    "storageLocation": "Home Safe"
  }
}
```

**PRIVATE_EQUITY**
```json
{
  "manual": {
    "valuationMethod": "MANUAL"
  },
  "privateEquity": {
    "company": "Acme Corp",
    "shareClass": "Series B Preferred",
    "vestingSchedule": "4-year with 1-year cliff",
    "grantDate": "2023-01-15",
    "exercisePrice": "1.50"
  }
}
```

#### FX Pair vs Cash

| Asset | kind | currency | quote_symbol | Purpose |
|-------|------|----------|--------------|---------|
| `$CASH-USD` | `CASH` | `USD` | `NULL` | Holdable cash position |
| `$CASH-EUR` | `CASH` | `EUR` | `NULL` | Holdable cash position |
| `USDCAD=X` | `FX_RATE` | `CAD` | `USDCAD=X` | Rate instrument (not holdable) |
| `EURUSD=X` | `FX_RATE` | `USD` | `EURUSD=X` | Rate instrument (not holdable) |

This cleanly separates "holdable cash" from "rate instrument".

#### Rust Model

```rust
// crates/core/src/assets/asset_model.rs

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    Security,
    Crypto,
    Cash,
    FxRate,
    Option,
    Commodity,
    PrivateEquity,
    Property,
    Vehicle,
    Liability,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub symbol: String,
    pub name: Option<String>,

    // Behavior classification
    pub kind: AssetKind,

    // Provider/market taxonomy
    pub asset_type: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,

    // Identifiers
    pub isin: Option<String>,
    pub currency: String,

    // Pricing
    pub data_source: String,
    pub quote_symbol: Option<String>,

    // Status
    pub is_active: bool,

    // Extensions
    pub metadata: Option<Value>,

    // Audit
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Asset {
    /// Check if this asset is holdable (can have positions)
    pub fn is_holdable(&self) -> bool {
        !matches!(self.kind, AssetKind::FxRate)
    }

    /// Check if this asset needs pricing
    pub fn needs_pricing(&self) -> bool {
        match self.kind {
            AssetKind::Cash => false,  // Always 1:1 in its currency
            AssetKind::FxRate => true, // Need rate for conversion
            _ => true,
        }
    }

    /// Get option metadata if this is an option
    pub fn option_spec(&self) -> Option<OptionSpec> {
        if self.kind != AssetKind::Option {
            return None;
        }
        self.metadata.as_ref()
            .and_then(|m| m.get("option"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionSpec {
    pub underlying_asset_id: String,
    pub expiration: NaiveDate,
    pub right: String,  // CALL or PUT
    pub strike: Decimal,
    pub multiplier: Decimal,
    pub occ_symbol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposureWeight {
    pub code: String,
    pub weight: Decimal,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExposureSet {
    pub taxonomy: String,
    pub as_of: Option<NaiveDate>,
    pub source: Option<String>,
    pub weights: Vec<ExposureWeight>,
}
```

#### Migration from Current Schema

```sql
-- Add new columns
ALTER TABLE assets ADD COLUMN kind TEXT;
ALTER TABLE assets ADD COLUMN asset_class TEXT;
ALTER TABLE assets ADD COLUMN asset_sub_class TEXT;
ALTER TABLE assets ADD COLUMN quote_symbol TEXT;
ALTER TABLE assets ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assets ADD COLUMN metadata TEXT;

-- Migrate kind from asset_type
UPDATE assets SET kind = CASE
    WHEN asset_type IN ('STOCK', 'EQUITY', 'ETF', 'FUND', 'BOND') THEN 'SECURITY'
    WHEN asset_type IN ('CRYPTOCURRENCY', 'CRYPTO') THEN 'CRYPTO'
    WHEN asset_type = 'CASH' THEN 'CASH'
    WHEN asset_type = 'FOREX' THEN 'FX_RATE'
    ELSE 'SECURITY'
END;

-- Migrate existing sectors/countries to metadata.exposures
-- (Run via application code, not SQL)

-- Copy symbol to quote_symbol where data_source is YAHOO
UPDATE assets SET quote_symbol = symbol
WHERE data_source = 'YAHOO' AND quote_symbol IS NULL;

-- Make kind NOT NULL after migration
-- ALTER TABLE assets ALTER COLUMN kind SET NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS ix_assets_kind ON assets(kind);
CREATE UNIQUE INDEX IF NOT EXISTS ux_assets_data_source_quote_symbol
ON assets(data_source, quote_symbol)
WHERE quote_symbol IS NOT NULL;
```

---

### 2.10 Activity Rust Model

```rust
// crates/core/src/activities/activities_model.rs

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Activity status for lifecycle management
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActivityStatus {
    Posted,   // Live, affects calculations
    Pending,  // Awaiting settlement/confirmation
    Draft,    // User-created, not yet confirmed
    Void,     // Cancelled/reversed (soft delete)
}

impl Default for ActivityStatus {
    fn default() -> Self {
        ActivityStatus::Posted
    }
}

/// Domain model representing an activity in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    // Identity
    pub id: String,
    pub account_id: String,
    pub asset_id: Option<String>,  // NULL for pure cash movements

    // Classification
    pub activity_type: String,              // Canonical type (closed set of 13)
    pub activity_type_override: Option<String>,  // User override (never touched by sync)
    pub source_type: Option<String>,        // Raw provider label (REI, DIV, etc.)
    pub subtype: Option<String>,            // Semantic variation (DRIP, STAKING_REWARD, etc.)
    pub status: ActivityStatus,

    // Timing
    #[serde(with = "timestamp_format")]
    pub activity_date: DateTime<Utc>,
    pub settlement_date: Option<DateTime<Utc>>,

    // Quantities
    pub quantity: Option<Decimal>,
    pub unit_price: Option<Decimal>,
    pub amount: Option<Decimal>,
    pub fee: Option<Decimal>,
    pub currency: String,
    pub fx_rate: Option<Decimal>,

    // Metadata
    pub notes: Option<String>,
    pub metadata: Option<Value>,  // JSON blob

    // Source identity
    pub source_system: Option<String>,      // SNAPTRADE, PLAID, MANUAL, CSV
    pub source_record_id: Option<String>,   // Provider's record ID
    pub source_group_id: Option<String>,    // Provider grouping key
    pub idempotency_key: Option<String>,    // Stable hash for dedupe
    pub import_run_id: Option<String>,      // Batch/run identifier

    // Sync flags
    pub is_user_modified: bool,             // User edited; sync protects economics
    pub needs_review: bool,                 // Needs user review (low confidence, etc.)

    // Audit
    #[serde(with = "timestamp_format")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "timestamp_format")]
    pub updated_at: DateTime<Utc>,
}

impl Activity {
    /// Returns the effective activity type, respecting user overrides.
    /// This is what the compiler and calculator should use.
    pub fn effective_type(&self) -> &str {
        self.activity_type_override
            .as_deref()
            .unwrap_or(&self.activity_type)
    }

    /// Returns the effective date for this activity
    pub fn effective_date(&self) -> NaiveDate {
        self.activity_date.naive_utc().date()
    }

    /// Check if this activity is posted (should affect calculations)
    pub fn is_posted(&self) -> bool {
        self.status == ActivityStatus::Posted
    }

    /// Check if this activity has a user override
    pub fn has_override(&self) -> bool {
        self.activity_type_override.is_some()
    }

    /// Get quantity, defaulting to zero if not set
    pub fn qty(&self) -> Decimal {
        self.quantity.unwrap_or(Decimal::ZERO)
    }

    /// Get unit price, defaulting to zero if not set
    pub fn price(&self) -> Decimal {
        self.unit_price.unwrap_or(Decimal::ZERO)
    }

    /// Get amount, defaulting to zero if not set
    pub fn amt(&self) -> Decimal {
        self.amount.unwrap_or(Decimal::ZERO)
    }

    /// Get fee, defaulting to zero if not set
    pub fn fee_amt(&self) -> Decimal {
        self.fee.unwrap_or(Decimal::ZERO)
    }

    /// Get typed metadata value
    pub fn get_meta<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.metadata.as_ref()
            .and_then(|v| v.get(key))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }
}
```

### 2.11 Known Subtypes

While `subtype` is an open set, here are the recognized values:

| Canonical Type | Subtype | Description |
|----------------|---------|-------------|
| `DIVIDEND` | `DRIP` | Dividend reinvestment |
| `DIVIDEND` | `QUALIFIED` | Qualified dividend (tax) |
| `DIVIDEND` | `ORDINARY` | Ordinary dividend (tax) |
| `DIVIDEND` | `RETURN_OF_CAPITAL` | Return of capital distribution |
| `DIVIDEND` | `DIVIDEND_IN_KIND` | Property distribution (different asset) |
| `INTEREST` | `STAKING_REWARD` | Crypto staking reward |
| `INTEREST` | `LENDING_INTEREST` | DeFi lending interest |
| `INTEREST` | `COUPON` | Bond coupon payment |
| `SPLIT` | `STOCK_DIVIDEND` | Stock dividend (more shares of same) |
| `SPLIT` | `REVERSE_SPLIT` | Reverse stock split |
| `SELL` | `OPTION_ASSIGNMENT` | Option assigned, sold underlying |
| `BUY` | `OPTION_ASSIGNMENT` | Option assigned, bought underlying |
| `BUY` | `OPTION_EXERCISE` | Exercised option, bought underlying |
| `SELL` | `OPTION_EXERCISE` | Exercised option, sold underlying |
| `FEE` | `MANAGEMENT_FEE` | Fund management fee |
| `FEE` | `ADR_FEE` | ADR custody fee |
| `TAX` | `WITHHOLDING` | Dividend withholding tax |
| `TAX` | `NRA_WITHHOLDING` | Non-resident alien withholding |
| `CREDIT` | `FEE_REFUND` | Refund of previously charged fee |
| `CREDIT` | `TAX_REFUND` | Refund of withheld tax |
| `CREDIT` | `BONUS` | Promotional/referral credit (EXTERNAL flow) |
| `CREDIT` | `ADJUSTMENT` | Miscellaneous broker adjustment |
| `CREDIT` | `REBATE` | Commission rebate or similar |
| `CREDIT` | `REVERSAL` | Reversal of previous charge |
| `ADD_HOLDING` | `LIABILITY_INTEREST_ACCRUAL` | Interest accrued on liability (no cash) |
| `REMOVE_HOLDING` | `LIABILITY_PRINCIPAL_PAYMENT` | Principal reduction on liability |
| `FEE` | `INTEREST_CHARGE` | Interest expense paid on liability |

---

## Part 3: The Compiler

### 3.1 Compiler Contract

```rust
// crates/core/src/activities/compiler.rs

use crate::activities::Activity;
use crate::Result;

/// Compiles a stored activity (event) into canonical postings for the calculator.
///
/// Contract:
/// - Must be deterministic (same input = same output)
/// - Must preserve traceability (synthetic IDs derived from source ID)
/// - Must not require schema changes for new subtypes
pub trait ActivityCompiler {
    /// Compile a single activity into 1..N canonical postings
    fn compile(&self, activity: &Activity) -> Result<Vec<Activity>>;

    /// Compile multiple activities, preserving order
    fn compile_all(&self, activities: &[Activity]) -> Result<Vec<Activity>> {
        let mut result = Vec::new();
        for activity in activities {
            result.extend(self.compile(activity)?);
        }
        Ok(result)
    }
}
```

### 3.2 Default Compiler Implementation

```rust
// crates/core/src/activities/compiler.rs

use rust_decimal::Decimal;

pub struct DefaultActivityCompiler;

impl ActivityCompiler for DefaultActivityCompiler {
    fn compile(&self, activity: &Activity) -> Result<Vec<Activity>> {
        // Skip non-posted activities
        if !activity.is_posted() {
            return Ok(vec![]);
        }

        // Use effective_type() to respect user overrides
        let activity_type = activity.effective_type();
        let subtype = activity.subtype.as_deref();

        match (activity_type, subtype) {
            // DRIP: Dividend + Buy
            ("DIVIDEND", Some("DRIP")) => {
                Ok(self.compile_drip(activity))
            }

            // Staking Reward: Interest + Buy
            ("INTEREST", Some("STAKING_REWARD")) => {
                Ok(self.compile_staking_reward(activity))
            }

            // Dividend in Kind: Dividend + Buy (different asset)
            ("DIVIDEND", Some("DIVIDEND_IN_KIND")) => {
                Ok(self.compile_dividend_in_kind(activity))
            }

            // Stock Dividend: Pass through as SPLIT
            ("SPLIT", Some("STOCK_DIVIDEND")) => {
                Ok(vec![activity.clone()])
            }

            // Option Assignment: Complex, depends on meta
            ("BUY" | "SELL", Some("OPTION_ASSIGNMENT" | "OPTION_EXERCISE")) => {
                Ok(self.compile_option_settlement(activity))
            }

            // Default: Pass through unchanged
            _ => Ok(vec![activity.clone()]),
        }
    }
}

impl DefaultActivityCompiler {
    /// DRIP: One stored row → DIVIDEND + BUY
    ///
    /// Stored:
    ///   activity_type = DIVIDEND, subtype = DRIP
    ///   amount = dividend cash amount
    ///   quantity = shares received
    ///   unit_price = reinvestment price
    ///
    /// Compiled:
    ///   1. DIVIDEND: cash +amount (income tracking)
    ///   2. BUY: qty +quantity @ unit_price, cash -amount
    ///
    /// Net cash effect: ~0 (dividend received = purchase cost)
    /// Net contribution: unchanged (income reinvested, not new money)
    fn compile_drip(&self, activity: &Activity) -> Vec<Activity> {
        let dividend_amount = activity.amt();

        // Leg 1: DIVIDEND (income recognition)
        let mut dividend_leg = activity.clone();
        dividend_leg.id = format!("{}:dividend", activity.id);
        dividend_leg.subtype = None;  // Clear subtype for calculator
        dividend_leg.quantity = None;
        dividend_leg.unit_price = None;
        // amount stays as-is

        // Leg 2: BUY (share acquisition)
        let mut buy_leg = activity.clone();
        buy_leg.id = format!("{}:buy", activity.id);
        buy_leg.activity_type = "BUY".to_string();
        buy_leg.subtype = None;
        buy_leg.amount = None;  // Let BUY compute from qty * price
        buy_leg.fee = Some(Decimal::ZERO);  // Fee already in dividend leg

        vec![dividend_leg, buy_leg]
    }

    /// Staking Reward: One stored row → INTEREST + BUY
    ///
    /// Stored:
    ///   activity_type = INTEREST, subtype = STAKING_REWARD
    ///   asset_id = rewarded token
    ///   quantity = reward quantity
    ///   unit_price = FMV at receipt
    ///   amount = quantity * unit_price
    ///
    /// Compiled:
    ///   1. INTEREST: cash +amount (income tracking)
    ///   2. BUY: qty +quantity @ FMV, cash -amount
    ///
    /// Net cash effect: 0
    /// Holdings increase correctly
    /// Not counted as external contribution
    fn compile_staking_reward(&self, activity: &Activity) -> Vec<Activity> {
        // Leg 1: INTEREST (income recognition)
        let mut interest_leg = activity.clone();
        interest_leg.id = format!("{}:interest", activity.id);
        interest_leg.subtype = None;
        interest_leg.quantity = None;
        interest_leg.unit_price = None;

        // Leg 2: BUY (token acquisition)
        let mut buy_leg = activity.clone();
        buy_leg.id = format!("{}:buy", activity.id);
        buy_leg.activity_type = "BUY".to_string();
        buy_leg.subtype = None;
        buy_leg.amount = None;
        buy_leg.fee = Some(Decimal::ZERO);

        vec![interest_leg, buy_leg]
    }

    /// Dividend in Kind: Receive different asset as dividend
    ///
    /// Most brokers don't "pay cash then buy" - they just deliver shares/asset directly.
    ///
    /// Stored:
    ///   activity_type = DIVIDEND, subtype = DIVIDEND_IN_KIND
    ///   asset_id = received asset (NOT the source asset)
    ///   quantity = units received
    ///   unit_price = FMV
    ///   amount = FMV (qty * price) - for income reporting
    ///   metadata.sourceAssetId = original holding that paid dividend
    ///   metadata.noCash = true
    ///
    /// Compiled:
    ///   1. DIVIDEND: income recognition (for reporting), no cash movement
    ///   2. ADD_HOLDING: qty +quantity of received asset (no cash leg)
    ///
    /// The ADD_HOLDING is used instead of BUY because there's no actual cash movement.
    fn compile_dividend_in_kind(&self, activity: &Activity) -> Vec<Activity> {
        // Leg 1: DIVIDEND (income recognition for reporting)
        let mut dividend_leg = activity.clone();
        dividend_leg.id = format!("{}:dividend", activity.id);
        dividend_leg.subtype = None;
        dividend_leg.quantity = None;
        dividend_leg.unit_price = None;
        // Mark as no cash movement if calculator needs this flag
        if let Some(ref mut meta) = dividend_leg.metadata {
            meta["noCash"] = serde_json::Value::Bool(true);
        }

        // Leg 2: ADD_HOLDING (asset acquisition without cash)
        let mut holding_leg = activity.clone();
        holding_leg.id = format!("{}:add_holding", activity.id);
        holding_leg.activity_type = "ADD_HOLDING".to_string();
        holding_leg.subtype = None;
        holding_leg.amount = None;  // No cash movement
        holding_leg.fee = None;

        vec![dividend_leg, holding_leg]
    }

    /// Option Settlement: Assignment or Exercise
    ///
    /// CRITICAL: Assignment/exercise must emit TWO legs:
    /// 1. Close the option contract position (REMOVE_HOLDING or SELL)
    /// 2. Underlying stock trade (BUY or SELL at strike)
    ///
    /// Without leg 1, the option position stays open incorrectly.
    ///
    /// Stored:
    ///   activity_type = BUY or SELL (for underlying)
    ///   subtype = OPTION_ASSIGNMENT or OPTION_EXERCISE
    ///   asset_id = underlying stock
    ///   quantity = shares (contract_qty * multiplier)
    ///   unit_price = strike price
    ///   metadata = { optionAssetId, optionSymbol, strike, expiry, optionType, multiplier, contractQty }
    ///
    /// Compiled:
    ///   1. REMOVE_HOLDING: Close option contract position
    ///   2. BUY/SELL: Underlying stock at strike price
    fn compile_option_settlement(&self, activity: &Activity) -> Vec<Activity> {
        let mut legs = Vec::new();

        // Leg 1: Close the option contract position
        // Extract option details from metadata
        if let Some(option_asset_id) = activity.get_meta::<String>("optionAssetId") {
            let contract_qty = activity.get_meta::<Decimal>("contractQty")
                .unwrap_or(Decimal::ONE);

            let mut close_option = activity.clone();
            close_option.id = format!("{}:close_option", activity.id);
            close_option.activity_type = "REMOVE_HOLDING".to_string();
            close_option.subtype = Some("OPTION_SETTLEMENT".to_string());
            close_option.asset_id = Some(option_asset_id);
            close_option.quantity = Some(contract_qty.abs());  // Contracts being closed
            close_option.unit_price = Some(Decimal::ZERO);  // Worthless at settlement
            close_option.amount = None;  // No cash from closing option itself
            close_option.fee = None;

            legs.push(close_option);
        }

        // Leg 2: Underlying stock trade
        let mut underlying_trade = activity.clone();
        underlying_trade.id = format!("{}:underlying", activity.id);
        underlying_trade.subtype = None;  // Clear subtype for calculator
        // activity_type already BUY or SELL
        // asset_id already underlying stock
        // quantity already shares
        // unit_price already strike

        legs.push(underlying_trade);

        legs
    }
}
```

### 3.3 Integration with Calculator

```rust
// crates/core/src/portfolio/snapshot/snapshot_service.rs

impl SnapshotService {
    pub fn calculate_holdings_snapshots(
        &self,
        account_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<AccountStateSnapshot>> {
        // 1. Fetch stored activities
        let stored_activities = self.activity_repository
            .get_activities_for_account(account_id, start_date, end_date)?;

        // 2. Compile to canonical postings
        let compiler = DefaultActivityCompiler;
        let compiled_activities = compiler.compile_all(&stored_activities)?;

        // 3. Group by date
        let activities_by_date = self.group_by_date(&compiled_activities);

        // 4. Calculate snapshots (existing logic - unchanged)
        self.calculate_snapshots_from_activities(account_id, activities_by_date)
    }
}
```

---

## Part 4: Event Type Implementations

### 4.1 DRIP (Dividend Reinvestment)

#### Storage Format

```json
{
  "id": "uuid",
  "account_id": "account-uuid",
  "asset_id": "AAPL",
  "activity_type": "DIVIDEND",
  "subtype": "DRIP",
  "status": "POSTED",
  "activity_date": "2024-03-15T00:00:00Z",
  "quantity": 0.5,
  "unit_price": 172.50,
  "amount": 86.25,
  "fee": 0,
  "currency": "USD",
  "description": "AAPL DIVIDEND REINVESTED",
  "metadata": {
    "grossAmount": 100.00,
    "withholdingTax": 13.75,
    "residualCash": 0.00
  },
  "provider": "SNAPTRADE",
  "provider_activity_id": "snap-123",
  "provider_reference_id": "ext-ref-456",
  "provider_fingerprint": "hash..."
}
```

#### SnapTrade Mapping

| SnapTrade Field | Wealthfolio Field |
|-----------------|-------------------|
| `type` = "REI" | `activity_type` = "DIVIDEND", `subtype` = "DRIP" |
| `trade_date` | `activity_date` |
| `settlement_date` | `settled_at` |
| `symbol` | `asset_id` (resolved) |
| `units` | `quantity` |
| `price` | `unit_price` |
| `amount` | `amount` |
| `currency` | `currency` |
| `id` | `provider_activity_id` |
| `external_reference_id` | `provider_reference_id` |

#### Compiled Output

```
Input:  1 DIVIDEND/DRIP activity
Output: 2 canonical postings

1. DIVIDEND
   - id: "uuid:dividend"
   - amount: 86.25
   - cash: +86.25

2. BUY
   - id: "uuid:buy"
   - quantity: 0.5
   - unit_price: 172.50
   - cash: -86.25
   - position: +0.5 shares

Net: cash ~0, position +0.5 shares, income +86.25
```

### 4.2 Crypto Staking Rewards

#### Storage Format

```json
{
  "id": "uuid",
  "account_id": "account-uuid",
  "asset_id": "SOL",
  "activity_type": "INTEREST",
  "subtype": "STAKING_REWARD",
  "status": "POSTED",
  "activity_date": "2024-03-15T00:00:00Z",
  "quantity": 0.1,
  "unit_price": 150.00,
  "amount": 15.00,
  "fee": 0,
  "currency": "USD",
  "description": "SOL STAKING REWARD",
  "metadata": {
    "protocol": "solana",
    "validator": "validator-address",
    "epoch": 500,
    "fmvSource": "coingecko"
  }
}
```

#### Compiled Output

```
Input:  1 INTEREST/STAKING_REWARD activity
Output: 2 canonical postings

1. INTEREST
   - amount: 15.00
   - cash: +15.00

2. BUY
   - quantity: 0.1
   - unit_price: 150.00
   - cash: -15.00
   - position: +0.1 SOL

Net: cash 0, position +0.1 SOL, income +15.00
```

### 4.3 Options Trading

Options use the existing canonical types with subtypes and metadata.

#### Option Premium (Sell to Open)

```json
{
  "id": "uuid",
  "account_id": "account-uuid",
  "asset_id": "AAPL240315P00150000",
  "activity_type": "SELL",
  "subtype": "OPTION_OPEN",
  "status": "POSTED",
  "activity_date": "2024-02-01T00:00:00Z",
  "quantity": -1,
  "unit_price": 3.50,
  "amount": 350.00,
  "fee": 0.65,
  "currency": "USD",
  "description": "SELL TO OPEN AAPL PUT",
  "metadata": {
    "optionType": "PUT",
    "strike": 150.00,
    "expiry": "2024-03-15",
    "multiplier": 100,
    "underlyingAssetId": "AAPL",
    "openClose": "OPEN",
    "direction": "SHORT"
  }
}
```

**Note**: For options, we use:
- `SELL` with `subtype=OPTION_OPEN` for writing (credit)
- `BUY` with `subtype=OPTION_OPEN` for buying (debit)
- `BUY` with `subtype=OPTION_CLOSE` for buying to close
- `SELL` with `subtype=OPTION_CLOSE` for selling to close
- Expiration: `REMOVE_HOLDING` with `subtype=OPTION_EXPIRE`
- Assignment: `BUY` or `SELL` with `subtype=OPTION_ASSIGNMENT`

#### Option Assignment

When a short put is assigned, you buy the underlying:

```json
{
  "id": "uuid",
  "account_id": "account-uuid",
  "asset_id": "AAPL",
  "activity_type": "BUY",
  "subtype": "OPTION_ASSIGNMENT",
  "status": "POSTED",
  "activity_date": "2024-03-15T00:00:00Z",
  "quantity": 100,
  "unit_price": 150.00,
  "amount": 15000.00,
  "fee": 0,
  "currency": "USD",
  "description": "OPTION ASSIGNMENT - BOUGHT AAPL",
  "metadata": {
    "optionSymbol": "AAPL240315P00150000",
    "optionType": "PUT",
    "strike": 150.00,
    "originalPremium": 350.00
  }
}
```

The compiler passes this through as a normal BUY (clearing subtype).

### 4.4 Stock Dividends

Stock dividends (receiving more shares of the same stock) are split-like:

```json
{
  "id": "uuid",
  "account_id": "account-uuid",
  "asset_id": "NVDA",
  "activity_type": "SPLIT",
  "subtype": "STOCK_DIVIDEND",
  "status": "POSTED",
  "activity_date": "2024-06-10T00:00:00Z",
  "quantity": 10,
  "unit_price": 0,
  "amount": 0,
  "currency": "USD",
  "description": "NVDA 10-FOR-1 STOCK SPLIT",
  "metadata": {
    "splitRatio": 10,
    "preSplitQuantity": 10,
    "postSplitQuantity": 100
  }
}
```

---

## Part 5: Provider Integration

### 5.1 Idempotency Key Computation

```rust
// crates/core/src/activities/idempotency.rs

use sha2::{Sha256, Digest};
use rust_decimal::Decimal;

/// Computes a stable idempotency key for upsert/dedupe.
/// This key should remain constant even if the provider changes their record ID.
///
/// The key is unique per (source_system, idempotency_key).
/// Input for idempotency key computation.
/// Use the best available discriminator for your provider.
pub struct IdempotencyInput<'a> {
    // Required fields
    pub account_id: &'a str,
    pub activity_type: &'a str,
    pub currency: &'a str,

    // Discriminators (in priority order - use best available)
    // 1. Best: Provider's unique transaction/execution ID
    pub provider_transaction_id: Option<&'a str>,
    // 2. Good: Timestamp with time component (not just date)
    pub timestamp: Option<&'a str>,  // Full ISO8601 with time
    // 3. Okay: Provider grouping/reference ID
    pub source_group_id: Option<&'a str>,

    // Economic fields (use fixed-scale normalization)
    pub asset_id: Option<&'a str>,
    pub quantity: Option<Decimal>,
    pub unit_price: Option<Decimal>,
    pub amount: Option<Decimal>,

    // Fallback disambiguators
    pub description: Option<&'a str>,
}

pub fn compute_idempotency_key(input: &IdempotencyInput) -> String {
    let mut hasher = Sha256::new();

    // Core identity
    hasher.update(input.account_id.as_bytes());
    hasher.update(b"|");
    hasher.update(normalize_type(input.activity_type).as_bytes());
    hasher.update(b"|");
    hasher.update(input.currency.to_uppercase().as_bytes());

    // Best discriminator: provider's unique ID (if available, this alone is enough)
    if let Some(tx_id) = input.provider_transaction_id {
        hasher.update(b"|txid:");
        hasher.update(tx_id.as_bytes());
        // With a unique tx_id, we don't need other fields
        let result = hasher.finalize();
        return hex::encode(&result[..16]);
    }

    // Include timestamp (prefer full timestamp over date-only)
    if let Some(ts) = input.timestamp {
        hasher.update(b"|ts:");
        hasher.update(ts.as_bytes());  // Keep full precision
    }

    // Include group ID if available
    if let Some(group_id) = input.source_group_id {
        hasher.update(b"|grp:");
        hasher.update(group_id.as_bytes());
    }

    // Economic fields with fixed-scale normalization
    hasher.update(b"|");
    hasher.update(input.asset_id.unwrap_or("").as_bytes());
    hasher.update(b"|qty:");
    hasher.update(normalize_quantity(input.quantity).as_bytes());
    hasher.update(b"|px:");
    hasher.update(normalize_price(input.unit_price).as_bytes());
    hasher.update(b"|amt:");
    hasher.update(normalize_amount(input.amount).as_bytes());

    // Fallback: description (normalized)
    if let Some(desc) = input.description {
        hasher.update(b"|desc:");
        hasher.update(normalize_description(desc).as_bytes());
    }

    let result = hasher.finalize();
    hex::encode(&result[..16])
}

/// Normalize activity type for consistent hashing
fn normalize_type(activity_type: &str) -> String {
    match activity_type.to_uppercase().as_str() {
        "REI" | "DRIP" | "REINVEST" => "DIVIDEND".to_string(),
        "DIV" => "DIVIDEND".to_string(),
        "INT" => "INTEREST".to_string(),
        "DEP" | "CONTRIBUTION" => "DEPOSIT".to_string(),
        "WD" | "DISTRIBUTION" => "WITHDRAWAL".to_string(),
        other => other.to_uppercase(),
    }
}

/// Normalize quantity to 8 decimal places (supports crypto)
fn normalize_quantity(value: Option<Decimal>) -> String {
    value
        .map(|d| d.round_dp(8).to_string())
        .unwrap_or_default()
}

/// Normalize price to 8 decimal places
fn normalize_price(value: Option<Decimal>) -> String {
    value
        .map(|d| d.round_dp(8).to_string())
        .unwrap_or_default()
}

/// Normalize amount to 4 decimal places (fiat with some buffer)
fn normalize_amount(value: Option<Decimal>) -> String {
    value
        .map(|d| d.round_dp(4).to_string())
        .unwrap_or_default()
}

/// Normalize description: lowercase, collapse whitespace, trim
fn normalize_description(desc: &str) -> String {
    desc.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
```

### 5.2 SnapTrade Ingestor

```rust
// crates/connect/src/snaptrade/ingestor.rs

use crate::activities::idempotency::{compute_idempotency_key, IdempotencyInput};

pub struct SnapTradeIngestor;

impl SnapTradeIngestor {
    pub fn convert_activity(
        &self,
        snap_activity: &SnapTradeActivity,
        account_id: &str,
    ) -> Result<Activity> {
        // Map to canonical type + our semantic subtype
        // Unknown provider types → UNKNOWN (closed set safe) + needs_review
        let (activity_type, subtype, needs_review) = self.map_type(&snap_activity.r#type);

        // Compute idempotency key with best available discriminators
        let idempotency_key = compute_idempotency_key(&IdempotencyInput {
            account_id,
            activity_type: &activity_type,
            currency: &snap_activity.currency.code,
            // Discriminators (in priority order)
            provider_transaction_id: snap_activity.id.as_deref(),  // SnapTrade's ID
            timestamp: snap_activity.trade_date.as_deref(),  // Full timestamp if available
            source_group_id: snap_activity.external_reference_id.as_deref(),
            // Economic fields
            asset_id: snap_activity.symbol.as_deref(),
            quantity: snap_activity.units,
            unit_price: snap_activity.price,
            amount: snap_activity.amount,
            description: snap_activity.description.as_deref(),
        });

        // Additional needs_review triggers
        let needs_review = needs_review || snap_activity.amount.is_none();

        Ok(Activity {
            id: Uuid::new_v4().to_string(),
            account_id: account_id.to_string(),
            asset_id: self.resolve_asset_id(&snap_activity.symbol)?,

            // Classification
            activity_type,  // Canonical (closed set of 13 + UNKNOWN)
            activity_type_override: None,  // User sets this, never provider
            source_type: Some(snap_activity.r#type.clone()),  // Raw provider label (unbounded)
            subtype,  // Our semantic layer (bounded, only set for known mappings)
            status: ActivityStatus::Posted,

            // Timing
            activity_date: parse_date(&snap_activity.trade_date)?,
            settlement_date: snap_activity.settlement_date.as_ref()
                .and_then(|d| parse_date(d).ok()),

            // Quantities
            quantity: snap_activity.units,
            unit_price: snap_activity.price,
            amount: snap_activity.amount,
            fee: snap_activity.fee,
            currency: snap_activity.currency.code.clone(),
            fx_rate: snap_activity.fx_rate,

            // Metadata
            notes: None,  // User sets this
            metadata: self.build_metadata(snap_activity),

            // Source identity
            source_system: Some("SNAPTRADE".to_string()),
            source_record_id: Some(snap_activity.id.clone()),  // Unstable, for traceability
            source_group_id: snap_activity.external_reference_id.clone(),
            idempotency_key: Some(idempotency_key),
            import_run_id: None,  // Set by caller

            // Sync flags
            is_user_modified: false,  // New from provider
            needs_review,

            // Audit
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
    }

    /// Map provider type to (canonical_type, subtype, needs_review).
    /// - activity_type: Closed set of 14 (13 canonical + UNKNOWN)
    /// - subtype: Our semantic layer (bounded, only set for known mappings)
    /// - needs_review: True if unknown/ambiguous type
    ///
    /// IMPORTANT: Never invent subtypes from unknown provider types.
    /// Unknown types → UNKNOWN + needs_review=true, user can set activity_type_override.
    fn map_type(&self, snap_type: &str) -> (String, Option<String>, bool) {
        match snap_type.to_uppercase().as_str() {
            "BUY" => ("BUY".into(), None, false),
            "SELL" => ("SELL".into(), None, false),
            "DIV" => ("DIVIDEND".into(), None, false),
            "REI" => ("DIVIDEND".into(), Some("DRIP".into()), false),
            "INT" => ("INTEREST".into(), None, false),
            "DEP" | "CONTRIBUTION" => ("DEPOSIT".into(), None, false),
            "WD" | "WITHDRAWAL" => ("WITHDRAWAL".into(), None, false),
            "FEE" | "FEES" => ("FEE".into(), None, false),
            "TAX" => ("TAX".into(), None, false),
            "SPLIT" => ("SPLIT".into(), None, false),
            "TRANSFER_IN" | "JOURNAL_IN" => ("TRANSFER_IN".into(), None, false),
            "TRANSFER_OUT" | "JOURNAL_OUT" => ("TRANSFER_OUT".into(), None, false),
            // Options
            "OPT_BUY" => ("BUY".into(), Some("OPTION_OPEN".into()), false),
            "OPT_SELL" => ("SELL".into(), Some("OPTION_OPEN".into()), false),
            "OPT_ASSIGN" => ("BUY".into(), Some("OPTION_ASSIGNMENT".into()), false),
            "OPT_EXPIRE" => ("REMOVE_HOLDING".into(), Some("OPTION_EXPIRE".into()), false),
            // Credits (refunds, bonuses - internal flow, not external)
            "REFUND" | "FEE_REFUND" | "REBATE" => ("CREDIT".into(), Some("FEE_REFUND".into()), false),
            "TAX_REFUND" | "TAX_RECLAIM" => ("CREDIT".into(), Some("TAX_REFUND".into()), false),
            "BONUS" | "PROMO" | "REFERRAL" => ("CREDIT".into(), Some("BONUS".into()), false),
            "ADJUSTMENT" | "CREDIT" | "ADJ" => ("CREDIT".into(), Some("ADJUSTMENT".into()), false),
            // UNKNOWN: Closed set safe, needs user review
            // Raw label preserved in source_type for traceability
            _ => ("UNKNOWN".into(), None, true),
        }
    }
}
```

### 5.3 Upsert Logic

```rust
// crates/storage-sqlite/src/activities/repository.rs

impl ActivityRepository {
    /// Upsert activity using idempotency_key for deduplication.
    /// Uses is_user_modified flag to determine what can be updated.
    pub fn upsert_by_idempotency_key(
        &self,
        incoming: &Activity,
        import_run_id: &str,
    ) -> Result<UpsertResult> {
        let source_system = incoming.source_system.as_ref()
            .ok_or(ActivityError::InvalidData("source_system required for upsert".into()))?;
        let idempotency_key = incoming.idempotency_key.as_ref()
            .ok_or(ActivityError::InvalidData("idempotency_key required for upsert".into()))?;

        // Check for existing by (source_system, idempotency_key)
        let existing = self.find_by_idempotency_key(source_system, idempotency_key)?;

        match existing {
            Some(existing_activity) => {
                if existing_activity.is_user_modified {
                    // User has edited - only update trace/import bookkeeping
                    let merged = self.merge_bookkeeping_only(&existing_activity, incoming, import_run_id);
                    self.update(&merged)?;
                    Ok(UpsertResult::Updated(merged))
                } else {
                    // Not user-modified - update provider-owned fields
                    let merged = self.merge_provider_fields(&existing_activity, incoming, import_run_id);
                    if self.has_changes(&existing_activity, &merged) {
                        self.update(&merged)?;
                        Ok(UpsertResult::Updated(merged))
                    } else {
                        Ok(UpsertResult::Unchanged(existing_activity))
                    }
                }
            }
            None => {
                let mut new_activity = incoming.clone();
                new_activity.import_run_id = Some(import_run_id.to_string());
                new_activity.is_user_modified = false;
                self.create(&new_activity)?;
                Ok(UpsertResult::Created(new_activity))
            }
        }
    }

    /// Merge bookkeeping fields (for user-modified activities).
    /// Economic fields are protected, but bookkeeping always updates.
    fn merge_bookkeeping_only(
        &self,
        existing: &Activity,
        incoming: &Activity,
        import_run_id: &str,
    ) -> Activity {
        let mut merged = existing.clone();

        // Always update these (even when is_user_modified = 1)
        merged.source_type = incoming.source_type.clone();
        merged.source_record_id = incoming.source_record_id.clone();
        merged.source_group_id = incoming.source_group_id.clone();
        merged.import_run_id = Some(import_run_id.to_string());
        merged.metadata = self.merge_metadata(&existing.metadata, &incoming.metadata);
        merged.updated_at = Utc::now();

        // Preserve: is_user_modified, needs_review (app-controlled)
        // Preserve: activity_type_override, notes (user-controlled)
        // Preserve: all economic fields (protected)

        merged
    }

    /// Merge provider-owned fields (for non-user-modified activities).
    /// User-controlled fields are NEVER overwritten.
    fn merge_provider_fields(
        &self,
        existing: &Activity,
        incoming: &Activity,
        import_run_id: &str,
    ) -> Activity {
        Activity {
            // Preserve identity
            id: existing.id.clone(),
            account_id: existing.account_id.clone(),

            // Provider-owned fields (ok to update)
            asset_id: incoming.asset_id.clone(),
            activity_type: incoming.activity_type.clone(),
            source_type: incoming.source_type.clone(),
            subtype: incoming.subtype.clone(),
            activity_date: incoming.activity_date,
            settlement_date: incoming.settlement_date,
            quantity: incoming.quantity,
            unit_price: incoming.unit_price,
            amount: incoming.amount,
            fee: incoming.fee,
            currency: incoming.currency.clone(),
            fx_rate: incoming.fx_rate,
            status: incoming.status.clone(),
            metadata: self.merge_metadata(&existing.metadata, &incoming.metadata),

            // Source fields from incoming
            source_system: incoming.source_system.clone(),
            source_record_id: incoming.source_record_id.clone(),
            source_group_id: incoming.source_group_id.clone(),
            idempotency_key: incoming.idempotency_key.clone(),
            import_run_id: Some(import_run_id.to_string()),

            // Sync flags
            is_user_modified: existing.is_user_modified,  // Preserve
            needs_review: incoming.needs_review,  // Update from sync

            // USER-CONTROLLED - NEVER overwritten by sync
            activity_type_override: existing.activity_type_override.clone(),
            notes: existing.notes.clone(),

            // Audit
            created_at: existing.created_at,
            updated_at: Utc::now(),
        }
    }

    /// Merge metadata: deep-merge source namespace, preserve user fields.
    /// Structure:
    /// - metadata.source.*  = provider-owned (sync updates)
    /// - metadata.*         = user-owned (sync preserves)
    fn merge_metadata(
        &self,
        existing: &Option<Value>,
        incoming: &Option<Value>,
    ) -> Option<Value> {
        match (existing, incoming) {
            (Some(existing_val), Some(incoming_val)) => {
                let mut merged = existing_val.clone();

                if let Some(merged_obj) = merged.as_object_mut() {
                    // Deep-merge the "source" namespace only
                    if let Some(incoming_obj) = incoming_val.as_object() {
                        let existing_source = merged_obj
                            .entry("source")
                            .or_insert_with(|| Value::Object(serde_json::Map::new()));

                        if let Some(source_obj) = existing_source.as_object_mut() {
                            // Merge all incoming keys into source
                            for (key, value) in incoming_obj {
                                source_obj.insert(key.clone(), value.clone());
                            }
                        }
                    } else {
                        // Incoming is not an object, store as raw
                        merged_obj.insert("source".to_string(), incoming_val.clone());
                    }
                }

                Some(merged)
            }
            (Some(existing_val), None) => Some(existing_val.clone()),
            (None, Some(incoming_val)) => {
                // No existing metadata, wrap incoming in source namespace
                let mut obj = serde_json::Map::new();
                if let Some(incoming_obj) = incoming_val.as_object() {
                    let mut source = serde_json::Map::new();
                    for (key, value) in incoming_obj {
                        source.insert(key.clone(), value.clone());
                    }
                    obj.insert("source".to_string(), Value::Object(source));
                } else {
                    obj.insert("source".to_string(), incoming_val.clone());
                }
                Some(Value::Object(obj))
            }
            (None, None) => None,
        }
    }
}

pub enum UpsertResult {
    Created(Activity),
    Updated(Activity),
    Unchanged(Activity),
}
```

---

## Part 6: Splits and Valuation

### 6.1 Split Handling with Yahoo Close

Since Yahoo "Close" is split-adjusted, handle splits in ledger space:

```rust
// crates/core/src/portfolio/valuation/split_adjuster.rs

/// Computes effective quantity at a point in time by applying
/// cumulative split factors for splits that occurred AFTER that date.
///
/// q_effective(t) = q_ledger(t) * Π(split_ratio for splits where effective_date > t)
///
/// This aligns ledger quantities with Yahoo's back-adjusted Close prices.
pub fn compute_effective_quantity(
    ledger_quantity: Decimal,
    as_of_date: NaiveDate,
    split_events: &[SplitEvent],
) -> Decimal {
    let mut factor = Decimal::ONE;

    for split in split_events {
        if split.effective_date > as_of_date {
            factor *= split.ratio;
        }
    }

    ledger_quantity * factor
}

pub struct SplitEvent {
    pub effective_date: NaiveDate,
    pub ratio: Decimal,  // e.g., 4.0 for 4-for-1 split
}
```

### 6.2 Valuation with Split Adjustment

```rust
// crates/core/src/portfolio/valuation/valuation_calculator.rs

impl ValuationCalculator {
    pub fn calculate_position_value(
        &self,
        position: &Position,
        quote: &Quote,
        valuation_date: NaiveDate,
    ) -> Result<Decimal> {
        // Get split events for this asset
        let splits = self.get_split_events(&position.asset_id)?;

        // Compute effective quantity (adjusted for future splits)
        let effective_qty = compute_effective_quantity(
            position.quantity,
            valuation_date,
            &splits,
        );

        // Use Yahoo Close price (already split-adjusted)
        let market_value = effective_qty * quote.close;

        Ok(market_value)
    }
}
```

---

## Part 7: Performance Calculation

### 7.1 External vs Internal Flows

```rust
// crates/core/src/portfolio/performance/flow_classifier.rs

pub enum FlowType {
    External,  // Affects TWR, counts as contribution
    Internal,  // Does not affect TWR
}

pub fn classify_flow(activity: &Activity) -> FlowType {
    match activity.effective_type() {
        // External flows - money crossing portfolio boundary
        "DEPOSIT" | "WITHDRAWAL" => FlowType::External,

        // CREDIT: depends on subtype
        "CREDIT" => {
            match activity.subtype.as_deref() {
                // BONUS is external (new money entering portfolio)
                Some("BONUS") => FlowType::External,
                // FEE_REFUND, TAX_REFUND, REBATE, REVERSAL are internal
                _ => FlowType::Internal,
            }
        }

        // Everything else is internal
        // Including: BUY, SELL, DIVIDEND, INTEREST, TRANSFER_*, FEE, TAX, SPLIT
        _ => FlowType::Internal,
    }
}

/// For portfolio-level performance (multiple accounts):
/// - Transfers between accounts are INTERNAL
/// - Only DEPOSIT/WITHDRAWAL are EXTERNAL
///
/// For account-level performance:
/// - TRANSFER_IN/OUT may be treated as EXTERNAL
pub fn classify_flow_for_scope(
    activity: &Activity,
    scope: PerformanceScope,
) -> FlowType {
    match scope {
        PerformanceScope::Portfolio => classify_flow(activity),
        PerformanceScope::Account => {
            match activity.activity_type.as_str() {
                "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_IN" | "TRANSFER_OUT" => {
                    FlowType::External
                }
                _ => FlowType::Internal,
            }
        }
    }
}
```

### 7.2 TWR Calculation

```rust
// crates/core/src/portfolio/performance/twr.rs

/// Time-Weighted Return calculation
/// TWR isolates investment performance from cash flows
pub fn calculate_twr(
    valuations: &[DailyValuation],
    external_flows: &[CashFlow],
) -> Result<Decimal> {
    let mut cumulative_return = Decimal::ONE;

    for i in 1..valuations.len() {
        let prev = &valuations[i - 1];
        let curr = &valuations[i];

        // Get external flow on current date
        let flow = external_flows.iter()
            .filter(|f| f.date == curr.date)
            .map(|f| f.amount)
            .sum::<Decimal>();

        // Daily return = (V_t - F_t) / V_{t-1} - 1
        // Where F_t is external flow on day t
        let denominator = prev.total_value;
        if denominator == Decimal::ZERO {
            continue;
        }

        let daily_return = (curr.total_value - flow) / denominator;
        cumulative_return *= daily_return;
    }

    Ok(cumulative_return - Decimal::ONE)
}
```

---

## Part 8: Frontend Updates

### 8.1 TypeScript Types

```typescript
// src-front/lib/types.ts

export type ActivityStatus = "POSTED" | "PENDING" | "DRAFT" | "VOID";

export interface Activity {
  id: string;
  accountId: string;
  assetId?: string;

  // Classification
  activityType: string;           // Canonical type (closed set of 13)
  activityTypeOverride?: string;  // User override (never touched by sync)
  sourceType?: string;            // Raw provider label (REI, DIV, etc.)
  subtype?: string;               // Semantic variation (DRIP, STAKING_REWARD, etc.)
  status: ActivityStatus;

  // Timing
  activityDate: string;     // ISO timestamp (UTC)
  settlementDate?: string;

  // Quantities
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  fee?: string;
  currency: string;
  fxRate?: string;

  // Metadata
  notes?: string;
  metadata?: Record<string, unknown>;

  // Source identity
  sourceSystem?: string;       // SNAPTRADE, PLAID, MANUAL, CSV
  sourceRecordId?: string;
  sourceGroupId?: string;
  idempotencyKey?: string;
  importRunId?: string;

  // Sync flags
  isUserModified: boolean;     // User edited; sync protects economics
  needsReview: boolean;        // Needs user review (low confidence, etc.)

  // Audit
  createdAt: string;
  updatedAt: string;
}

// Helper to get effective type (respects user override)
export function getEffectiveType(activity: Activity): string {
  return activity.activityTypeOverride ?? activity.activityType;
}

// Known subtypes for UI
export const ActivitySubtypes = {
  DRIP: "DRIP",
  STAKING_REWARD: "STAKING_REWARD",
  DIVIDEND_IN_KIND: "DIVIDEND_IN_KIND",
  STOCK_DIVIDEND: "STOCK_DIVIDEND",
  OPTION_OPEN: "OPTION_OPEN",
  OPTION_CLOSE: "OPTION_CLOSE",
  OPTION_EXPIRE: "OPTION_EXPIRE",
  OPTION_ASSIGNMENT: "OPTION_ASSIGNMENT",
  OPTION_EXERCISE: "OPTION_EXERCISE",
  QUALIFIED: "QUALIFIED",
  ORDINARY: "ORDINARY",
  RETURN_OF_CAPITAL: "RETURN_OF_CAPITAL",
  COUPON: "COUPON",
  WITHHOLDING: "WITHHOLDING",
} as const;

export type ActivitySubtype = typeof ActivitySubtypes[keyof typeof ActivitySubtypes];
```

### 8.2 Display Names

```typescript
// src-front/lib/constants.ts

export const ActivityDisplayNames: Record<string, string> = {
  // Canonical types
  BUY: "Buy",
  SELL: "Sell",
  DIVIDEND: "Dividend",
  INTEREST: "Interest",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  FEE: "Fee",
  TAX: "Tax",
  SPLIT: "Split",
  ADD_HOLDING: "Add Holding",
  REMOVE_HOLDING: "Remove Holding",
};

export const SubtypeDisplayNames: Record<string, string> = {
  DRIP: "Dividend Reinvested",
  STAKING_REWARD: "Staking Reward",
  DIVIDEND_IN_KIND: "Dividend (In Kind)",
  STOCK_DIVIDEND: "Stock Dividend",
  OPTION_OPEN: "Option Open",
  OPTION_CLOSE: "Option Close",
  OPTION_EXPIRE: "Option Expired",
  OPTION_ASSIGNMENT: "Option Assignment",
  OPTION_EXERCISE: "Option Exercise",
};

export function getActivityDisplayName(activity: Activity): string {
  // Check subtype first (most specific)
  if (activity.subtype && SubtypeDisplayNames[activity.subtype]) {
    return SubtypeDisplayNames[activity.subtype];
  }
  // Use effective type (respects user override)
  const effectiveType = getEffectiveType(activity);
  return ActivityDisplayNames[effectiveType] || effectiveType;
}

// Check if activity has user override
export function hasUserOverride(activity: Activity): boolean {
  return activity.activityTypeOverride !== undefined &&
         activity.activityTypeOverride !== null;
}
```

---

## Part 9: Implementation Checklist

### Phase 1: Foundation (Schema)

- [ ] **Database migration (activities)**: Add new columns (activity_type_override, source_type, subtype, status, settlement_date, notes, metadata, source_system, source_record_id, source_group_id, idempotency_key, import_run_id, is_user_modified, needs_review)
- [ ] **Database migration (import_runs)**: Create import_runs table with indexes
- [ ] **Database migration (brokers_sync_state)**: Create sync state table with composite PK (account_id, provider)
- [ ] **Database migration (assets)**: Add kind, asset_class, asset_sub_class, quote_symbol, is_active, metadata columns
- [ ] **Database migration (platforms)**: Add kind, website_url, logo_url columns
- [ ] **Database migration (accounts)**: Add platform_id, provider, provider_account_id columns
- [ ] **Create indexes**: Unique on (source_system, idempotency_key), effective type, provider lookups, asset kind
- [ ] **Add CHECK constraint**: Enforce canonical activity_type values (closed set of 15)

### Phase 2: Foundation (Models)

- [ ] **Update Activity model**: New fields (source_type, is_user_modified, needs_review, etc.), `effective_type()` method, backward compatibility
- [ ] **Update Asset model**: Add AssetKind enum, kind field, is_holdable(), needs_pricing(), option_spec()
- [ ] **Create ImportRun model**: Enums, structs, summary types
- [ ] **Create BrokerSyncState model**: Checkpoint handling, typed checkpoint structs
- [ ] **Update Platform model**: Add PlatformKind enum
- [ ] **Update Account model**: Add platform_id, provider, provider_account_id
- [ ] **Create OptionSpec, ExposureWeight, ExposureSet**: Metadata helper structs
- [ ] **Idempotency module**: Implement `compute_idempotency_key()`
- [ ] **Compiler skeleton**: ActivityCompiler trait + DefaultActivityCompiler (passthrough)

### Phase 3: Provider Integration

- [ ] **Sync state lifecycle**: Create/update sync state per (account_id, provider)
- [ ] **Import run lifecycle**: Create/update/apply import runs
- [ ] **SnapTrade ingestor updates**: Map types → (activity_type, source_type, subtype), compute idempotency_key, set needs_review
- [ ] **Upsert logic**: Implement `upsert_by_idempotency_key()` with is_user_modified check
- [ ] **Preserve user overrides**: When is_user_modified=1, protect economics but update bookkeeping
- [ ] **Checkpoint management**: Store/retrieve checkpoint_json for incremental syncs
- [ ] **Link accounts to platforms**: Populate platform_id when syncing via SnapTrade
- [ ] **Set is_user_modified flag**: Trigger when user edits economic fields

### Phase 4: DRIP & Staking

- [ ] **DRIP compiler rule**: DIVIDEND/DRIP → [DIVIDEND, BUY]
- [ ] **Staking compiler rule**: INTEREST/STAKING_REWARD → [INTEREST, BUY]
- [ ] **Calculator integration**: Run compiler before snapshot processing
- [ ] **Tests**: Verify cash nets to ~0, positions increase, income tracked

### Phase 5: Options

- [ ] **Option subtypes**: OPTION_OPEN, OPTION_CLOSE, OPTION_EXPIRE, OPTION_ASSIGNMENT
- [ ] **Option metadata schema**: strike, expiry, multiplier, optionType, underlyingAssetId
- [ ] **Option compiler rules**: Pass through with cleared subtype
- [ ] **UI for options**: Display option metadata, legs

### Phase 6: Splits & Valuation

- [ ] **Split event tracking**: Store split activities with ratio metadata
- [ ] **Split adjuster**: compute_effective_quantity() at valuation time
- [ ] **Yahoo Close usage**: Ensure using Close not Adj Close

### Phase 7: Performance

- [ ] **Flow classifier**: External vs Internal flows
- [ ] **Scope handling**: Portfolio vs Account level performance
- [ ] **TWR verification**: Test with known scenarios

### Phase 8: Frontend

- [ ] **Update TypeScript types**: Activity, ActivitySubtype
- [ ] **Activity display**: Show subtype-aware names, effective type only
- [ ] **Override indicator**: Badge/icon when activity_type_override exists
- [ ] **needs_review indicator**: Visual cue for activities needing review
- [ ] **Import mapping**: Support subtype selection
- [ ] **Global review mode setting**: Add to app settings

### Phase 9: Liability Support

- [ ] **Liability subtypes**: LIABILITY_INTEREST_ACCRUAL, LIABILITY_PRINCIPAL_PAYMENT, INTEREST_CHARGE
- [ ] **Calculator handling**: Treat LIABILITY kind assets as negative value
- [ ] **Payment pairing**: Link interest expense + principal payment via source_group_id
- [ ] **UI for liabilities**: Display liability balances correctly (as debts)

---

## Appendix A: SnapTrade Type Mapping

| SnapTrade Type | activity_type | subtype | Notes |
|----------------|---------------|---------|-------|
| BUY | BUY | - | |
| SELL | SELL | - | |
| DIV | DIVIDEND | - | |
| REI | DIVIDEND | DRIP | Reinvestment |
| INT | INTEREST | - | |
| DEP, CONTRIBUTION | DEPOSIT | - | |
| WD, WITHDRAWAL, DISTRIBUTION | WITHDRAWAL | - | |
| FEE, FEES | FEE | - | |
| TAX | TAX | - | |
| SPLIT | SPLIT | - | |
| TRANSFER_IN, JOURNAL_IN | TRANSFER_IN | - | |
| TRANSFER_OUT, JOURNAL_OUT | TRANSFER_OUT | - | |
| OPT_BUY | BUY | OPTION_OPEN | Long option |
| OPT_SELL | SELL | OPTION_OPEN | Short option |
| OPT_ASSIGN | BUY or SELL | OPTION_ASSIGNMENT | Based on put/call |
| OPT_EXPIRE | REMOVE_HOLDING | OPTION_EXPIRE | |
| REFUND, FEE_REFUND | CREDIT | FEE_REFUND | Internal flow |
| REBATE, COMMISSION_REBATE | CREDIT | REBATE | Internal flow |
| TAX_REFUND, TAX_RECLAIM | CREDIT | TAX_REFUND | Internal flow |
| BONUS, PROMO, REFERRAL, SIGNUP | CREDIT | BONUS | **External flow** |
| ADJUSTMENT, ADJ, CREDIT | CREDIT | ADJUSTMENT | Internal flow |
| REVERSAL, REV | CREDIT | REVERSAL | Internal flow |
| *(unknown type)* | UNKNOWN | - | needs_review=1 |

---

## Appendix B: Metadata Schemas

### DRIP Metadata

```json
{
  "grossAmount": 100.00,
  "withholdingTax": 15.00,
  "residualCash": 0.25
}
```

### Staking Reward Metadata

```json
{
  "protocol": "solana",
  "validator": "validator-address",
  "epoch": 500,
  "fmvSource": "coingecko",
  "rewardType": "staking"
}
```

### Option Metadata

```json
{
  "optionType": "PUT",
  "strike": 150.00,
  "expiry": "2024-03-15",
  "multiplier": 100,
  "underlyingAssetId": "AAPL",
  "openClose": "OPEN",
  "direction": "SHORT"
}
```

### Split Metadata

```json
{
  "splitRatio": 4.0,
  "preSplitQuantity": 25,
  "postSplitQuantity": 100
}
```

### Liability Interest Accrual Metadata

```json
{
  "noCash": true,
  "interestRate": "0.065",
  "periodStart": "2025-01-01",
  "periodEnd": "2025-01-31"
}
```

### Liability Payment Metadata

```json
{
  "liabilityAssetId": "MORTGAGE-1",
  "paymentNumber": 24,
  "totalPayment": "2500.00",
  "interestPortion": "1200.00",
  "principalPortion": "1300.00"
}
```

### Withholding Tax (inline in Dividend)

```json
{
  "grossAmount": "100.00",
  "withholdingTax": "15.00",
  "withholdingRate": "0.15",
  "taxJurisdiction": "US"
}
```

### Corporate Action (Merger/Spinoff)

```json
{
  "actionType": "MERGER",
  "sourceAssetId": "OLD-TICKER",
  "conversionRatio": "0.5",
  "cashInLieu": "25.00",
  "effectiveDate": "2025-03-15"
}
```

---

## Appendix C: Migration Path for Existing Data

### Existing Activities

```sql
-- Set status based on is_draft
UPDATE activities SET status = CASE
    WHEN is_draft = 1 THEN 'DRAFT'
    ELSE 'POSTED'
END;

-- Copy activity_date to activity_date if using new column name
-- (or keep activity_date and add alias)

-- Set provider = 'MANUAL' for manually entered activities
UPDATE activities SET provider = 'MANUAL'
WHERE provider IS NULL AND external_provider_id IS NULL;

-- Copy existing provider fields
UPDATE activities SET
    provider = provider_type,
    provider_activity_id = external_provider_id
WHERE provider_type IS NOT NULL;
```

### Fingerprint Backfill

```sql
-- For existing manual activities, compute fingerprint from row data
-- This should be done via application code, not SQL
-- Run backfill job after migration
```

---

## Appendix D: Quick Reference - Behavioral Rules

### Calculator Inclusion Rules

| Status | Included in Calculations |
|--------|-------------------------|
| POSTED | Yes |
| PENDING | **No** |
| DRAFT | No |
| VOID | No |

| Activity Type | Included in Calculations |
|---------------|-------------------------|
| UNKNOWN | **No** (until user overrides) |
| All others | Yes (if status = POSTED) |

### Flow Classification (TWR)

| Activity Type | Subtype | Flow Type | Affects TWR |
|---------------|---------|-----------|-------------|
| DEPOSIT | * | External | Yes |
| WITHDRAWAL | * | External | Yes |
| CREDIT | BONUS | **External** | Yes |
| CREDIT | FEE_REFUND, TAX_REFUND, REBATE, REVERSAL, ADJUSTMENT | Internal | No |
| All others | * | Internal | No |

### Sync Update Rules

| Field Category | When is_user_modified=0 | When is_user_modified=1 |
|----------------|------------------------|-------------------------|
| Economic (type, asset, dates, amounts) | Updated | **Protected** |
| Bookkeeping (source_*, import_run_id) | Updated | Updated |
| User-controlled (override, notes) | Preserved | Preserved |

### Deduplication Priority

1. Match by `source_record_id` → Update existing
2. Match by `(source_system, idempotency_key)` → Deduplicate
3. No match → Insert new

### Compiler Output (Not Stored)

| Stored Type | Subtype | Compiled To |
|-------------|---------|-------------|
| DIVIDEND | DRIP | DIVIDEND + BUY |
| INTEREST | STAKING_REWARD | INTEREST + BUY |
| DIVIDEND | DIVIDEND_IN_KIND | DIVIDEND + ADD_HOLDING |
| BUY/SELL | OPTION_ASSIGNMENT | REMOVE_HOLDING + BUY/SELL |
| All others | * | Pass-through |

---

## Part 10: Design Decisions & Clarifications

This section documents key architectural decisions made during the design review process.

### 10.1 Compiler Architecture

#### Compiled Legs Are Internal Only
- **Decision**: Compiled legs (the output of the compiler) are purely internal implementation details
- **Rationale**: Users interact only with stored events; compiled legs are never exposed in the UI
- **Implication**: The activity detail drawer shows the stored event, not the compiled postings

#### No Stored Compiled Output
- **Decision**: The compiler runs at calculation time; compiled postings are never persisted
- **Rationale**: Simplifies the data model, avoids cache invalidation complexity
- **Recalculation**: Follows existing behavior - user can trigger recalculate, or migrations can clear calculated data

#### Compiler Caching
- **Decision**: Cache compiled output within a single calculation run; invalidate after
- **Rationale**: Balances performance (no redundant compilation within a run) with simplicity (no cross-run cache management)

### 10.2 Cash & Dividend Semantics

#### DIVIDEND as Income Recognition
- **Decision**: DIVIDEND alone increases cash balance in the calculator; no separate DEPOSIT needed
- **Rationale**: Calculator implicitly handles cash movement for dividends; keeps storage simple
- **Implementation**: When calculator sees DIVIDEND, it credits the account with the amount

#### Partial DRIP
- **Decision**: Two legs only (DIVIDEND + BUY); residual cash is implicit
- **Rationale**: The difference between dividend amount and buy cost is the residual; no third leg needed
- **Storage**: `metadata.residualCash` tracks the residual for reporting but doesn't generate a separate posting

#### Withholding Tax
- **Decision**: Store inline in metadata; net dividend amount in `amount` field
- **Rationale**: Keeps dividend as single activity; `metadata.withholdingTax` available for tax reporting
- **Example**: `amount = 85`, `metadata.withholdingTax = 15` for a $100 gross dividend

### 10.3 Cash Tracking

#### Derived Cash Balance
- **Decision**: No explicit cash assets; calculator derives cash balance from activity flows
- **Rationale**: Cash is computed as: deposits - withdrawals - buys + sells + dividends - fees - taxes
- **Implication**: No `$CASH-USD` asset needed in standard operation

### 10.4 User Overrides & Sync Protection

#### Override Persistence
- **Decision**: When sync updates an activity that has a user override, show `needs_review` flag but preserve the override
- **Rationale**: User explicitly disagreed with provider classification; don't silently revert
- **Workflow**: User sees review indicator, can clear override if source data changed meaningfully

#### is_user_modified Behavior
- **Decision**: When `is_user_modified = 1`, sync protects economic fields but still updates bookkeeping fields
- **Economic fields (protected)**: activity_type, subtype, asset_id, dates, quantity, unit_price, amount, fee, currency, status
- **Bookkeeping fields (always updated)**: source_type, source_record_id, source_group_id, import_run_id, metadata.source.*

### 10.5 Activity Status

#### PENDING Activities
- **Decision**: Exclude entirely from all calculations
- **Rationale**: PENDING is for activities awaiting settlement/confirmation; they shouldn't affect portfolio value until POSTED
- **UI**: PENDING activities appear in activity list but don't contribute to positions or cash

#### UNKNOWN Type Handling
- **Decision**: Exclude from calculations until user classifies
- **Rationale**: UNKNOWN means unmapped provider type; guessing would corrupt calculations
- **Workflow**: User sets `activity_type_override` to classify; activity then included in calculations

### 10.6 Deduplication & Corrections

#### Idempotency Key Strategy
- **Decision**: Match on `source_record_id` first; idempotency hash is fallback for dedup
- **Rationale**: When provider corrects a transaction (same reference ID, different amount), it should update not duplicate
- **Priority**:
  1. If `source_record_id` matches → update existing
  2. If `idempotency_key` matches → deduplicate

#### Manual Activity Deduplication
- **Decision**: Generate idempotency hash for manual activities
- **Rationale**: Prevents accidental duplicate entry; system warns user if duplicate detected on save
- **Implementation**: Compute hash from economic fields even when source_system = MANUAL

### 10.7 Transfer Handling

#### Transfer Pairing
- **Decision**: Link via `source_group_id`; no foreign key relationship
- **Rationale**: Soft reference allows querying pairs without complex FK constraints
- **Query**: Find counterpart via `SELECT * FROM activities WHERE source_group_id = ? AND id != ?`

### 10.8 Fee & Tax Storage

#### Inline Fees
- **Decision**: Use `fee` column on parent activity; separate FEE/TAX activities only for standalone charges
- **Rationale**: Most fees are part of a trade; separate activities add complexity without benefit
- **Example**: BUY with commission → `fee = 9.99` on the BUY activity

### 10.9 CREDIT Classification

#### External vs Internal Flow
- **Decision**:
  - `CREDIT` with `subtype=BONUS` → External flow (affects TWR, counts as contribution)
  - `CREDIT` with `subtype=FEE_REFUND|TAX_REFUND|REBATE|REVERSAL` → Internal flow
- **Rationale**: Sign-up/referral bonuses are external money; refunds/rebates are returning previously paid amounts
- **Implementation**: Flow classifier checks subtype when activity_type is CREDIT

### 10.10 Corporate Actions

#### Mergers/Spinoffs
- **Decision**: Paired activities (REMOVE_HOLDING old asset + ADD_HOLDING new asset) with same `source_group_id`
- **Rationale**: Explicit paired activities are clearer than overloading SPLIT
- **Basis**: `unit_price` on ADD_HOLDING carries cost basis from removed holding

#### Option Expiry
- **Decision**: Requires explicit REMOVE_HOLDING activity with `subtype=OPTION_EXPIRE`
- **Rationale**: Calculator doesn't auto-close based on expiry date; explicit activity provides audit trail
- **Sync/Manual**: Either provider sends expiry event or user creates manually

### 10.11 Asset Handling

#### Inactive Assets
- **Decision**: Keep positions on inactive asset with 'delisted' indicator
- **Rationale**: Preserves historical accuracy; user can see they held a delisted position
- **No auto-transfer**: Successor asset linkage is informational only

#### Cost Basis on Transfers
- **Decision**: Use `unit_price` field for cost basis
- **Rationale**: Reuses existing field; `amount = quantity * unit_price`
- **Example**: TRANSFER_IN of 100 shares with cost basis $50/share → `quantity=100`, `unit_price=50`, `amount=5000`

### 10.12 Decimal Precision

#### Storage Precision
- **Decision**: Preserve input precision exactly
- **Rationale**: Crypto needs 18+ decimals; securities rarely exceed 6; arbitrary precision handles all cases
- **Implementation**: Store as TEXT; use Decimal type in Rust with no rounding on storage

### 10.13 Sync Configuration

#### Sync Window Strategy
- **Decision**: User-triggered backfill; normal sync uses lookback window
- **Rationale**: Full historical resync is expensive; user initiates when needed
- **UI**: "Sync" button for incremental; "Full Refresh" option for complete resync

#### Sync Transactions
- **Decision**: All-or-nothing; entire sync batch is atomic
- **Rationale**: Partial commits create inconsistent state; better to fail cleanly
- **Implementation**: Wrap entire sync in transaction; rollback on any error

#### Review Mode
- **Decision**: Global setting (not per-account or per-provider)
- **Options**: NEVER (auto-apply), ALWAYS (review first), IF_WARNINGS (review only if issues)

### 10.14 Liability Handling

#### Interest Accrual (Debt Increases, No Cash Movement)
```
activity_type = ADD_HOLDING
asset_id = <liability asset id>
subtype = LIABILITY_INTEREST_ACCRUAL
amount = +interest_amount
metadata.noCash = true
```
- Increases liability balance without cash movement
- Calculator treats as making liability more negative

#### Interest Payment (Cash Decreases)
Two activities with same `source_group_id`:
1. **Interest expense leg**:
   - `activity_type = FEE`
   - `subtype = INTEREST_CHARGE`
   - `amount = +interest_paid`
   - `metadata.liabilityAssetId = <liability>`

2. **Principal reduction leg**:
   - `activity_type = REMOVE_HOLDING`
   - `subtype = LIABILITY_PRINCIPAL_PAYMENT`
   - `amount = +principal_paid`

### 10.15 UI Decisions

#### Type Display
- **Decision**: Show effective type only; original type visible in details/edit mode
- **Rationale**: Users care about what the activity IS, not what sync originally classified it as
- **Override indicator**: Small badge or icon when override exists; click reveals original

#### Export Format
- **Decision**: Export raw stored activities only
- **Rationale**: Users expect to see what they entered/imported; compiled legs are internal
- **DRIP in export**: Single row with activity_type=DIVIDEND, subtype=DRIP

### 10.16 Review Workflow

#### needs_review Flag
- **Decision**: Simple flag clear (no audit trail)
- **Rationale**: Review is about classification, not accountability; simpler implementation
- **Clearing**: User reviews activity, makes any needed changes, system clears flag

### 10.17 Ambiguous Provider Types

#### Mapping Strategy
- **Decision**: Unknown provider types always map to UNKNOWN with `needs_review=1`
- **Rationale**: Never guess; wrong classification corrupts calculations
- **Raw preservation**: Original provider type stored in `source_type` for reference

---

*Document Version: 2.8*
*Architecture: Store Events, Calculate from Postings*
*Last Updated: 2025-12-31*
