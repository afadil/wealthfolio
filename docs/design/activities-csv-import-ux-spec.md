# Activities CSV Import v2 — Implementation Spec

## Summary of Decisions

| Decision | Choice |
|----------|--------|
| Parsing location | Rust backend (`csv` crate) |
| Staging storage | In-memory only (no resume) |
| Wizard steps | 5 steps (Upload+Parse → Mapping → Review → Confirm → Result) |
| Grid editing | Edit/skip only, no adding rows |
| Multi-kind files | Unified mapping, list unmapped types simply |
| Unresolved symbols | Block import until resolved/skipped |
| Mapping direction | CSV → Wealthfolio (source-driven) |
| Mapping profiles | Essential, extend existing with parse settings |
| Parse settings UX | Auto-detect, manual override on errors |
| Validation side effects | Make check read-only until commit |
| Grid component | Dedicated import-review grid, shared base components |
| Bulk operations | Toolbar + context menu |
| Duplicate display | Flag only (badge), click to view |
| Duplicate re-validation | Before commit only |
| Activity types | Full set (Buy, Sell, Dividend, Deposit, Withdrawal, Fee, Tax, Transfer, Interest, Split, etc.) |
| Multi-account | Yes, with account column mapping |
| Import tracking | Summary + import_run_id on activities (existing pattern) |
| Rollback | No undo feature |
| Frontend state | React Context + reducer, URL sync (step), React Query for server |
| Wizard container | Full page (current route) |
| Profile scope | Account-specific (existing behavior) |
| Value remapping | Included in profile |
| Error display | Cell-level highlighting + tooltip |
| Parse preview | Live preview update |
| Post-import | Summary page |
| Split handling | Existing SPLIT activity type |
| Transfer linking | Auto-link if obvious match |
| Mapping organization | Single step, 3 sections (Columns, Activity Types, Symbols) |
| Step navigation | Linear only |
| Profile mismatch | Warn, apply partial |
| Route | Keep `/import?account=X` |
| Cancel | Warn always |
| MVP scope | Full v1 replacement |
| Migration | Replace immediately |
| Broker presets | Later phase |
| Template CSV | Yes, prominent download |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  ImportContext (reducer)                                        │
│  ├── step: upload | mapping | review | confirm | result         │
│  ├── file: File                                                 │
│  ├── parseConfig: ParseConfig                                   │
│  ├── parsedRows: ParsedRow[]                                    │
│  ├── mapping: ImportMappingData                                 │
│  ├── draftActivities: DraftActivity[]                           │
│  ├── validationResult: ValidationResult                         │
│  └── importResult: ImportResult                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Rust)                           │
├─────────────────────────────────────────────────────────────────┤
│  parse_csv(file, config) → ParsedCsvResult                      │
│  validate_activities_dry_run(drafts) → ValidationResult         │
│  check_existing_duplicates(keys) → DuplicateResult              │
│  import_activities(activities) → ImportResult                   │
│  get/save_account_import_mapping(accountId, mapping)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step Flow (5 Steps)

### Step 1: Upload & Parse Settings
**UI Components:**
- File dropzone (drag/drop + click)
- Raw CSV preview (first 50 rows, syntax highlighted)
- Parse settings panel (collapsed by default, expand on errors):
  - Auto-detected values shown as defaults
  - Date format selector
  - Decimal/thousands separator
  - Rows to skip (top/bottom)
  - Encoding selector
- "Download sample CSV" link
- Validation: file must parse without critical errors

**Backend Call:**
- `parse_csv(file_bytes, parse_config) → ParsedCsvResult`
  - Returns: headers, rows (as string arrays), detected_config, parse_errors

**Navigation:**
- Next: enabled when file parses successfully
- Back: disabled (first step)

### Step 2: Mapping (3 Sections)
**UI Components:**
- Section tabs/accordion: Columns | Activity Types | Symbols
- **Columns Section:**
  - Source-driven: list CSV columns, dropdown to select target field
  - Required fields highlighted (date, symbol, activity_type, quantity/amount)
  - Show sample values from CSV next to each mapping
  - Unmapped columns shown in gray
- **Activity Types Section:**
  - List unique activity type values from CSV
  - Each maps to Wealthfolio type (dropdown)
  - Smart defaults: "BUY"→Buy, "SELL"→Sell, etc.
- **Symbols Section:**
  - List unique symbols from CSV
  - Each needs resolution: search existing assets or "Create Custom Asset"
  - Unresolved symbols block progress (unless marked to skip)
- Load/save profile selector (account-specific)
- Profile includes: field_mappings, activity_mappings, symbol_mappings, parse_config

**Backend Calls:**
- `get_account_import_mapping(accountId)` — load saved profile
- `save_account_import_mapping(mapping)` — save profile
- `search_assets(query)` — for symbol resolution search

**Validation:**
- All required fields mapped
- All activity type values mapped
- All symbols resolved or rows marked to skip

### Step 3: Review & Edit
**UI Components:**
- Dedicated import review DataGrid (based on shared grid components)
- Columns: row#, status icon, all mapped activity fields
- Row states: Valid (✓), Warning (⚠), Error (✗), Skipped (—), Duplicate (🔄)
- Features:
  - Inline cell editing with validation
  - Multi-row selection (Shift+click, Ctrl+click)
  - Toolbar: "Skip Selected", "Unskip", "Set Currency", "Set Account"
  - Context menu on right-click: same actions
  - Column filtering
  - Filter buttons: All | Errors | Warnings | Duplicates | Skipped
- Cell-level validation highlighting (red border + tooltip)
- Duplicate rows: badge "Already exists", click to view existing

**Backend Calls:**
- `validate_activities_dry_run(drafts)` — validate without side effects
- `check_existing_duplicates(idempotency_keys)` — check against DB

**Validation:**
- No rows with errors (or all error rows skipped)
- At least one row to import

### Step 4: Confirm
**UI Components:**
- Summary panel:
  - Total rows: X
  - To import: Y (breakdown by type)
  - Skipped: Z (breakdown by reason)
  - Duplicates (will skip): N
  - Warnings: W
- Final review table (collapsed, expandable)
- "Import" button (primary CTA)
- Account selector (if multi-account enabled)

**Backend Call:**
- `import_activities(activities, import_run_metadata)` — creates activities + import_run

### Step 5: Result
**UI Components:**
- Success/failure banner
- Import statistics:
  - Imported: X activities
  - Skipped: Y
  - Errors: Z (if any)
- Links: "View Activities", "Import Another File"
- Import run reference for audit

---

## Data Models

### ParseConfig (extend existing or new)
```typescript
interface ParseConfig {
  hasHeaderRow: boolean;
  headerRowIndex: number;
  delimiter: string; // ",", ";", "\t", "auto"
  quoteChar: string;
  escapeChar: string;
  encoding: string;
  skipTopRows: number;
  skipBottomRows: number;
  skipEmptyRows: boolean;
  dateFormat: string; // "auto" | "YYYY-MM-DD" | "DD/MM/YYYY" | etc.
  decimalSeparator: string; // "auto" | "." | ","
  thousandsSeparator: string; // "auto" | "," | "." | " " | "none"
  defaultCurrency: string;
}
```

### ImportMappingData (extend existing)
```rust
pub struct ImportMappingData {
    pub account_id: String,
    pub field_mappings: HashMap<String, String>,      // target_field → csv_column
    pub activity_mappings: HashMap<String, Vec<String>>, // wf_type → [csv_values]
    pub symbol_mappings: HashMap<String, String>,     // csv_symbol → asset_id
    pub account_mappings: HashMap<String, String>,    // csv_account → account_id
    // NEW:
    pub parse_config: Option<ParseConfig>,            // saved parse settings
}
```

### DraftActivity (frontend)
```typescript
interface DraftActivity {
  rowIndex: number;
  rawRow: string[];

  // Normalized fields
  activityDate: string;
  activityType: string;
  symbol?: string;
  assetId?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency: string;
  fee?: number;
  accountId: string;
  comment?: string;
  subtype?: string;
  fxRate?: number;

  // Validation state
  status: 'valid' | 'warning' | 'error' | 'skipped' | 'duplicate';
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  skipReason?: string;
  duplicateOfId?: string;
  isEdited: boolean;
}
```

### ValidationResult
```typescript
interface ValidationResult {
  isValid: boolean;
  rows: {
    rowIndex: number;
    status: 'valid' | 'warning' | 'error';
    errors: Record<string, string[]>;
    warnings: Record<string, string[]>;
    idempotencyKey?: string;
  }[];
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
  };
}
```

---

## API Surface

### Existing (keep, modify as noted)
| Endpoint | Purpose | Changes for v2 |
|----------|---------|----------------|
| `get_account_import_mapping` | Load saved mapping | Add parse_config to response |
| `save_account_import_mapping` | Save mapping | Accept parse_config |
| `check_activities_import` | Validate activities | Make read-only (no side effects) |
| `import_activities` | Commit import | Create import_run, set import_run_id on activities |

### New
| Endpoint | Purpose | Input | Output |
|----------|---------|-------|--------|
| `parse_csv` | Parse CSV file | file_bytes, ParseConfig | ParsedCsvResult |
| `check_existing_duplicates` | Find duplicates | idempotency_keys[] | {key: activity_id}[] |
| `search_assets` | Symbol search | query, limit | Asset[] |

### ParsedCsvResult
```rust
pub struct ParsedCsvResult {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub detected_config: ParseConfig,
    pub errors: Vec<ParseError>,
    pub row_count: usize,
}
```

---

## Frontend File Structure

```
src-front/pages/activity/import/
├── activity-import-page.tsx          # Main wizard container
├── context/
│   ├── import-context.tsx            # React Context + reducer
│   └── import-actions.ts             # Action creators
├── steps/
│   ├── upload-step.tsx               # Step 1: File + parse settings
│   ├── mapping-step.tsx              # Step 2: Column/type/symbol mapping
│   ├── review-step.tsx               # Step 3: DataGrid review
│   ├── confirm-step.tsx              # Step 4: Summary + commit
│   └── result-step.tsx               # Step 5: Result display
├── components/
│   ├── file-dropzone.tsx             # Drag/drop file input
│   ├── csv-preview.tsx               # Raw CSV viewer
│   ├── parse-settings-panel.tsx      # Parse config controls
│   ├── column-mapping-section.tsx    # Column mapping UI
│   ├── activity-type-mapping.tsx     # Activity type remapping
│   ├── symbol-resolution-section.tsx # Symbol search/create
│   ├── import-review-grid.tsx        # Dedicated review DataGrid
│   ├── import-toolbar.tsx            # Bulk action toolbar
│   └── import-summary.tsx            # Stats display
├── hooks/
│   ├── use-import-wizard.ts          # Wizard navigation logic
│   ├── use-csv-parse.ts              # CSV parsing (calls backend)
│   ├── use-import-mapping.ts         # Mapping CRUD
│   └── use-import-validation.ts      # Validation logic
└── utils/
    ├── mapping-utils.ts              # Mapping helpers
    └── draft-utils.ts                # Draft activity transforms
```

---

## Backend File Structure

```
crates/core/src/activities/
├── mod.rs
├── activities_service.rs             # Add parse_csv, check_duplicates
├── activities_model.rs               # Extend ImportMappingData
├── csv_parser.rs                     # NEW: CSV parsing logic
├── idempotency.rs                    # Existing: compute_idempotency_key
└── import_validation.rs              # NEW: Dry-run validation

crates/storage-sqlite/src/
├── activities_repo.rs                # Add duplicate check query
└── import_mapping_repo.rs            # Update for parse_config
```

---

## Implementation Tasks

### Phase 1: Backend Foundation
1. **Create csv_parser.rs** — Rust CSV parsing with configurable options
   - Use `csv` crate with custom config
   - Auto-detect delimiter, encoding
   - Return structured ParsedCsvResult

2. **Add parse_csv command** — Tauri + web endpoint
   - Accept file bytes + ParseConfig
   - Return headers, rows, detected config

3. **Extend ImportMappingData** — Add parse_config field
   - Update DB schema (JSON field for parse_config)
   - Update get/save mapping endpoints

4. **Make check_activities_import read-only**
   - Extract side effects (asset creation, FX registration)
   - New dry_run parameter or separate endpoint

5. **Add check_existing_duplicates endpoint**
   - Accept idempotency keys
   - Query activities table by key
   - Return matches

### Phase 2: Frontend Foundation
6. **Create ImportContext** — Wizard state management
   - Reducer with actions for each step
   - URL sync for step navigation

7. **Build UploadStep** — File upload + parse settings
   - File dropzone with drag/drop
   - Parse settings panel (collapsed default)
   - Live preview with error highlighting

8. **Build MappingStep** — 3-section mapping UI
   - Column mapping (source-driven)
   - Activity type value mapping
   - Symbol resolution with search

### Phase 3: Review Grid
9. **Build ImportReviewGrid** — Dedicated review DataGrid
   - Based on shared DataGrid components
   - Row states (valid/warning/error/skipped/duplicate)
   - Cell-level validation display

10. **Add bulk operations** — Toolbar + context menu
    - Multi-select with shift/ctrl
    - Skip/unskip, set currency, set account

11. **Add filtering** — Grid filters
    - All / Errors / Warnings / Duplicates / Skipped

### Phase 4: Commit & Result
12. **Build ConfirmStep** — Summary + commit
    - Import statistics
    - Final commit button

13. **Build ResultStep** — Post-import display
    - Success/failure banner
    - Statistics
    - Navigation links

14. **Update import_activities** — import_run integration
    - Create import_run on commit
    - Set import_run_id on created activities

### Phase 5: Polish
15. **Add sample CSV download** — Template file
16. **Add cancel confirmation** — Warn on exit
17. **Transfer auto-linking** — Match paired transfers
18. **Profile mismatch handling** — Warn + partial apply
19. **Error UX** — Parse error explanations, suggestions

---

## Supported Activity Fields (CSV Columns)

### Required (one must be mapped)
- `date` / `activity_date` — Activity date
- `activity_type` / `type` — Activity type (BUY, SELL, etc.)
- `symbol` / `ticker` — Asset identifier

### Required per type
- **Trades (BUY/SELL):** quantity, unit_price OR amount
- **Dividends:** amount OR (quantity × unit_price)
- **Deposits/Withdrawals:** amount
- **Fees/Tax:** amount
- **Transfers:** quantity
- **Splits:** quantity (new shares)

### Optional
- `currency` — Defaults to account/user currency
- `fee` — Transaction fee
- `comment` / `description` — Notes
- `account` — For multi-account files
- `subtype` — Activity subtype (DRIP, STOCK_DIVIDEND, etc.)
- `fx_rate` — Foreign exchange rate
- `amount` — Total amount (alternative to qty × price)
- `unit_price` / `price` — Price per unit

---

## Sample CSV Format

```csv
date,type,symbol,quantity,unit_price,currency,fee,comment
2024-01-15,BUY,AAPL,10,185.50,USD,4.95,Initial position
2024-01-20,BUY,MSFT,5,380.00,USD,4.95,
2024-02-01,DIVIDEND,AAPL,,,USD,,Q4 dividend
2024-02-15,SELL,AAPL,5,190.25,USD,4.95,Partial sale
2024-03-01,DEPOSIT,,,5000,USD,,Monthly contribution
2024-03-15,FEE,,,25,USD,,Advisory fee
```

---

## Open Items (Resolved)

| Question | Resolution |
|----------|------------|
| Cash-only rows without symbol? | Supported for DEPOSIT, WITHDRAWAL, FEE, TAX, INTEREST |
| Multi-account imports? | Yes, with account column mapping |
| Required fields per kind? | Defined in "Required per type" section |

---

## Migration Notes

- v2 replaces v1 immediately (no parallel operation)
- Existing saved mappings will work (parse_config is optional/nullable)
- No data migration needed (activities table unchanged)
- Import_run table already exists from sync feature
