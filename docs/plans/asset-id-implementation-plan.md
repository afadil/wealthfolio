# Task Plan: Asset ID Strategy Implementation

## Goal
Implement the new asset ID format (`symbol:qualifier`) with backend-owned ID generation, canonical exchange mapping, and updated frontend flows.

## Phases
- [x] Phase 1: Interview and requirements gathering
- [x] Phase 2: Write detailed spec from interview
- [x] Phase 3: Implementation planning (breakdown into tasks)
- [x] Phase 4: Implementation

## Key Decisions Made

### Architecture
| Decision | Choice | Rationale |
|----------|--------|-----------|
| ID generation ownership | Backend only | Single source of truth, consistent format |
| ID format | Typed prefix `{TYPE}:{symbol}:{qualifier}` | Explicit kind, no inference needed |
| ID mutability | Mutable via `ON UPDATE CASCADE` | Allows fixing `SEC:AAPL:UNKNOWN` → `SEC:AAPL:XNAS` |
| Migration strategy | None (manual) | User will handle existing data manually |
| Account-level exchange | Skip | Not needed, simplifies implementation |

### Frontend → Backend Contract
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend payload | Symbol + Exchange MIC | Structured data from search results |
| Input flexibility | Accept all formats, normalize on backend | Maximum UX flexibility |
| Response contract | Confirm success, frontend refetches | Simple, no state sync issues |
| Preview/resolve endpoint | No separate endpoint | Resolution only during activity creation |

### Search & Resolution
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search flow | Frontend calls backend (already exists) | Backend handles provider abstraction |
| Search results | Merge existing assets first, then provider results | Reuse existing assets |
| Exchange source | Hybrid: canonical mapping, fallback to provider | Best of both worlds |
| Multi-exchange priority | Account currency determines order | CAD account sees TSX first |
| Exchange display | Friendly name (NASDAQ), not MIC (XNAS) | User-friendly |
| Exchange data storage | Database table with seed data | Updatable without deploy |

### Data Grid Behavior
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Resolution timing | Hybrid: debounce delay (~500ms) | Balance responsiveness and API calls |
| Loading state | Spinner in cell, block editing | Clear feedback to user |
| Unknown symbols | Prompt user: enter data or select manual | User controls outcome |
| Manual entry (no search selection) | Create with pricing_mode=Manual | Custom/private assets supported |

### Asset Types
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cash assets | Auto-generated, invisible to user | `CASH:USD` created automatically |
| Crypto quote currency | Canonical (USD) | `BTC:USD` always, FX handles conversion |
| Crypto search | Show all common variants | User picks BTC:USD, BTC:CAD, etc. |
| Alternative assets | Always random suffix | `PROP:a1b2c3`, ensures uniqueness |

### Broker Sync
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Exchange mapping | Use broker codes as-is | Trust broker data |

### CSV Import
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Asset resolution UX | Separate step before preview | Clear review of symbol→ID mapping |

## Status
**MOSTLY COMPLETED** - Core implementation done, CSV import UX enhancement deferred

### Deferred: CSV Import Asset Resolution Step
The spec (Section 7) described a new "Asset Resolution" step for CSV import where users could review resolved symbols before import. This was **not implemented** - the current flow resolves symbols automatically at import time.

**What works now:**
- CSV symbols are resolved to canonical IDs via `resolve_asset_id()` at import time
- Unknown symbols get `SEC:SYMBOL:UNKNOWN` format

**Deferred items:**
- Asset resolution UI step (between mapping and preview)
- Bulk resolution endpoint `POST /api/assets/resolve-bulk`
- Unknown symbol handling UI (search, create manual, skip rows)

## Key Improvements from Review
1. **Typed prefixes** (`SEC:`, `CRYPTO:`, `FX:`) - eliminates inference ambiguity
2. **ON UPDATE CASCADE** - enables ID updates when MIC becomes known
3. **AssetKind::id_prefix()` - clean mapping between kind and prefix

## Implementation Summary

### Database
- `2025-12-14-150000_core_schema_redesign` - includes ON UPDATE CASCADE on activities.asset_id FK
- `2025-12-15-000001_quotes_market_data` - includes exchanges reference table with 15 seeded exchanges

### Backend
- `crates/core/src/assets/asset_id.rs` - canonical_asset_id(), parse functions, 51+ tests
- `crates/core/src/assets/assets_model.rs` - id_prefix(), from_id_prefix() on AssetKind
- `crates/core/src/activities/activities_service.rs` - resolve_asset_id(), infer_asset_kind()
- `crates/core/src/activities/activities_model.rs` - symbol, exchange_mic, asset_kind fields
- `crates/market-data/src/resolver/exchange_map.rs` - yahoo_suffix_to_mic(), mic_to_exchange_name()
- `crates/core/src/quotes/service.rs` - search_symbol_with_currency(), merge existing assets

### Frontend
- `src-front/pages/activity/components/activity-form.tsx` - sends symbol + exchangeMic
- `src-front/pages/activity/components/activity-data-grid/activity-utils.ts` - sends symbol + exchangeMic in payload
- `src-front/pages/activity/components/activity-data-grid/activity-data-grid.tsx` - captures exchangeMic on symbol selection
- `src-front/pages/activity/components/activity-data-grid/use-activity-columns.tsx` - passes onSymbolSelect callback
- `src-front/lib/types.ts` - added exchangeMic to QuoteSummary and ActivityDetails
- `src-front/components/ticker-search.tsx` - shows friendly exchange names (uses backend `exchangeName`)
- `src-front/lib/constants.ts` - minimal fallback mapping (MANUAL, CCC, CCY, OTC only)
- `packages/ui/src/components/data-grid/data-grid-types.ts` - added exchangeMic to SymbolSearchResult
- `packages/ui/src/components/data-grid/data-grid-cell-variants.tsx` - passes rowIndex to onSelect callback

## Files
- `asset-id-implementation-plan.md` - This plan file
- `asset-id-implementation-spec.md` - Detailed implementation spec
- `asset-id-strategy.md` - Original design doc (superseded by spec)
