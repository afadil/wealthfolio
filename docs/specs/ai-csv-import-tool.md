# AI CSV Import Tool Spec

## Overview
AI tool enabling conversational CSV import for activities. User attaches CSV, AI analyzes/cleans/maps, displays in ActivityDataGrid for editing, user saves batch.

## Target Architecture (SOTA)
This spec is updated to a plan-based architecture where the LLM proposes a
mapping/cleaning plan and deterministic code executes it. The model never
transforms full rows or saves data directly.

Reference: `docs/specs/ai-csv-import-target.md`

## User Flow
1. User attaches CSV via composer attachment button
2. Sends message like "Import this CSV" or "Help me import these trades"
3. App parses CSV locally and computes stats + samples
4. AI proposes an Import Plan (schema-enforced)
5. Backend applies plan deterministically to full data
6. Tool UI renders ActivityDataGrid with parsed data (draft state)
5. User can:
   - Edit cells directly in grid
   - Ask AI to refine mappings: "Map column X to date", "Fix the symbols"
   - Manually fix validation errors
7. **User clicks Save** to bulk-create activities (AI never auto-saves)

> **Important**: AI only parses/suggests. User has full control over edits and submission. Similar to `record_activity` tool pattern.

## Architecture

### Frontend

**Attachment Handling**
- Configure `AttachmentAdapter` in `use-chat-runtime.ts`:
  ```ts
  adapters: {
    attachments: {
      accept: ".csv,text/csv",
      add: async ({ file }) => ({
        id: crypto.randomUUID(),
        type: "document",
        name: file.name,
        contentType: "text/csv",
        file,
        status: { type: "requires-action", reason: "composer-send" }
      }),
      remove: async () => {},
      send: async (attachment) => {
        const text = await attachment.file.text();
        return {
          ...attachment,
          status: { type: "complete" },
          content: [{ type: "text", text }] // CSV content as text
        };
      }
    }
  }
  ```

**Tool UI: `import-csv-tool-ui.tsx`**
- Uses `makeAssistantToolUI<ImportCsvArgs, ImportCsvOutput>`
- Renders embedded `ActivityDataGrid` with parsed LocalTransactions
- Shows mapping summary, validation errors, row counts
- **User-controlled Save button** triggers bulk create via existing `saveActivitiesMutation`
- On save success: calls `updateToolResult()` to persist submission state (same pattern as `record_activity`)
- States: Loading → Draft (editable grid) → Submitted (success summary)

**CSV Parsing + Stats (local)**
- Parse CSV locally (robust parser) and compute:
  - Headers + delimiter
  - Per-column type guesses (date/number/text)
  - Sample values + unique counts
  - Min/max for numerics, regex hints for symbols

**Manual Import Reuse**
- `validateActivityImport` and helpers:
  - `normalizeNumericValue`, `parseAndAbsoluteValue`
  - `calculateCashActivityAmount`
  - `validateTickerSymbol`
- Mapping data + constants:
  - `ImportFormat`, `ImportMappingData`, `IMPORT_REQUIRED_FIELDS`
- UI components:
  - `CsvMappingEditor`, `ImportPreviewTable`, `ImportAlert`
- Import mutations:
  - `useActivityImportMutations`

### Backend (Rust)

**Tools (target)**
- `analyze_csv` (local stats, no LLM)
- `propose_import_plan` (LLM, schema-only)
- `apply_import_plan` (deterministic, full data)

**Import Plan (LLM Output)**
See schema in `Import Plan JSON Schema` section below.

**Existing Tool (v0): `crates/ai/src/tools/import_csv.rs`**

```rust
pub struct ImportCsvTool<E: AiEnvironment> { env: Arc<E> }

#[derive(Deserialize)]
pub struct ImportCsvArgs {
    csv_content: String,           // Raw CSV text from attachment
    account_id: Option<String>,    // Target account (optional)
    mappings: Option<ColumnMappings>, // User-provided mappings (optional)
}

#[derive(Serialize)]
pub struct ImportCsvOutput {
    activities: Vec<ActivityDraft>,      // Parsed rows as activity drafts
    suggested_mappings: ColumnMappings,  // AI-detected column mappings
    cleaning_actions: Vec<CleaningAction>, // What was auto-fixed
    validation: ValidationSummary,       // Errors/warnings
    available_accounts: Vec<AccountOption>,
}
```

**Cleaning Logic (target)**
1. Robust CSV parse (quoted newlines, delimiter detection).
2. Header detection and normalization.
3. Apply Import Plan transforms (dates, numbers, uppercase, etc).
4. Activity type normalization via `enumMaps`.
5. Deterministic validation using `importActivitySchema`.

**Mapping Inference**
- Column name matching: date/Date/DATE → activityDate
- Pattern detection: "$123.45" → amount field
- Symbol validation: uppercase letters → symbol field
- Known brokers: detect common export formats (Fidelity, Schwab, IBKR)

### Target Data Flow

```
[User] → attach CSV → [Local Parser + Stats]
  ↓
[LLM] → Import Plan (schema enforced)
  ↓
[apply_import_plan] → parse + transform + validate (deterministic)
  ↓
[Tool UI] → Preview + edit + confirm
  ↓
[User clicks Save] → importActivities/saveActivities
```

**Key principle**: AI is read-only assistant. User owns the Save action.

### Multi-turn Mapping Refinement

If user says "column 3 should be the date", AI calls import_csv again with updated mappings:
```rust
ImportCsvArgs {
    csv_content: "...", // Same content
    mappings: Some(ColumnMappings {
        date: Some(2), // 0-indexed column 3
        ..prev_mappings
    })
}
```

Tool re-parses with new mappings, returns updated activities.

## Types

```typescript
// Frontend types (add to types.ts)
interface ColumnMappings {
  date?: number;        // Column index
  symbol?: number;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  type?: number;        // Activity type column
  account?: number;
  currency?: number;
  notes?: number;
}

interface CleaningAction {
  type: "skip_rows" | "normalize_dates" | "normalize_numbers" | "map_types";
  details: string;
  affectedRows?: number[];
}

interface ValidationSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  errors: RowError[];
}

interface RowError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ActivityDraft {
  // Mirrors LocalTransaction from activity-data-grid
  tempId: string;
  isNew: true;
  accountId?: string;
  activityType?: string;
  activityDate?: string;
  symbol?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  currency?: string;
  comment?: string;
  // Validation state
  validationStatus: "valid" | "warning" | "error";
  validationErrors?: string[];
}
```

## Import Plan JSON Schema

The model must return this exact shape. Non-conforming output is rejected.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "columnMappings": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "date": { "type": ["integer", "null"], "minimum": 0 },
        "activityType": { "type": ["integer", "null"], "minimum": 0 },
        "symbol": { "type": ["integer", "null"], "minimum": 0 },
        "quantity": { "type": ["integer", "null"], "minimum": 0 },
        "unitPrice": { "type": ["integer", "null"], "minimum": 0 },
        "amount": { "type": ["integer", "null"], "minimum": 0 },
        "fee": { "type": ["integer", "null"], "minimum": 0 },
        "currency": { "type": ["integer", "null"], "minimum": 0 },
        "account": { "type": ["integer", "null"], "minimum": 0 },
        "comment": { "type": ["integer", "null"], "minimum": 0 }
      },
      "required": [
        "date",
        "activityType",
        "symbol",
        "quantity",
        "unitPrice",
        "amount",
        "fee",
        "currency",
        "account",
        "comment"
      ]
    },
    "transforms": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "field": {
            "type": "string",
            "enum": [
              "date",
              "activityType",
              "symbol",
              "quantity",
              "unitPrice",
              "amount",
              "fee",
              "currency",
              "account",
              "comment"
            ]
          },
          "op": {
            "type": "string",
            "enum": [
              "trim",
              "uppercase",
              "parse_date",
              "parse_number",
              "parse_number_abs",
              "strip_currency",
              "coalesce"
            ]
          },
          "formatHints": { "type": "array", "items": { "type": "string" } },
          "inputs": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
        },
        "required": ["field", "op"]
      }
    },
    "enumMaps": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "activityType": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      }
    },
    "signRules": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "field": {
            "type": "string",
            "enum": ["amount", "quantity", "unitPrice", "fee"]
          },
          "rule": {
            "type": "string",
            "enum": ["negative_is_sell", "negative_is_withdrawal", "always_abs"]
          }
        },
        "required": ["field", "rule"]
      }
    },
    "confidence": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "overall": { "type": "number", "minimum": 0, "maximum": 1 },
        "byField": {
          "type": "object",
          "additionalProperties": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      },
      "required": ["overall"]
    },
    "notes": { "type": "array", "items": { "type": "string" } },
    "abstain": { "type": "boolean" }
  },
  "required": ["columnMappings", "transforms", "enumMaps", "confidence", "abstain"]
}
```

## Refactor Plan (Manual + AI Shared)

1. Extract parsing + normalization logic into a shared module:
   - Move core functions from `src-front/pages/activity/import/utils/validation-utils.ts`
   - Keep public API stable (`validateActivityImport` signature)
2. Extract mapping types/constants into a shared import module:
   - Reuse `ImportFormat`, `ImportMappingData`, `IMPORT_REQUIRED_FIELDS`
3. Make AI import call the shared validator so output matches manual import.
4. Keep UI components shared (mapping editor + preview table).

## Implementation Plan (Updated)

### Phase 1: Analyze + Plan
1. Parse CSV locally with robust parser and compute stats + samples.
2. Call LLM with stats/samples to propose Import Plan (schema enforced).
3. Persist the plan in thread/tool state for refinement.

### Phase 2: Deterministic Apply
1. Apply plan to full CSV content (backend).
2. Reuse manual import validation for consistency.
3. Return drafts + row errors + summary.

### Phase 3: Preview + Edit
1. Render preview (reuse manual import preview UI).
2. Enable mapping edits (reuse mapping editor).
3. Allow AI to refine plan (multi-turn).

### Phase 4: Persist + Evaluate
1. Save mapping plan per account/broker.
2. Add evaluation fixtures for common broker exports.
3. Track accuracy improvements over time.

## Files to Create/Modify

**Create:**
- `crates/ai/src/tools/import_csv.rs`
- `src-front/features/ai-assistant/components/tool-uis/import-csv-tool-ui.tsx`

**Modify:**
- `crates/ai/src/tools/mod.rs` - add ImportCsvTool to ToolSet
- `crates/ai/src/chat.rs` - register tool in agent builder
- `src-front/features/ai-assistant/hooks/use-chat-runtime.ts` - add attachment adapter
- `src-front/features/ai-assistant/components/tool-uis/index.ts` - register UI
- `src-front/features/ai-assistant/components/chat-shell.tsx` - add UI component

## Pattern Reference: record_activity tool

This tool follows the same mutation pattern as `record_activity`:

| Aspect | record_activity | import_csv |
|--------|-----------------|------------|
| AI returns | Single ActivityDraft | Array of ActivityDraft[] |
| User edits | Form fields | ActivityDataGrid cells |
| User submits | Confirm button | Save button |
| Persist state | `updateToolResult({ submitted: true, createdActivityId })` | `updateToolResult({ submitted: true, createdActivityIds: [...] })` |
| Success UI | Summary card | Summary with row count |

## Open Questions

1. **Max file size?** - Suggest 5MB limit, ~50k rows
2. **Persist mappings?** - Save successful mappings per broker/format for reuse?
3. **Error row handling?** - Skip in grid or show with red highlight?
4. **Duplicate detection?** - Check against existing activities by date+symbol+amount?
