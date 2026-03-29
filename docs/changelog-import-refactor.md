# Import Refactor: Event-Driven Validation & Asset Resolution

**Branch:** `refactor/import-event-driven-validation` **Scope:** 107 files
changed, ~9,200 insertions, ~2,600 deletions

---

## What's New

The CSV import experience has been redesigned to be more reliable, faster, and
easier to use. Here's what changed:

**Smarter asset matching.** Before importing, Wealthfolio now shows you exactly
how each ticker in your CSV will be matched to an asset in your portfolio. If
something looks off — a symbol that could belong to multiple exchanges, or a
delisted stock — you can fix it right there with a search, instead of finding
out after the import that something went wrong.

**Saved templates.** If you import from the same broker regularly, Wealthfolio
remembers your column mapping. Pick your broker from the list, and the columns
map themselves. You can also save your own custom templates and link them to
specific accounts so the right one loads automatically.

**ISIN support.** CSVs from brokers like Trading 212 include ISIN codes (the
international security identifier). Wealthfolio now reads these and uses them to
match assets precisely — no more guessing which exchange a ticker belongs to.

**Better handling of special transactions.** Dividend reinvestments (DRIP),
dividends paid in shares, and staking rewards are now recognized during import
and matched to the correct asset automatically.

**Skip rows you don't need.** See a transaction you don't want to import? Mark
it as skipped. It stays visible in the review grid but won't be imported.

**Faster imports.** Asset lookups now run in parallel instead of one at a time.
Large CSVs with many different tickers resolve noticeably faster.

**Automatic encoding detection.** CSVs exported from Windows programs in
non-standard encodings (like Windows-1252) are detected and handled
automatically. No more garbled characters in transaction descriptions.

**Duplicate protection.** If you accidentally import the same CSV twice,
Wealthfolio detects the overlap and skips transactions that already exist.
You'll see exactly how many were skipped and why.

---

## Detailed Technical Changes

## New Features

### Asset Review Step

- New wizard step between Mapping and Review that previews how each symbol will
  resolve (existing asset, auto-resolved new asset, or needs manual fixing).
- Inline search lets users resolve ambiguous symbols by ticker, name, or ISIN
  without leaving the wizard.
- "Mark as custom asset" flow for delisted or non-standard instruments.
- Assets are created on import confirmation — no orphaned assets if the user
  cancels.

### ISIN-Based Resolution

- New `ISIN` column mapping. When present, the backend uses ISIN for unambiguous
  exchange resolution before falling back to ticker search.
- `looksLikeIsin()` heuristic auto-detects ISIN columns during header mapping.
- ISIN is forwarded through the asset preview path so Trading 212 and similar
  ISIN-rich CSVs resolve automatically.

### Import Templates

- Replaces the old `activity_import_profiles` table with `import_templates` +
  `import_account_templates` (many-to-many).
- Templates are scoped (`SYSTEM` / `USER`) and kinded (`CSV_ACTIVITY` /
  `CSV_HOLDING` / `BROKER_ACTIVITY`).
- Grouped template picker in the upload step: system templates, user templates,
  recently used.
- Templates can be linked to accounts so the correct mapping loads
  automatically.
- Broker sync profiles are stored as templates with `kind = BROKER_ACTIVITY`.

### Fallback Columns & Sign Inference

- `FieldMappingValue` supports `fallback` — a secondary column to try when the
  primary is empty (e.g., `Symbol` falling back to `ISIN`).
- Sign inference for `quantity` and `amount`: negative values auto-flip to SELL
  / WITHDRAWAL when the mapped type is ambiguous.

### Subtype Support

- DRIP, Dividend-in-Kind, and Staking Reward subtypes flow through the entire
  import pipeline: mapping → draft → validation → asset resolution → import.
- Subtype-aware `needsImportAssetResolution()` ensures asset-backed income rows
  go through symbol resolution even when the activity type alone wouldn't
  require it.

### Skip Activities

- Users can mark individual rows as "skipped" in the review step.
- Skipped rows are excluded from validation and import but remain visible in the
  grid with a visual indicator.

### CSV Encoding Detection

- Non-UTF-8 CSVs (Windows-1252, ISO-8859-1) are detected and transcoded
  automatically on file load.

---

## Refactoring

### Event-Driven Validation

- Validation is now triggered by explicit user actions (advancing steps,
  clicking "Revalidate") rather than running implicitly on every draft change.
- `validationRunRef` / `previewRunRef` pattern prevents stale async responses
  from overwriting current state. Back navigation increments both refs to cancel
  in-flight requests.
- `draftRevision` / `lastValidatedRevision` tracking lets the UI know when
  drafts have changed since the last validation without re-running validation
  eagerly.

### Import Context Overhaul

- Reducer actions are explicit and typed (`SET_DRAFT_ACTIVITIES`,
  `SET_VALIDATED_DRAFT_ACTIVITIES`, `UPDATE_DRAFT`, `BULK_UPDATE_DRAFTS`, etc.).
- Asset preview state (`assetPreviewItems`, `pendingImportAssets`) lives in
  context alongside draft state.
- `updatesAffectAssetPreview()` clears preview state when asset-relevant fields
  change.

### Backend: `check_activities_import` / `import_activities` Split

- `check_activities_import` is now purely validation — resolves symbols, detects
  duplicates via idempotency keys, returns enriched `ActivityImport` objects
  with errors/warnings.
- `import_activities` does a lightweight pre-insert validation, then converts
  and bulk-inserts. Duplicate detection uses `ON CONFLICT DO NOTHING` on
  idempotency keys.
- `preview_import_assets` is a new endpoint that runs `check_activities_import`
  on synthetic activities to preview asset resolution without side effects.

### Symbol Resolution Pipeline

- `resolve_symbols_batch` does concurrent resolution with
  `buffer_unordered(10)`.
- ISIN-first lookup: checks existing assets by ISIN (zero network), then falls
  back to provider search by ISIN, then ticker search.
- Currency-aware resolution: `(symbol, currency)` pairs drive exchange suffix
  selection (e.g., `.TO` for CAD).
- OpenFIGI fallback is non-blocking — failures log a warning but don't fail the
  row.
- `quoteCcy` is included in the asset candidate key so
  same-symbol/different-currency rows resolve independently.

### Migration: `activity_import_profiles` → `import_templates`

- `2026-03-19-000001_import_templates/up.sql` renames the table, adds `scope`,
  `kind`, `source_system`, `config_version` columns, creates the
  `import_account_templates` join table, and migrates existing data.
- `down.sql` reverses the migration.
- `sync_table_state` entries are updated for device sync compatibility.

### IPC Alignment

- Tauri commands renamed `import_type` → `context_kind` to match the frontend
  adapter's `contextKind` parameter naming.
- Web server (Axum) removed `alias = "importType"` fallback — all clients now
  use `contextKind` exclusively.

---

## Performance

- Symbol resolution concurrency bumped from sequential to
  `buffer_unordered(10)`.
- Yahoo rate limit relaxed: burst 10, 2,000 req/min (was burst 5, 500 req/min).
- Candidate deduplication in the preview path avoids redundant resolution for
  rows sharing the same
  `(symbol, instrumentType, quoteMode, exchangeMic, quoteCcy)` key.

---

## Bug Fixes

- **Broker quote cleanup**: migration guards against deleting non-BROKER quotes
  during income quote cleanup.
- **Custom assets without exchange MIC**: resolution no longer fails for
  delisted or OTC instruments (e.g., TWTR).
- **Primary exchange suffix**: tries primary exchange suffix for all non-USD
  currencies, not just a hardcoded list.
- **Template auto-switch**: changing the account in the upload step reloads the
  linked template automatically.
- **Stale async responses**: `previewRunRef` + `validationRunRef` prevent race
  conditions when navigating between steps while async work is in flight.
- **DataGrid re-render**: `DataGridRow` memo comparison fix prevents unnecessary
  re-renders in large grids.
- **Popover close on action**: popovers now close when an action is triggered
  from within them.

---

## Exchange Data

- Added Aquis Exchange (XAQE) to the exchange registry with 74 exchange entries
  in `exchanges.json`.

---

## Test Changes

- 453 frontend tests passing (35 test files).
- Core crate tests passing (12 unit + doc tests).
- E2E specs `04-csv-import` and `07-asset-creation` updated for new wizard step
  names and flow.
- New test files: `import-asset-rules.test.ts`, `activity-utils.test.ts`.
