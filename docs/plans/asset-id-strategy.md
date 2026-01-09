# Asset ID Strategy & Data Completion Design

## Problem Statement

Assets in Wealthfolio need unique, stable identifiers that:
1. Prevent collisions (same symbol on different exchanges)
2. Are deterministic (same asset always gets same ID)
3. Support all creation paths (manual, CSV, broker sync)
4. Allow data enrichment without ID changes

Current issues:
- Inconsistent ID formats across asset types (`BTC-USD`, `EUR/USD`, `SPY`, `PROP-abc123`)
- CSV import creates assets with bare symbols (`SPY`) that can't be disambiguated later
- No exchange context during import leads to ambiguous assets
- ID is immutable once activities reference it

---

## Design Goals

1. **Unified ID format** - Single separator, predictable structure
2. **Collision-free** - Same symbol on different exchanges = different IDs
3. **Deterministic** - Given same inputs, always produce same ID
4. **Enrichment-friendly** - ID contains enough info; metadata can be updated later
5. **User-friendly** - Minimal burden on users during data entry

---

## Asset ID Format Specification

### Unified Format: `{symbol}:{qualifier}`

Use colon (`:`) as the universal separator for all asset types.

| Asset Type | Format | Example | Qualifier Meaning |
|------------|--------|---------|-------------------|
| Security | `{symbol}:{exchange_mic}` | `SPY:XNYS` | ISO 10383 MIC code |
| Crypto | `{symbol}:{quote_currency}` | `BTC:USD` | Quote currency |
| FX Rate | `{base}:{quote}` | `EUR:USD` | Quote currency |
| Cash | `CASH:{currency}` | `CASH:USD` | Currency code |
| Property | `PROP:{id}` | `PROP:a1b2c3d4` | Random instance ID |
| Vehicle | `VEH:{id}` | `VEH:x9y8z7w6` | Random instance ID |
| Collectible | `COLL:{id}` | `COLL:m3n4o5p6` | Random instance ID |
| Precious Metal | `PREC:{id}` | `PREC:g1h2i3j4` | Random instance ID |
| Liability | `LIAB:{id}` | `LIAB:q7r8s9t0` | Random instance ID |
| Other Alt | `ALT:{id}` | `ALT:u1v2w3x4` | Random instance ID |

### ID Generation Rules

```
Securities:
  Input: symbol="SPY", exchange="XNYS"
  Output: "SPY:XNYS"

Crypto:
  Input: symbol="BTC", quote_currency="USD"
  Output: "BTC:USD"

FX:
  Input: base="EUR", quote="USD"
  Output: "EUR:USD"

Cash:
  Input: currency="USD"
  Output: "CASH:USD"

Alternatives:
  Input: kind="Property"
  Output: "PROP:{random_8_chars}"
```

### Parsing Logic

```rust
struct ParsedAssetId {
    primary: String,      // SPY, BTC, EUR, CASH, PROP
    qualifier: String,    // XNYS, USD, a1b2c3d4
}

fn parse_asset_id(id: &str) -> ParsedAssetId {
    let parts: Vec<&str> = id.split(':').collect();
    ParsedAssetId {
        primary: parts[0].to_string(),
        qualifier: parts.get(1).unwrap_or(&"").to_string(),
    }
}

fn infer_asset_kind_from_id(id: &str) -> AssetKind {
    let parsed = parse_asset_id(id);
    match parsed.primary.as_str() {
        "CASH" => AssetKind::Cash,
        "PROP" => AssetKind::Property,
        "VEH" => AssetKind::Vehicle,
        "COLL" => AssetKind::Collectible,
        "PREC" => AssetKind::PhysicalPrecious,
        "LIAB" => AssetKind::Liability,
        "ALT" => AssetKind::Other,
        _ => {
            // Check qualifier to distinguish Security vs Crypto vs FX
            if is_exchange_mic(&parsed.qualifier) {
                AssetKind::Security
            } else if is_currency_code(&parsed.qualifier) {
                // Could be Crypto or FX - check if primary is currency
                if is_currency_code(&parsed.primary) {
                    AssetKind::FxRate
                } else {
                    AssetKind::Crypto
                }
            } else {
                AssetKind::Security // Default
            }
        }
    }
}
```

---

## Account-Level Exchange Setting

### Schema Change

```sql
ALTER TABLE accounts ADD COLUMN default_exchange_mic TEXT;
```

```rust
struct Account {
    // ... existing fields
    default_exchange_mic: Option<String>,  // ISO 10383 MIC code
}
```

### Exchange-Currency Mapping (Defaults)

When user doesn't specify exchange, infer from account currency:

```rust
fn default_exchanges_for_currency(currency: &str) -> Vec<&str> {
    match currency {
        "USD" => vec!["XNYS", "XNAS", "ARCX", "BATS"],  // NYSE, NASDAQ, ARCA, BATS
        "CAD" => vec!["XTSE", "XTSX", "XCNQ"],          // TSX, TSX-V, CSE
        "GBP" => vec!["XLON", "XLSE"],                   // LSE
        "EUR" => vec!["XETR", "XPAR", "XAMS"],           // Xetra, Euronext Paris/Amsterdam
        "JPY" => vec!["XTKS", "XOSE"],                   // Tokyo, Osaka
        "AUD" => vec!["XASX"],                           // ASX
        "CHF" => vec!["XSWX"],                           // SIX Swiss
        "HKD" => vec!["XHKG"],                           // HKEX
        _ => vec![],
    }
}
```

### Account Settings UI

Add to Account Edit form:

```
┌─────────────────────────────────────────────────────────┐
│ Account Settings                                        │
├─────────────────────────────────────────────────────────┤
│ Name:        [My Investment Account      ]              │
│ Currency:    [CAD ▼]                                    │
│ Exchange:    [Toronto Stock Exchange (XTSE) ▼]          │
│              └─ Used when importing activities          │
│                 without exchange information            │
└─────────────────────────────────────────────────────────┘
```

Exchange dropdown options filtered by currency:
- CAD: Toronto Stock Exchange (XTSE), TSX Venture (XTSX), Canadian Securities (XCNQ)
- USD: NYSE (XNYS), NASDAQ (XNAS), NYSE Arca (ARCX), etc.

---

## Asset Resolution Service

Central service for resolving symbols to canonical asset IDs.

### Interface

```rust
pub struct AssetResolutionRequest {
    pub symbol: String,
    pub currency: Option<String>,
    pub exchange_mic: Option<String>,
    pub asset_kind_hint: Option<AssetKind>,
}

pub struct AssetResolutionResult {
    pub asset_id: String,
    pub asset: Asset,
    pub resolution_method: ResolutionMethod,
    pub alternatives: Vec<AssetCandidate>,  // Other possible matches
}

pub enum ResolutionMethod {
    ExactMatch,           // Found existing asset with exact ID
    ExchangeLookup,       // Resolved via market data provider
    CurrencyInference,    // Inferred exchange from currency
    AccountDefault,       // Used account's default exchange
    ManualCreation,       // Created new asset without lookup
}

pub struct AssetCandidate {
    pub asset_id: String,
    pub name: String,
    pub exchange: String,
    pub confidence: f32,
}

#[async_trait]
pub trait AssetResolutionService {
    /// Resolve a symbol to a canonical asset ID
    /// Returns existing asset or creates new one
    async fn resolve(
        &self,
        request: AssetResolutionRequest,
        account: &Account,
    ) -> Result<AssetResolutionResult>;

    /// Search for possible matches without creating
    async fn search(
        &self,
        symbol: &str,
        exchange_hint: Option<&str>,
    ) -> Result<Vec<AssetCandidate>>;
}
```

### Resolution Algorithm

```
resolve(symbol, currency, exchange_hint, account):

    1. NORMALIZE symbol (trim, uppercase)

    2. CHECK for existing asset:
       - If exchange_hint provided: look for "{symbol}:{exchange_hint}"
       - Else if account.default_exchange: look for "{symbol}:{account.default_exchange}"
       - Else: look for any "{symbol}:*" matches
       - If exactly one match → return it
       - If multiple matches → add to alternatives, continue

    3. DETECT asset type from symbol pattern:
       - Starts with known prefix (CASH:, PROP:, etc.) → handle specially
       - Contains "/" or is 3-char pair → likely FX
       - Otherwise → assume Security or Crypto

    4. LOOKUP via market data provider:
       - Query provider with symbol + exchange_hint
       - If found → create asset with canonical ID from provider
       - Provider returns: symbol, name, exchange_mic, currency, type

    5. INFER exchange if lookup fails:
       - Use account.default_exchange_mic if set
       - Else use first exchange from default_exchanges_for_currency(account.currency)
       - Create asset with "{symbol}:{inferred_exchange}"

    6. RETURN result with:
       - Created/found asset
       - Resolution method used
       - Any alternative matches found
```

---

## UX Flows by Creation Path

### 1. Manual Activity Creation (Single Form)

**Current State**: User types/searches symbol, system creates asset with bare symbol.

**New Flow**:

```
┌─────────────────────────────────────────────────────────┐
│ Add Trade Activity                                      │
├─────────────────────────────────────────────────────────┤
│ Account:    [My CAD Account ▼]                          │
│                                                         │
│ Symbol:     [VFV____________] 🔍                        │
│             ┌───────────────────────────────────────┐   │
│             │ VFV - Vanguard S&P 500 ETF            │   │
│             │ XTSE · Toronto Stock Exchange         │ ← │
│             ├───────────────────────────────────────┤   │
│             │ VFV - Similar on other exchanges:     │   │
│             │   · XNYS · New York Stock Exchange    │   │
│             └───────────────────────────────────────┘   │
│                                                         │
│ Quantity:   [100_____________]                          │
│ Price:      [45.50___________]                          │
│                                                         │
│             [Cancel]                    [Save Activity] │
└─────────────────────────────────────────────────────────┘
```

**Behavior**:
1. User types symbol
2. System searches using account's default exchange as hint
3. Dropdown shows primary match (on default exchange) first
4. Other exchange matches shown below
5. User selects specific match → asset created with full ID (`VFV:XTSE`)
6. If user picks "Create manually" → asset created with account's default exchange

**TickerSearchInput Enhancement**:

```typescript
interface TickerSearchResult {
  assetId: string;        // "VFV:XTSE"
  symbol: string;         // "VFV"
  name: string;           // "Vanguard S&P 500 ETF"
  exchangeMic: string;    // "XTSE"
  exchangeName: string;   // "Toronto Stock Exchange"
  currency: string;       // "CAD"
  kind: AssetKind;        // "Security"
  confidence: number;     // 0.95
}

// Search with exchange context
const results = await searchTicker(symbol, {
  preferredExchange: account.defaultExchangeMic,
  currency: account.currency,
});
```

### 2. Bulk Data Grid Creation

**Current State**: User types symbols in cells, assets created with bare symbols.

**New Flow**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Activities                                           [+ Add Row] [Save]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Type   │ Symbol      │ Exchange │ Qty    │ Price  │ Date       │ Status │
├────────┼─────────────┼──────────┼────────┼────────┼────────────┼────────┤
│ BUY    │ VFV         │ XTSE  ▼  │ 100    │ 45.50  │ 2024-01-15 │ ●      │
│ BUY    │ AAPL        │ XNAS  ▼  │ 50     │ 185.00 │ 2024-01-15 │ ●      │
│ BUY    │ [_______]   │ [___]    │        │        │            │ ○      │
└──────────────────────────────────────────────────────────────────────────┘
```

**New Column**: "Exchange" column (optional, auto-populated)

**Behavior**:
1. User types symbol in Symbol column
2. System auto-looks up and populates Exchange column with best match
3. User can override Exchange if needed (dropdown of valid exchanges)
4. On save, asset ID = `{symbol}:{exchange}`

**Alternative**: Single "Asset" column with smart input

```
│ Asset                          │ Qty    │ Price  │
├────────────────────────────────┼────────┼────────┤
│ VFV · XTSE                     │ 100    │ 45.50  │
│ AAPL · NASDAQ                  │ 50     │ 185.00 │
│ [Search or type symbol...]     │        │        │
```

### 3. CSV Import

**Current State**: Symbol column maps directly to asset ID, no exchange info.

**New Flow - Step 1: Upload & Column Mapping**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Import Activities - Step 1: Map Columns                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Account: [My CAD Account ▼]                                             │
│                                                                         │
│ Map CSV columns to activity fields:                                     │
│                                                                         │
│ CSV Column        →  Activity Field                                     │
│ ─────────────────────────────────────                                   │
│ "ticker"          →  [Symbol ▼]                                         │
│ "exchange"        →  [Exchange (optional) ▼]     ← NEW                  │
│ "shares"          →  [Quantity ▼]                                       │
│ "price"           →  [Unit Price ▼]                                     │
│ "date"            →  [Date ▼]                                           │
│ "type"            →  [Activity Type ▼]                                  │
│                                                                         │
│ ℹ️ No exchange column? Symbols will be resolved using account's         │
│   default exchange (XTSE) or looked up automatically.                   │
│                                                                         │
│                                              [Back]  [Next: Preview →]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**New Flow - Step 2: Asset Resolution Preview**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Import Activities - Step 2: Review Assets                               │
├─────────────────────────────────────────────────────────────────────────┤
│ We found 5 unique symbols. Please confirm the asset matches:            │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ CSV Symbol │ Resolved Asset              │ Status    │ Action       │ │
│ ├────────────┼─────────────────────────────┼───────────┼──────────────┤ │
│ │ VFV        │ VFV:XTSE (Vanguard S&P 500) │ ✓ Found   │              │ │
│ │ AAPL       │ AAPL:XNAS (Apple Inc)       │ ✓ Found   │              │ │
│ │ XYZ        │ XYZ:XTSE (Unknown)          │ ⚠ Created │ [Change ▼]   │ │
│ │ BTC        │ BTC:CAD                     │ ✓ Crypto  │              │ │
│ │ INVALID    │ —                           │ ✗ Error   │ [Map... ▼]   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Legend: ✓ Matched  ⚠ Created (verify)  ✗ Failed (needs mapping)        │
│                                                                         │
│                                       [← Back]  [Next: Review Data →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**[Change ▼] Dropdown**:
- Search for different asset
- Change exchange: XTSE → XNYS
- Create as manual asset

**New Flow - Step 3: Activity Preview** (existing, enhanced)

Show resolved asset IDs in preview table.

**Resolution Logic During Import**:

```rust
async fn resolve_csv_symbols(
    symbols: Vec<String>,
    account: &Account,
) -> Vec<CsvSymbolResolution> {
    let mut results = Vec::new();

    for symbol in symbols {
        // Try to resolve with account context
        let resolution = asset_resolution_service.resolve(
            AssetResolutionRequest {
                symbol: symbol.clone(),
                currency: Some(account.currency.clone()),
                exchange_mic: account.default_exchange_mic.clone(),
                asset_kind_hint: None,
            },
            account,
        ).await;

        match resolution {
            Ok(r) => results.push(CsvSymbolResolution {
                csv_symbol: symbol,
                resolved_asset_id: Some(r.asset_id),
                status: match r.resolution_method {
                    ResolutionMethod::ExactMatch => ResolutionStatus::Found,
                    ResolutionMethod::ExchangeLookup => ResolutionStatus::Found,
                    _ => ResolutionStatus::Created,
                },
                alternatives: r.alternatives,
            }),
            Err(_) => results.push(CsvSymbolResolution {
                csv_symbol: symbol,
                resolved_asset_id: None,
                status: ResolutionStatus::Failed,
                alternatives: vec![],
            }),
        }
    }

    results
}
```

### 4. Broker Sync (Wealthfolio Connect)

**Current State**: Broker provides symbol info, assets created with broker-determined IDs.

**New Flow**: Broker sync already has rich data - just ensure ID format consistency.

```rust
fn build_asset_id_from_broker_data(
    symbol: &BrokerSymbol,
    activity: &BrokerActivity,
) -> String {
    match symbol.symbol_type.code.as_str() {
        "CRYPTOCURRENCY" => {
            // Crypto: symbol:quote_currency
            let base = extract_crypto_base(&symbol.symbol);
            let quote = symbol.currency.code.clone();
            format!("{}:{}", base, quote)
        }
        "EQUITY" | "ETF" | "STOCK" => {
            // Security: symbol:exchange
            let exchange = symbol.exchange.mic_code
                .or(symbol.exchange.code)
                .unwrap_or("UNKNOWN");
            format!("{}:{}", symbol.symbol, exchange)
        }
        "CURRENCY" | "FOREX" => {
            // FX: base:quote
            let (base, quote) = parse_fx_pair(&symbol.symbol);
            format!("{}:{}", base, quote)
        }
        _ => {
            // Default: use symbol with exchange if available
            if let Some(mic) = &symbol.exchange.mic_code {
                format!("{}:{}", symbol.symbol, mic)
            } else {
                format!("{}:UNKNOWN", symbol.symbol)
            }
        }
    }
}
```

**Sync Review UI Enhancement**:

For assets that couldn't be fully resolved, show in review:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Synced Activities - Needs Review                                        │
├─────────────────────────────────────────────────────────────────────────┤
│ 3 activities have assets that need confirmation:                        │
│                                                                         │
│ │ Date       │ Type │ Asset              │ Issue           │ Action    │
│ ├────────────┼──────┼────────────────────┼─────────────────┼───────────┤
│ │ 2024-01-15 │ BUY  │ XYZ:UNKNOWN        │ Unknown exchange│ [Fix ▼]   │
│ │ 2024-01-14 │ SELL │ ABC:UNKNOWN        │ Unknown exchange│ [Fix ▼]   │
│                                                                         │
│                                    [Approve All]  [Review Individually] │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5. Bulk Holdings Modal

**Current State**: User enters ticker, shares, avg cost per row.

**New Flow**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Add Multiple Holdings                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ Account: [My CAD Account (XTSE) ▼]                                      │
│ Date:    [2024-01-15]                                                   │
│                                                                         │
│ │ Symbol     │ Exchange │ Shares │ Avg Cost │                           │
│ ├────────────┼──────────┼────────┼──────────┤                           │
│ │ VFV        │ XTSE     │ 100    │ 45.50    │ [×]                       │
│ │ AAPL       │ XNAS     │ 50     │ 185.00   │ [×]                       │
│ │ [______]   │ [auto]   │        │          │ [×]                       │
│                                                         [+ Add Row]     │
│                                                                         │
│ Exchange auto-detected from symbol. Click to change if needed.          │
│                                                                         │
│                                            [Cancel]  [Add Holdings]     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Asset Table

```sql
-- No schema change needed for ID format
-- ID is already VARCHAR, just change the format of values

-- Add index for efficient lookups by symbol (primary part of ID)
CREATE INDEX idx_assets_symbol ON assets(symbol);
```

### Account Table

```sql
ALTER TABLE accounts ADD COLUMN default_exchange_mic TEXT;

-- Optional: Add constraint for valid MIC codes
-- (or validate in application layer)
```

### New Table: Exchange Reference

```sql
CREATE TABLE exchanges (
    mic_code TEXT PRIMARY KEY,        -- ISO 10383 MIC
    name TEXT NOT NULL,               -- "New York Stock Exchange"
    short_name TEXT,                  -- "NYSE"
    country_code TEXT,                -- "US"
    currency TEXT,                    -- Primary currency
    timezone TEXT,                    -- "America/New_York"
    is_active BOOLEAN DEFAULT TRUE
);

-- Seed with common exchanges
INSERT INTO exchanges VALUES
    ('XNYS', 'New York Stock Exchange', 'NYSE', 'US', 'USD', 'America/New_York', TRUE),
    ('XNAS', 'NASDAQ', 'NASDAQ', 'US', 'USD', 'America/New_York', TRUE),
    ('XTSE', 'Toronto Stock Exchange', 'TSX', 'CA', 'CAD', 'America/Toronto', TRUE),
    ('XTSX', 'TSX Venture Exchange', 'TSX-V', 'CA', 'CAD', 'America/Toronto', TRUE),
    ('XLON', 'London Stock Exchange', 'LSE', 'GB', 'GBP', 'Europe/London', TRUE),
    -- ... more exchanges
;
```

---

## Migration Strategy

### Phase 1: Support New Format (Backwards Compatible)

1. Update `AssetResolutionService` to generate new format IDs
2. Update all creation paths to use resolution service
3. Keep existing assets unchanged (old format still works)
4. New assets get new format

### Phase 2: Add Exchange Setting

1. Add `default_exchange_mic` to accounts table
2. Add exchange selection to account settings UI
3. Use exchange in resolution when available

### Phase 3: Optional Migration Tool

For users who want to migrate existing assets:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Settings > Data Management > Migrate Asset IDs                          │
├─────────────────────────────────────────────────────────────────────────┤
│ Update your asset IDs to the new format for better accuracy.            │
│                                                                         │
│ Assets to migrate:                                                      │
│ │ Current ID │ New ID     │ Activities │ Status     │                   │
│ ├────────────┼────────────┼────────────┼────────────┤                   │
│ │ SPY        │ SPY:XNYS   │ 45         │ Ready      │                   │
│ │ VFV.TO     │ VFV:XTSE   │ 23         │ Ready      │                   │
│ │ BTC-USD    │ BTC:USD    │ 12         │ Ready      │                   │
│                                                                         │
│ ⚠️ This will update asset IDs and all referencing activities.           │
│                                                                         │
│                                       [Cancel]  [Migrate Selected]      │
└─────────────────────────────────────────────────────────────────────────┘
```

Migration SQL:

```sql
-- Example: Migrate SPY to SPY:XNYS
BEGIN TRANSACTION;

-- Update activities first (foreign key reference)
UPDATE activities SET asset_id = 'SPY:XNYS' WHERE asset_id = 'SPY';

-- Update the asset
UPDATE assets SET id = 'SPY:XNYS' WHERE id = 'SPY';

COMMIT;
```

---

## Edge Cases & Special Handling

### 1. Same Symbol, Multiple Exchanges

User has both `SPY:XNYS` and `SPY:CBOE` (if they exist):
- Stored as separate assets
- Activities reference specific one
- Holdings show separately

### 2. Symbol Changes / Corporate Actions

If a company changes ticker (e.g., FB → META):
- Keep old asset ID (`FB:XNAS`) for historical activities
- Create new asset (`META:XNAS`) for new activities
- Optionally: Add migration UI to merge/transfer

### 3. Unknown Exchange

When exchange cannot be determined:
- Use `{symbol}:UNKNOWN` as ID
- Flag for user review
- Allow user to fix later (triggers re-ID)

### 4. Crypto Without Quote Currency

If user just types "BTC":
- Check account currency → `BTC:CAD` or `BTC:USD`
- Or prompt user to select quote currency

### 5. Manual/Private Assets

User creates custom asset not in any market:
- Generate ID as `{symbol}:{account_default_exchange}` or `{symbol}:MANUAL`
- Set `pricing_mode: Manual`

---

## API Changes

### New Endpoints

```
POST /api/assets/resolve
  Body: { symbol, currency?, exchange_mic?, kind_hint? }
  Response: { asset_id, asset, resolution_method, alternatives[] }

GET /api/exchanges
  Response: { exchanges: [{ mic, name, short_name, country, currency }] }

GET /api/exchanges/by-currency/{currency}
  Response: { exchanges: [...] }  // Filtered by currency
```

### Updated Endpoints

```
POST /api/activities
  Body: {
    asset_id?,           // If provided, use directly
    symbol?,             // If provided without asset_id, resolve first
    exchange_mic?,       // Hint for resolution
    ...
  }

POST /api/activities/import
  Body: {
    account_id,
    activities: [...],
    symbol_mappings?: {   // Optional pre-resolved mappings
      "CSV_SYMBOL": "RESOLVED:ID",
      ...
    }
  }
```

---

## Summary

| Path | Current | New |
|------|---------|-----|
| Manual Form | Symbol search → bare ID | Symbol search → ID with exchange |
| Data Grid | Type symbol → bare ID | Type symbol → auto-resolve with exchange |
| CSV Import | Symbol column → bare ID | Symbol column → resolve step → ID with exchange |
| Broker Sync | Broker data → varies | Broker data → consistent `symbol:exchange` |
| Alternative Assets | `PREFIX-random` | `PREFIX:random` (colon separator) |

**Key Changes**:
1. Unified `:` separator for all asset IDs
2. Account-level default exchange setting
3. Asset resolution service for all creation paths
4. CSV import gets asset review step
5. Migration tool for existing assets (optional)
