# AI CSV Import - Target Architecture (SOTA)

Status: Proposed  
Owner: AI Assistant / Import  
Last updated: 2025-02-XX

## Summary

Design a best-in-class AI-assisted CSV import that lets a model propose mappings
and cleaning steps, while deterministic code parses, transforms, validates, and
persists. The model never auto-saves; the user always confirms. We reuse the
manual import pipeline and UI where possible.

## Goals

- High accuracy imports with transparent, editable mappings.
- Deterministic parsing/cleaning/validation; LLM only proposes a plan.
- Minimal data exposure to the model (samples + stats).
- Reuse manual import utilities, schemas, and UI components.
- Multi-turn refinement with clear diffing of plan changes.

## Non-goals

- Full auto-import without review.
- Unbounded model access to full CSV data (privacy + cost).
- Model-generated code or database writes.

## References (reuse)

- Manual import flow: `src-front/pages/activity/import/activity-import-page.tsx`
- Mapping UI: `src-front/pages/activity/import/components/mapping-editor.tsx`
- Validation + normalization: `src-front/pages/activity/import/utils/validation-utils.ts`
- Mapping persistence: `src-front/pages/activity/import/hooks/use-import-mapping.ts`
- Import mutations: `src-front/pages/activity/import/hooks/use-activity-import-mutations.ts`
- Types/schemas: `src-front/lib/types.ts`, `src-front/lib/constants.ts`
- Existing AI tool UI: `src-front/features/ai-assistant/components/tool-uis/import-csv-tool-ui.tsx`

## User Flow

1. User attaches a CSV in chat and asks to import.
2. App parses CSV locally and computes header + column stats + samples.
3. LLM receives stats/samples and returns an Import Plan.
4. App applies the plan deterministically to full data, validates, and renders
   a preview (reuse manual preview UI).
5. User edits mapping or individual rows, or asks the AI to refine the plan.
6. User clicks Save to import valid rows (never auto-saves).

## Architecture Overview

```
CSV file
  -> Local Parser (robust CSV)
     -> Column Stats + Samples
        -> LLM (Import Plan)
           -> Import Engine (deterministic transforms)
              -> Validation (importActivitySchema + business rules)
                 -> Preview UI (edit + confirm)
                    -> saveActivities/importActivities
```

### Components

- Frontend
  - Attachment handling in chat runtime.
  - Local CSV parser for stats/samples.
  - Import preview + mapping editor (reuse manual import UI).
- Backend
  - Import engine (deterministic transforms + validation).
  - AI tool endpoints (plan + apply).
- Model
  - Produces a strict JSON Import Plan with confidence.

## SOTA Patterns to Follow

- LLM as planner, deterministic code as executor.
- Constrained JSON schema with function-calling; reject non-conformant output.
- Use samples + stats, not full data, for model prompts.
- Provide "abstain" option in the plan when confidence is low.
- Multi-turn refinement with plan diffs and user confirmation.
- Persist per-account/per-broker plans for reuse.
- Clear audit trail of transformations and validation results.

## Import Plan (LLM Output)

The model returns a strict plan, no raw data output.

```json
{
  "columnMappings": {
    "date": 0,
    "activityType": 4,
    "symbol": 1,
    "quantity": 2,
    "unitPrice": 3,
    "amount": null,
    "fee": null,
    "currency": null,
    "account": null,
    "comment": null
  },
  "transforms": [
    { "field": "date", "op": "parse_date", "formatHints": ["MM/DD/YYYY"] },
    { "field": "symbol", "op": "uppercase" },
    { "field": "quantity", "op": "parse_number_abs" },
    { "field": "unitPrice", "op": "parse_number_abs" }
  ],
  "enumMaps": {
    "activityType": {
      "PURCHASE": "BUY",
      "SELL": "SELL",
      "DIV": "DIVIDEND"
    }
  },
  "signRules": [
    { "field": "amount", "rule": "negative_is_sell" }
  ],
  "confidence": {
    "overall": 0.82,
    "byField": { "date": 0.95, "symbol": 0.92, "activityType": 0.68 }
  },
  "notes": [
    "Amount column is absent; use quantity * unitPrice"
  ],
  "abstain": false
}
```

## Import Plan JSON Schema

Canonical schema lives in `docs/specs/ai-csv-import-tool.md`.

## Refactor Plan (Manual + AI Shared)

1. Extract parsing/normalization helpers into a shared module:
   - `normalizeNumericValue`, `parseAndAbsoluteValue`
   - `calculateCashActivityAmount`, `validateTickerSymbol`
2. Keep `validateActivityImport` as the single source of truth for row validity.
3. Reuse `ImportFormat`, `ImportMappingData`, `IMPORT_REQUIRED_FIELDS`.
4. Ensure AI import calls the same validation pipeline as manual import.

### Plan Notes

- `columnMappings` matches `ImportFormat` from `src-front/lib/constants.ts`.
- `transforms` are declarative and mapped to deterministic functions.
- `enumMaps` is the only place the model influences activity types.
- `confidence` drives UI prompts (ask user if low confidence).
- `abstain: true` triggers a UI prompt to map columns manually.

## Deterministic Import Engine

1. **Parse CSV** with a robust parser (CSV crate in Rust).
2. **Detect headers** and delimiter; normalize header names.
3. **Apply Import Plan**:
   - Map columns by index.
   - Apply transforms (parse date/number, uppercase symbol, etc).
   - Apply enum mappings (activity types, broker-specific labels).
4. **Normalize business rules** (reuse manual import logic):
   - Numeric cleaning: `normalizeNumericValue`.
   - Amount/fee derivation: `calculateCashActivityAmount`.
   - Symbol rules: `validateTickerSymbol`.
5. **Validate** against `importActivitySchema` rules and import constraints.
6. **Return drafts** with row-level errors + warnings.

## Reuse From Manual Import

We can reuse these as-is or extract them into shared modules:

- **Mapping schema + constants**
  - `ImportFormat`, `IMPORT_REQUIRED_FIELDS`
  - `ImportMappingData` (`importMappingSchema`)
- **Normalization & validation**
  - `normalizeNumericValue`, `parseAndAbsoluteValue`
  - `calculateCashActivityAmount`
  - `validateTickerSymbol`
  - `validateActivityImport` (core logic)
- **UI components**
  - `CsvMappingEditor`
  - `ImportPreviewTable` and `ImportAlert`
  - `useActivityImportMutations` for confirmed import
- **Mapping persistence**
  - `useImportMapping` (get/save per account)

### Suggested Refactor (if needed)

Move the validation and transform logic from
`src-front/pages/activity/import/utils/validation-utils.ts` into a shared module
used by both AI import and manual import. Keep the public API stable to avoid
UI churn.

## Tool/API Design

### analyze_csv (local, no LLM)

Input: raw CSV text or file handle  
Output: headers, column stats, sample rows, delimiter

### propose_import_plan (LLM)

Input: stats + samples + known broker hints  
Output: Import Plan JSON (schema-enforced)

### apply_import_plan (deterministic)

Input: CSV + plan  
Output: drafts + validation summary + cleaning actions

## UI/UX Details

- Show mapping summary + confidence badges.
- Allow quick edits: per-column remap + enum map edits.
- Show row-level errors with a filter for "invalid only".
- Always show "Save X valid rows" button; disable if zero valid rows.
- Provide "Ask AI to fix mapping" inline action.

## Safety + Privacy

- Never send entire CSV to the model unless the user opts in.
- Strip PII from samples where possible (mask account numbers).
- Log plan + summary only, not raw rows.
- Always require explicit user confirmation.

## Rollout Plan

1. Replace current `import_csv` with plan-based pipeline.
2. Reuse manual import UI for preview and mapping edits.
3. Add plan persistence per account/broker.
4. Add eval harness with known broker exports.

## Open Questions

- Do we allow full-file LLM mode for power users (opt-in)?
- Where should shared import logic live: `crates/core` or `packages/ui`?
- Do we standardize a broker fingerprint registry for template matching?
