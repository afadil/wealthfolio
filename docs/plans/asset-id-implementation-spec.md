# Asset ID Implementation Spec

> Based on interview conducted 2025-01-09. This spec refines and supersedes parts of `asset-id-strategy.md`.

## Overview

Implement canonical asset ID format with backend-owned generation. Frontend sends structured data, backend constructs IDs.

---

## 1. Asset ID Format

### Typed Prefix Format: `{TYPE}:{symbol}:{qualifier}`

Use typed prefixes to make asset kind explicit in the ID - no inference needed.

| Asset Kind | Prefix | Format | Example |
|------------|--------|--------|---------|
| Security | `SEC` | `SEC:{symbol}:{mic}` | `SEC:AAPL:XNAS` |
| Crypto | `CRYPTO` | `CRYPTO:{symbol}:{quote}` | `CRYPTO:BTC:USD` |
| FX Rate | `FX` | `FX:{base}:{quote}` | `FX:EUR:USD` |
| Cash | `CASH` | `CASH:{currency}` | `CASH:CAD` |
| Option | `OPT` | `OPT:{symbol}:{mic}` | `OPT:AAPL240119C00150000:XNAS` |
| Commodity | `CMDTY` | `CMDTY:{symbol}` | `CMDTY:GC` |
| Private Equity | `PEQ` | `PEQ:{random}` | `PEQ:a1b2c3d4` |
| Property | `PROP` | `PROP:{random}` | `PROP:a1b2c3d4` |
| Vehicle | `VEH` | `VEH:{random}` | `VEH:x9y8z7w6` |
| Collectible | `COLL` | `COLL:{random}` | `COLL:m3n4o5p6` |
| Precious Metal | `PREC` | `PREC:{random}` | `PREC:g1h2i3j4` |
| Liability | `LIAB` | `LIAB:{random}` | `LIAB:q7r8s9t0` |
| Other | `ALT` | `ALT:{random}` | `ALT:u1v2w3x4` |

### Key Rules
- Colon (`:`) is the universal separator
- Typed prefix makes asset kind explicit (no inference needed)
- `SEC:AAPL:UNKNOWN` is valid when exchange not yet known
- IDs can be updated via `ON UPDATE CASCADE` when MIC is resolved
- Backend is the sole generator of IDs

### Prefix Mapping in Rust

```rust
impl AssetKind {
    pub const fn id_prefix(&self) -> &'static str {
        match self {
            AssetKind::Security => "SEC",
            AssetKind::Crypto => "CRYPTO",
            AssetKind::Cash => "CASH",
            AssetKind::FxRate => "FX",
            AssetKind::Option => "OPT",
            AssetKind::Commodity => "CMDTY",
            AssetKind::PrivateEquity => "PEQ",
            AssetKind::Property => "PROP",
            AssetKind::Vehicle => "VEH",
            AssetKind::Collectible => "COLL",
            AssetKind::PhysicalPrecious => "PREC",
            AssetKind::Liability => "LIAB",
            AssetKind::Other => "ALT",
        }
    }

    pub fn from_id_prefix(prefix: &str) -> Option<Self> {
        match prefix {
            "SEC" => Some(AssetKind::Security),
            "CRYPTO" => Some(AssetKind::Crypto),
            "CASH" => Some(AssetKind::Cash),
            "FX" => Some(AssetKind::FxRate),
            "OPT" => Some(AssetKind::Option),
            "CMDTY" => Some(AssetKind::Commodity),
            "PEQ" => Some(AssetKind::PrivateEquity),
            "PROP" => Some(AssetKind::Property),
            "VEH" => Some(AssetKind::Vehicle),
            "COLL" => Some(AssetKind::Collectible),
            "PREC" => Some(AssetKind::PhysicalPrecious),
            "LIAB" => Some(AssetKind::Liability),
            "ALT" => Some(AssetKind::Other),
            _ => None,
        }
    }
}
```

---

## 2. Database: Exchange Reference Table

New table to map MIC codes to friendly names.

```sql
CREATE TABLE exchanges (
    mic_code TEXT PRIMARY KEY,        -- ISO 10383 MIC
    name TEXT NOT NULL,               -- "New York Stock Exchange"
    short_name TEXT,                  -- "NYSE"
    country_code TEXT,                -- "US"
    currency TEXT                     -- Primary currency "USD"
);

-- Seed data (subset)
INSERT INTO exchanges VALUES
    ('XNYS', 'New York Stock Exchange', 'NYSE', 'US', 'USD'),
    ('XNAS', 'NASDAQ', 'NASDAQ', 'US', 'USD'),
    ('ARCX', 'NYSE Arca', 'ARCA', 'US', 'USD'),
    ('XTSE', 'Toronto Stock Exchange', 'TSX', 'CA', 'CAD'),
    ('XTSX', 'TSX Venture Exchange', 'TSX-V', 'CA', 'CAD'),
    ('XLON', 'London Stock Exchange', 'LSE', 'GB', 'GBP'),
    ('XETR', 'Deutsche Börse Xetra', 'XETRA', 'DE', 'EUR'),
    ('XPAR', 'Euronext Paris', 'EPA', 'FR', 'EUR'),
    ('XAMS', 'Euronext Amsterdam', 'AMS', 'NL', 'EUR'),
    ('XSWX', 'SIX Swiss Exchange', 'SWX', 'CH', 'CHF'),
    ('XHKG', 'Hong Kong Stock Exchange', 'HKEX', 'HK', 'HKD'),
    ('XTKS', 'Tokyo Stock Exchange', 'TSE', 'JP', 'JPY'),
    ('XASX', 'Australian Securities Exchange', 'ASX', 'AU', 'AUD');
```

### Currency → Exchange Priority Mapping

Used for sorting search results by relevance to account:

```rust
fn exchanges_for_currency(currency: &str) -> Vec<&str> {
    match currency {
        "USD" => vec!["XNYS", "XNAS", "ARCX", "BATS"],
        "CAD" => vec!["XTSE", "XTSX", "XCNQ"],
        "GBP" => vec!["XLON"],
        "EUR" => vec!["XETR", "XPAR", "XAMS"],
        "CHF" => vec!["XSWX"],
        "HKD" => vec!["XHKG"],
        "JPY" => vec!["XTKS"],
        "AUD" => vec!["XASX"],
        _ => vec![],
    }
}
```

---

## 3. Database: ON UPDATE CASCADE for ID Changes

Enable ID updates to cascade to referencing tables (activities, etc.):

```sql
-- Migration: Add ON UPDATE CASCADE to activities table
-- SQLite requires recreating the table

CREATE TABLE activities_new (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    asset_id TEXT NOT NULL REFERENCES assets(id) ON UPDATE CASCADE,  -- CASCADE here
    activity_type TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    quantity TEXT,
    unit_price TEXT,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee TEXT,
    fx_rate TEXT,
    comment TEXT,
    needs_review INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO activities_new SELECT * FROM activities;
DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;
```

### ID Update Example (when MIC becomes known)

```rust
/// Update asset ID when exchange is resolved
/// CASCADE propagates change to all activities automatically
async fn update_asset_exchange(&self, old_id: &str, new_mic: &str) -> Result<Asset> {
    // Parse old ID: SEC:AAPL:UNKNOWN
    let parts: Vec<&str> = old_id.split(':').collect();
    if parts.len() != 3 || parts[0] != "SEC" {
        return Err(Error::InvalidAssetId(old_id.to_string()));
    }

    let new_id = format!("SEC:{}:{}", parts[1], new_mic);

    // Single UPDATE - CASCADE handles activities
    sqlx::query("UPDATE assets SET id = ?, exchange_mic = ? WHERE id = ?")
        .bind(&new_id)
        .bind(new_mic)
        .bind(old_id)
        .execute(&self.pool)
        .await?;

    self.get_by_id(&new_id)
}
```

---

## 4. Backend: ID Generation Service

### Location
`crates/core/src/assets/asset_id.rs` (new file)

### Canonical ID Generator

```rust
use nanoid::nanoid;

/// Generate canonical asset ID with typed prefix
pub fn canonical_asset_id(
    kind: &AssetKind,
    symbol: &str,
    exchange_mic: Option<&str>,
    currency: &str,
) -> String {
    let sym = symbol.trim().to_uppercase();
    let ccy = currency.trim().to_uppercase();

    match kind {
        AssetKind::Cash => format!("CASH:{ccy}"),

        AssetKind::FxRate => {
            // sym is base (EUR), ccy is quote (USD)
            format!("FX:{sym}:{ccy}")
        }

        AssetKind::Crypto => {
            // BTC:USD - include quote currency
            format!("CRYPTO:{sym}:{ccy}")
        }

        AssetKind::Security => {
            let mic = exchange_mic
                .map(|m| m.trim().to_uppercase())
                .unwrap_or_else(|| "UNKNOWN".to_string());
            format!("SEC:{sym}:{mic}")
        }

        AssetKind::Option => {
            let mic = exchange_mic
                .map(|m| m.trim().to_uppercase())
                .unwrap_or_else(|| "UNKNOWN".to_string());
            format!("OPT:{sym}:{mic}")
        }

        AssetKind::Commodity => format!("CMDTY:{sym}"),

        AssetKind::PrivateEquity => format!("PEQ:{}", random_suffix()),
        AssetKind::Property => format!("PROP:{}", random_suffix()),
        AssetKind::Vehicle => format!("VEH:{}", random_suffix()),
        AssetKind::Collectible => format!("COLL:{}", random_suffix()),
        AssetKind::PhysicalPrecious => format!("PREC:{}", random_suffix()),
        AssetKind::Liability => format!("LIAB:{}", random_suffix()),
        AssetKind::Other => format!("ALT:{}", random_suffix()),
    }
}

fn random_suffix() -> String {
    nanoid!(8, &nanoid::alphabet::SAFE) // URL-safe, 8 chars
}

/// Parse asset kind from ID prefix (trivial with typed prefixes)
pub fn kind_from_asset_id(asset_id: &str) -> Option<AssetKind> {
    let prefix = asset_id.split(':').next()?;
    AssetKind::from_id_prefix(prefix)
}

/// Parse components from asset ID
pub struct ParsedAssetId {
    pub kind: AssetKind,
    pub symbol: String,
    pub qualifier: Option<String>,  // MIC for SEC, quote for CRYPTO/FX
}

pub fn parse_asset_id(asset_id: &str) -> Option<ParsedAssetId> {
    let parts: Vec<&str> = asset_id.split(':').collect();
    let kind = AssetKind::from_id_prefix(parts.first()?)?;

    match kind {
        AssetKind::Cash => Some(ParsedAssetId {
            kind,
            symbol: parts.get(1)?.to_string(),
            qualifier: None,
        }),
        AssetKind::Security | AssetKind::Crypto | AssetKind::FxRate | AssetKind::Option => {
            Some(ParsedAssetId {
                kind,
                symbol: parts.get(1)?.to_string(),
                qualifier: parts.get(2).map(|s| s.to_string()),
            })
        }
        _ => Some(ParsedAssetId {
            kind,
            symbol: parts.get(1)?.to_string(),
            qualifier: None,
        }),
    }
}
```

### Input Normalization

Backend accepts various input formats and normalizes:

```rust
pub fn normalize_symbol_input(input: &str) -> NormalizedSymbol {
    let input = input.trim().to_uppercase();

    // Already canonical format "AAPL:XNAS"
    if let Some((symbol, qualifier)) = input.split_once(':') {
        return NormalizedSymbol { symbol, qualifier: Some(qualifier), format: Canonical };
    }

    // Yahoo format "AAPL.US" or "RY.TO"
    if let Some((symbol, suffix)) = input.split_once('.') {
        let mic = yahoo_suffix_to_mic(suffix);
        return NormalizedSymbol { symbol, qualifier: mic, format: Yahoo };
    }

    // Yahoo crypto "BTC-USD"
    if input.contains('-') && looks_like_crypto(&input) {
        let parts: Vec<&str> = input.split('-').collect();
        return NormalizedSymbol {
            symbol: parts[0],
            qualifier: parts.get(1).copied(),
            format: YahooCrypto
        };
    }

    // Bare symbol "AAPL"
    NormalizedSymbol { symbol: &input, qualifier: None, format: Bare }
}
```

---

## 4. Backend: Search Endpoint Changes

### Current Endpoint
`POST /api/search/symbol` or similar

### Updated Response

```rust
pub struct TickerSearchResult {
    pub symbol: String,              // "AAPL"
    pub name: Option<String>,        // "Apple Inc"
    pub exchange_mic: Option<String>,// "XNAS" (canonical MIC)
    pub exchange_name: Option<String>,// "NASDAQ" (friendly name from exchanges table)
    pub currency: Option<String>,    // "USD"
    pub asset_type: Option<String>,  // "EQUITY", "ETF", "CRYPTOCURRENCY"
    pub data_source: String,         // "YAHOO", "MANUAL"
    pub is_existing: bool,           // true if already in user's assets
    pub existing_asset_id: Option<String>, // "AAPL:XNAS" if exists
}
```

### Search Logic

```rust
async fn search_symbols(query: &str, account_currency: Option<&str>) -> Vec<TickerSearchResult> {
    // 1. Search existing assets first
    let existing = asset_repo.search_by_symbol(query);

    // 2. Search provider (Yahoo)
    let provider_results = quote_service.search(query).await;

    // 3. Merge and deduplicate
    let mut results = merge_results(existing, provider_results);

    // 4. Enrich with canonical exchange names
    for result in &mut results {
        if let Some(mic) = &result.exchange_mic {
            result.exchange_name = exchange_repo.get_name(mic);
        }
    }

    // 5. Sort by relevance to account currency
    if let Some(currency) = account_currency {
        sort_by_currency_relevance(&mut results, currency);
    }

    results
}

fn sort_by_currency_relevance(results: &mut Vec<TickerSearchResult>, currency: &str) {
    let preferred_exchanges = exchanges_for_currency(currency);
    results.sort_by(|a, b| {
        let a_priority = a.exchange_mic.as_ref()
            .and_then(|mic| preferred_exchanges.iter().position(|&e| e == mic))
            .unwrap_or(999);
        let b_priority = b.exchange_mic.as_ref()
            .and_then(|mic| preferred_exchanges.iter().position(|&e| e == mic))
            .unwrap_or(999);
        a_priority.cmp(&b_priority)
    });
}
```

### Provider MIC Mapping

Map Yahoo exchange suffixes to canonical MICs:

```rust
fn yahoo_suffix_to_mic(suffix: &str) -> Option<String> {
    match suffix.to_uppercase().as_str() {
        "TO" => Some("XTSE"),
        "V" | "VN" => Some("XTSX"),
        "L" => Some("XLON"),
        "PA" => Some("XPAR"),
        "DE" => Some("XETR"),
        "AS" => Some("XAMS"),
        "SW" => Some("XSWX"),
        "HK" => Some("XHKG"),
        "T" => Some("XTKS"),
        "AX" => Some("XASX"),
        // US exchanges (no suffix in Yahoo, but may appear)
        "US" | "" => None, // Will need exchange lookup
        _ => None,
    }
}
```

---

## 5. Frontend: Activity Creation Flow

### Individual Form (`activity-form.tsx`)

**Current:** Frontend sets `assetId` directly
**New:** Frontend sends `symbol` + `exchangeMic`, backend generates ID

```typescript
// Before (current)
submitData.assetId = `$CASH-${account.currency}`;

// After (new)
// For cash activities - no symbol needed, backend handles
if (isCashActivity(submitData.activityType)) {
  submitData.symbol = undefined;
  submitData.exchangeMic = undefined;
  // Backend will generate CASH:{currency} from account
}

// For market activities - send structured data from search selection
submitData.symbol = selectedAsset.symbol;        // "AAPL"
submitData.exchangeMic = selectedAsset.exchangeMic; // "XNAS"
submitData.assetId = undefined;  // Let backend generate
```

### Data Grid (`activity-utils.ts`)

**Symbol Cell Behavior:**
1. User types → triggers search (debounced 500ms)
2. Shows spinner while searching
3. User selects from dropdown → stores `symbol` + `exchangeMic`
4. User types custom text without selecting → `dataSource = MANUAL`

```typescript
// Resolution on blur/tab
async function resolveSymbolCell(value: string, accountCurrency: string) {
  setLoading(true);

  const results = await searchSymbols(value, accountCurrency);

  if (results.length === 1 && results[0].symbol.toUpperCase() === value.toUpperCase()) {
    // Exact match - auto-select
    return {
      symbol: results[0].symbol,
      exchangeMic: results[0].exchange_mic,
      dataSource: results[0].data_source,
    };
  } else if (results.length > 0) {
    // Multiple matches - show dropdown
    showSearchDropdown(results);
    return null; // Wait for selection
  } else {
    // No matches - prompt user
    return promptManualOrRetry(value);
  }
}
```

### Payload to Backend

```typescript
interface ActivityCreatePayload {
  accountId: string;
  activityType: ActivityType;
  activityDate: string;

  // Asset identification (backend generates ID from these)
  symbol?: string;           // "AAPL" or undefined for cash
  exchangeMic?: string;      // "XNAS" or undefined
  assetDataSource?: string;  // "YAHOO" | "MANUAL"

  // For backward compatibility during transition
  assetId?: string;          // Only if editing existing activity

  // Activity data
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  fxRate?: string | null;
  comment?: string;
}
```

---

## 6. Frontend: Symbol Search Component

### Props Update

```typescript
interface TickerSearchInputProps {
  accountCurrency?: string;  // For sorting results
  onSelect: (result: TickerSearchResult) => void;
  // ... existing props
}
```

### Display Format

- Dropdown shows: `AAPL - Apple Inc (NASDAQ)`
- Selected shows: `AAPL` with exchange badge/chip
- Never show MIC codes to users (XNAS), always friendly names (NASDAQ)

### Search Results Merging

```typescript
// Search results show existing assets first
[
  { symbol: "AAPL", name: "Apple Inc", exchangeName: "NASDAQ", isExisting: true },  // Already owned
  { symbol: "AAPL", name: "Apple Inc", exchangeName: "XETRA", isExisting: false },  // From Yahoo
]
```

---

## 7. CSV Import Flow

### Step 1: Column Mapping (existing)
Map CSV columns to fields including optional `exchange` column.

### Step 2: Asset Resolution (NEW)
Show resolved assets before activity preview:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Import Activities - Step 2: Review Assets                               │
├─────────────────────────────────────────────────────────────────────────┤
│ We found 5 unique symbols. Please confirm the asset matches:            │
│                                                                         │
│ │ CSV Symbol │ Resolved Asset              │ Status    │ Action       │ │
│ ├────────────┼─────────────────────────────┼───────────┼──────────────┤ │
│ │ VFV        │ VFV (TSX)                   │ ✓ Found   │              │ │
│ │ AAPL       │ AAPL (NASDAQ)               │ ✓ Found   │              │ │
│ │ XYZ        │ —                           │ ⚠ Unknown │ [Resolve ▼]  │ │
│ │ BTC        │ BTC (USD)                   │ ✓ Crypto  │              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ [Resolve ▼] options:                                                    │
│   • Search for symbol                                                   │
│   • Create as manual asset                                              │
│   • Skip rows with this symbol                                          │
│                                                                         │
│                                       [← Back]  [Next: Review Data →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Backend Endpoint for Bulk Resolution

```rust
POST /api/assets/resolve-bulk
{
  "symbols": ["VFV", "AAPL", "XYZ", "BTC"],
  "account_currency": "CAD"
}

Response:
{
  "resolutions": [
    { "input": "VFV", "resolved": { "symbol": "VFV", "exchange_mic": "XTSE", ... }, "status": "found" },
    { "input": "AAPL", "resolved": { "symbol": "AAPL", "exchange_mic": "XNAS", ... }, "status": "found" },
    { "input": "XYZ", "resolved": null, "status": "unknown" },
    { "input": "BTC", "resolved": { "symbol": "BTC", "quote": "USD", ... }, "status": "found" }
  ]
}
```

---

## 8. Broker Sync (Wealthfolio Connect)

**No changes needed.** Use broker-provided exchange codes as-is.

The broker sync already provides exchange information. Keep current behavior - trust broker data.

---

## 9. Cash Activities

Cash asset IDs are auto-generated and invisible to users.

### Backend Logic

```rust
fn create_activity(payload: ActivityPayload, account: &Account) -> Result<Activity> {
    let asset_id = if is_cash_activity(&payload.activity_type) {
        // Auto-generate cash asset ID from account currency
        let currency = payload.currency.as_ref()
            .unwrap_or(&account.currency);
        format!("CASH:{}", currency.to_uppercase())
    } else {
        // Generate from symbol + exchange
        generate_asset_id(&AssetIdRequest {
            symbol: payload.symbol.unwrap(),
            exchange_mic: payload.exchange_mic,
            asset_kind: None,
            quote_currency: None,
        })
    };

    // Ensure asset exists
    let asset = get_or_create_asset(&asset_id, ...)?;

    // Create activity
    ...
}
```

---

## 10. Backend: Asset Kind from ID (Trivial)

With typed prefixes, kind inference is now a simple prefix lookup:

```rust
/// Get asset kind from ID - no inference logic needed
pub fn kind_from_asset_id(asset_id: &str) -> Option<AssetKind> {
    let prefix = asset_id.split(':').next()?;
    AssetKind::from_id_prefix(prefix)
}

// Usage
let kind = kind_from_asset_id("SEC:AAPL:XNAS");  // Some(AssetKind::Security)
let kind = kind_from_asset_id("CRYPTO:BTC:USD"); // Some(AssetKind::Crypto)
let kind = kind_from_asset_id("CASH:CAD");       // Some(AssetKind::Cash)
```

**Benefits of typed prefixes:**
- No ambiguity between Security/Crypto/FX (all were `{symbol}:{qualifier}` before)
- No inference logic or heuristics needed
- Self-documenting IDs
- Easy to extend with new asset types

---

## 11. Migration Strategy

**No automatic migration.** User will manually handle existing assets.

New assets get new format. Old assets (`BTC-CAD`, `XEQT.TO`, `$CASH-CAD`) continue to work.

Backend should support BOTH formats during transition:
- Old: `$CASH-CAD`, `BTC-CAD`, `XEQT.TO`
- New: `CASH:CAD`, `BTC:USD`, `XEQT:XTSE`

---

## 12. Summary of Changes

### Database
1. New `exchanges` table with seed data (MIC → friendly name)
2. Add `ON UPDATE CASCADE` to `activities.asset_id` FK (enables ID updates)

### Backend
1. New `asset_id.rs` module:
   - `canonical_asset_id()` - generates typed IDs like `SEC:AAPL:XNAS`
   - `kind_from_asset_id()` - trivial prefix lookup
   - `parse_asset_id()` - extract components
2. `AssetKind::id_prefix()` and `from_id_prefix()` methods
3. Update search endpoint to return canonical MICs + merge existing assets
4. Update activity creation to generate IDs from symbol + exchange + kind
5. New endpoint to update asset ID when MIC is resolved (uses CASCADE)

### Frontend
1. Update `activity-form.tsx` to send `symbol` + `exchangeMic` + `assetKind` instead of `assetId`
2. Update `activity-utils.ts` for data grid resolution flow
3. Update symbol search to show friendly exchange names
4. Add debounced resolution with spinner in data grid
5. Add asset resolution step to CSV import

### ID Format Change
| Old Format | New Format |
|------------|------------|
| `AAPL:XNAS` | `SEC:AAPL:XNAS` |
| `BTC:USD` | `CRYPTO:BTC:USD` |
| `EUR:USD` | `FX:EUR:USD` |
| `CASH:CAD` | `CASH:CAD` (same) |
| `PROP:abc123` | `PROP:abc123` (same) |

### Not Changing
- Broker sync (use broker data as-is)
- Account settings (no default exchange)
- Existing asset migration (manual)
