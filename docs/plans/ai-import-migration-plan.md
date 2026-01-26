# AI Import Tool Migration Plan

## Status: ✅ COMPLETED

---

## Goal
Unify AI import and manual import to use the same `ImportMappingData` format.

---

## Completed Changes

### Phase 1: Use Core CSV Parser ✅
- AI tool now uses `activity_service.parse_csv()` instead of its own parser
- Removed ~85 lines of duplicate CSV parsing code

### Phase 2: Load Existing Import Profiles ✅
- When `accountId` is provided, tool calls `get_import_mapping(account_id)`
- Saved profile is used as starting point (if exists)
- Falls back to auto-detection if no saved profile

### Phase 3: Unified Mapping Format ✅
- **Removed**: `ImportPlan`, `ColumnMappings`, `EnumMaps`, `Transform`, `SignRule`, etc.
- **Uses**: `ImportMappingData` directly (same as manual import)
- LLM now outputs header names (e.g., `"Date"`) instead of column indices (e.g., `0`)

### Phase 4: User-Controlled Saving ✅
- AI tool **does not** auto-save mappings
- Returns `applied_mapping: ImportMappingData` in output
- Frontend can save via user action

### Phase 5: Shared Auto-Detection ✅
- `auto_detect_field_mappings()` function with same header patterns as frontend
- Can be moved to core crate later if needed

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ImportMappingData                        │
│  (Single format for both AI and manual import)              │
├─────────────────────────────────────────────────────────────┤
│  - field_mappings: {fieldName → headerName}                 │
│  - activity_mappings: {ActivityType → [csvValues]}          │
│  - symbol_mappings: {csvSymbol → canonicalSymbol}           │
│  - account_mappings: {csvAccount → accountId}               │
│  - parse_config: Optional<ParseConfig>                      │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    ┌──────────────┐              ┌──────────────┐
    │  AI Import   │              │ Manual Import│
    │    Tool      │              │    Wizard    │
    └──────────────┘              └──────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ▼
           ┌──────────────────┐
           │ core::csv_parser │
           │   parse_csv()    │
           └──────────────────┘
```

---

## Benefits

1. **Single source of truth** - One mapping format for everything
2. **Profile reuse** - AI imports benefit from saved profiles
3. **Consistent parsing** - Same CSV parser for both flows
4. **LLM-friendly** - Header names are more readable than indices
5. **User control** - No automatic saving, user decides

---

## Files Changed

- `crates/ai/src/tools/import_csv.rs` - Rewrote to use `ImportMappingData`
- `crates/ai/src/env.rs` - Added `parse_csv` to mock
- `crates/core/src/portfolio/net_worth/net_worth_service.rs` - Fixed Cash staleness bug

---

## Code Reduction

- Removed: ~400 lines (ImportPlan types, duplicate parser, conversion functions)
- Added: ~200 lines (simplified tool using ImportMappingData)
- Net reduction: ~200 lines
