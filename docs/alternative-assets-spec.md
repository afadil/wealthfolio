# Alternative Assets & Liabilities Design Specification

## Overview

This specification defines the design for tracking alternative assets (properties, vehicles, collectibles, physical precious metals) and liabilities (mortgages, loans, credit cards) in Wealthfolio.

### Goals

1. Enable users to track their complete net worth, not just investment portfolios
2. **Minimize noise** - Alternative assets don't clutter accounts or activities lists
3. Minimize friction for adding and updating valuations
4. Support configurable net worth views
5. Forward-compatible design for future features (liability sync, rental income)

---

## Design Decisions Summary

| Decision | Choice |
|----------|--------|
| Entity Model | **Standalone: Asset + Quotes only (no dedicated account, no activity)** |
| Valuation Storage | Reuse quotes table with Manual data source |
| Liability Model | **Standalone asset; linking is UI-only aggregation via metadata** |
| Liability Tracking | Balance-as-truth (quotes only, no payment activities) |
| Property Detail | Minimal (name + value), purchase info optional |
| Performance Metrics | Value + gain only (no TWR/IRR) |
| Net Worth View | Configurable per-user |
| UX Flow | Quick add + progressive edit |
| Navigation | Extend Holdings page with unified list + filters |
| Asset Types | Curated list + Other catch-all |
| Asset IDs | Prefixed auto-generated (PROP-xxxxx, VEH-xxxxx) |
| Multi-currency | User choice per asset, consistent with securities |
| Performance Calculations | Include in net worth, exclude from returns |
| **Quantity Model** | **Value-based: quantity is always 1, user enters total value** |
| **Numeric Types** | **Decimal strings at all API boundaries** |
| **Liability Sign** | **Store positive magnitude; apply sign at aggregation only** |

### Key Design Principle: No Noise

Alternative assets are fundamentally different from investment accounts:
- They rarely have transactions (maybe annual valuation updates)
- They don't have lots or cost basis complexity
- Users want to see net worth, not manage them like investments

Therefore: **No dedicated accounts, no activities**. Just assets with valuation quotes.

---

## 1. Asset Kinds

### 1.1 New Trackable Asset Kinds

Extend the existing `AssetKind` enum with clear categorization:

```rust
pub enum AssetKind {
    // Existing
    Security,       // Stocks, ETFs, bonds, mutual funds
    Crypto,         // Cryptocurrencies
    Cash,           // Cash positions ($CASH-{CURRENCY})
    FxRate,         // Currency exchange rates (not holdable)
    Option,         // Options contracts
    Commodity,      // Commodity ETFs/futures
    PrivateEquity,  // Private shares, startup equity

    // New/Enhanced for Alternative Assets
    Property,       // Real estate (any type)
    Vehicle,        // Cars, motorcycles, boats, RVs
    Collectible,    // Art, wine, watches, jewelry, memorabilia
    PhysicalPrecious, // Physical gold/silver bars, coins (not ETFs)
    Liability,      // Debts (mortgages, loans, credit cards)
    Other,          // Catch-all for uncategorized assets
}
```

### 1.2 Asset Kind Metadata

Each kind supports optional metadata tags stored in the `metadata` JSON field:

| Kind | Optional Tags | Unit Semantics |
|------|---------------|----------------|
| Property | `property_type`: "residence", "rental", "land", "commercial" | quantity = ownership fraction (typically 1.0, or 0.5 for 50% ownership) |
| Vehicle | `vehicle_type`: "car", "motorcycle", "boat", "rv" | quantity = count (typically 1) |
| Collectible | `collectible_type`: "art", "wine", "watch", "jewelry", "memorabilia" | quantity = count (e.g., 12 bottles of wine) |
| PhysicalPrecious | `metal_type`: "gold", "silver", "platinum", "palladium"; `unit`: "oz", "g", "kg" | quantity = weight in specified unit |
| Liability | `liability_type`: "mortgage", "auto_loan", "student_loan", "credit_card", "personal_loan", "heloc" | quantity = 1 (always) |

---

## 2. Entity Model: Standalone Asset Approach

### 2.1 Core Concept

Alternative assets exist as standalone records in the `assets` table with valuations in the `quotes` table. **No dedicated accounts, no activities.**

```
┌─────────────────────────────────────────────────┐
│ Asset: PROP-a1b2c3d4                            │
│ Kind: Property                                  │
│ Name: "Beach House"                             │
│ Currency: USD                                   │
│ Metadata:                                       │
│   - purchase_price: $400,000                    │
│   - purchase_date: 2020-03-01                   │
├─────────────────────────────────────────────────┤
│ Valuations (quotes table):                      │
│   - 2024-01-15: $450,000                        │
│   - 2023-06-01: $430,000                        │
│   - 2022-01-01: $410,000                        │
│                                                 │
│ Gain: $450,000 - $400,000 = $50,000             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Asset: LIAB-d4e5f6g7                            │
│ Kind: Liability                                 │
│ Name: "Beach House Mortgage"                    │
│ Currency: USD                                   │
│ Metadata:                                       │
│   - liability_type: "mortgage"                  │
│   - linked_asset_id: "PROP-a1b2c3d4"  ← UI-only │
├─────────────────────────────────────────────────┤
│ Valuations (quotes table):                      │
│   - 2024-01-15: $280,000 (current balance)      │
└─────────────────────────────────────────────────┘
```

### 2.2 Asset Creation Flow

When user creates an alternative asset:

1. **Generate unique asset ID**: `{PREFIX}-{nanoid(8)}`
   - `PROP-` for Property
   - `VEH-` for Vehicle
   - `COLL-` for Collectible
   - `PREC-` for PhysicalPrecious
   - `LIAB-` for Liability
   - `ALT-` for Other

2. **Create asset record** with:
   - `id`: Generated prefixed ID
   - `kind`: The asset kind
   - `name`: User-provided name
   - `symbol`: Same as ID (for quote lookups)
   - `currency`: User-selected
   - `pricing_mode`: MANUAL
   - `metadata`: Purchase info, kind-specific fields

3. **Insert initial valuation** as quote in quotes table:
   - `symbol`: Asset ID
   - `data_source`: MANUAL
   - `close`: Current value (user-provided)
   - `date`: Valuation date

**What we DON'T do:**
- ~~Create a dedicated account~~ (no account clutter)
- ~~Create an OPENING_POSITION activity~~ (no activity clutter)
- ~~Track quantity/unit_price~~ (just store the total value)

### 2.3 Liability Linking (UI-Only Aggregation)

**Critical Design Rule**: Liabilities are **standalone assets**. Linking to a financed asset is **metadata for UI presentation only**.

```json
// In liability asset metadata JSON
{
    "liability_type": "mortgage",
    "linked_asset_id": "PROP-a1b2c3d4"  // UI hint only
}
```

**Why UI-Only Linking:**
- Avoids double-counting (liability appears once)
- Net worth calculation is simple: sum all assets - sum all liabilities
- UI can aggregate for display: show property with its linked mortgage indented below
- No complex logic needed

**Link Behavior:**
- Linking is optional metadata stored on the liability
- When linked, UI displays the liability indented under its financed asset
- **Calculations never use the link** - each asset is independent
- Deleting property removes `linked_asset_id` from liability (soft unlink)
- Liability remains as standalone, just becomes "unlinked"

---

## 3. Valuation Model

### 3.1 Quotes Table Contract

Alternative assets reuse the existing `quotes` table with explicit constraints:

**Uniqueness Rule**: `(symbol, data_source, date)` must be unique.

**Query Separation**: Always filter by `data_source`:
- Market quotes: `data_source IN ('YAHOO', 'ALPHA_VANTAGE', ...)`
- Manual valuations: `data_source = 'MANUAL'`

**Symbol Validation**:
- Market symbols: validated against provider APIs
- Manual symbols: must match pattern `^(PROP|VEH|COLL|PREC|LIAB|ALT)-[a-zA-Z0-9]{8}$`

```sql
-- Example: Property valuation
INSERT INTO quotes (id, symbol, data_source, date, close, currency, created_at)
VALUES (
    'quote-uuid',
    'PROP-a1b2c3',      -- Asset ID as symbol
    'MANUAL',           -- Always MANUAL for alt assets
    '2024-01-15',       -- Valuation date
    '450000.00',        -- Current value (DECIMAL as TEXT)
    'USD',
    NOW()
);

-- Index to support efficient queries
CREATE INDEX IF NOT EXISTS idx_quotes_manual_symbol
ON quotes (symbol, date DESC)
WHERE data_source = 'MANUAL';
```

### 3.2 Valuation Update Flow

1. User enters new valuation (current value + date)
2. System inserts new quote record with `data_source = 'MANUAL'`
3. Holdings snapshot recalculates on next refresh
4. Historical valuations preserved for charts

### 3.3 Liability Balance Updates

Same pattern for liabilities:

```sql
INSERT INTO quotes (symbol, data_source, date, close, currency)
VALUES ('LIAB-d4e5f6', 'MANUAL', '2024-01-15', '280000.00', 'USD');
```

**Balance Semantics (Sign Convention - CRITICAL):**

| Layer | Liability Value | Rationale |
|-------|-----------------|-----------|
| quotes.close | **Positive** (280000) | Stored as absolute magnitude |
| Holding.market_value | **Positive** (280000) | Raw value from quote |
| Net Worth Calculation | **Subtract** | `assets - liabilities` |
| UI Display | **Negative** (-$280,000) | Sign applied at display layer |

**Single Source of Truth**: Liabilities are stored as positive magnitudes everywhere. Sign is applied **only** at:
1. Net worth aggregation: `total_assets - total_liabilities`
2. UI display: prepend "-" or show in red

---

## 4. Value Model (No Quantity)

### 4.1 Value-Based Holdings

Alternative assets use a **value-based** model, not a quantity × price model:

| Asset Kind | What User Enters | What Gets Stored |
|------------|------------------|------------------|
| Property | Total value ($500k) | value = $500,000 |
| Property (50% owned) | Their share value ($250k) | value = $250,000 |
| Vehicle | Current value ($45k) | value = $45,000 |
| Collectible | Total value | value = amount |
| PhysicalPrecious | Total value ($20k for 10oz gold) | value = $20,000 |
| Liability | Current balance ($280k) | value = $280,000 |

**Key insight**: Users think "my house is worth $500k" not "1 unit × $500k/unit"

### 4.2 Value Calculation

```
market_value = quote.close   // Direct value, no multiplication

-- Property worth $450,000
-- 50% owned property: user enters $225,000 (their share)
-- 10 oz gold worth $20,000: user enters $20,000 (total value)
```

### 4.3 Quote Interpretation

For alternative assets, `quotes.close` represents the **total current value**:

```sql
-- Property worth $450,000
INSERT INTO quotes (symbol, date, close, currency)
VALUES ('PROP-a1b2c3d4', '2024-01-15', '450000.00', 'USD');

-- 10 oz of gold worth $20,000 total
INSERT INTO quotes (symbol, date, close, currency)
VALUES ('PREC-g1h2i3j4', '2024-01-15', '20000.00', 'USD');

-- Mortgage balance $280,000
INSERT INTO quotes (symbol, date, close, currency)
VALUES ('LIAB-m5n6o7p8', '2024-01-15', '280000.00', 'USD');
```

### 4.4 Advanced Users: Investment Model

For users who want to track precious metals by weight (oz, g) with lot-level cost basis:
- Create a custom security symbol (e.g., "GOLD-OZ")
- Use the standard investment model with quantity × price
- Track using regular buy/sell activities

This keeps the alternative asset model simple while allowing power users full flexibility.

---

## 5. Holdings & Performance

### 5.1 Holdings Calculation

```rust
struct AlternativeAssetHolding {
    asset_id: String,
    account_id: String,
    quantity: Decimal,              // Meaningful for all types
    unit_price: Decimal,            // Latest quote close
    market_value: Decimal,          // quantity × unit_price
    purchase_price: Option<Decimal>, // From asset metadata (per-unit)
    purchase_date: Option<NaiveDate>,
    currency: String,
    gain: Option<Decimal>,          // market_value - (quantity × purchase_price)
    gain_percent: Option<Decimal>,
    valuation_date: NaiveDate,      // Date of the quote used
}
```

### 5.2 Gain Calculation

```
IF purchase_price IS NOT NULL:
    total_cost = quantity × purchase_price
    gain = market_value - total_cost
    gain_percent = (gain / total_cost) × 100
ELSE:
    gain = N/A (display "--")
    gain_percent = N/A
```

**Missing Data Handling:**
- If purchase info missing, show "Gain: —"
- Display CTA: "Add purchase info to see gains"
- No inference from first valuation (would silently lie)

### 5.3 Performance Exclusion

Alternative assets are **excluded** from portfolio performance calculations:

```rust
fn calculate_portfolio_performance(holdings: &[Holding]) -> Performance {
    // Filter to only investment-type assets
    let investment_holdings: Vec<_> = holdings
        .iter()
        .filter(|h| matches!(
            h.asset_kind,
            AssetKind::Security | AssetKind::Crypto | AssetKind::Option |
            AssetKind::Commodity | AssetKind::PrivateEquity
        ))
        .collect();

    // Calculate TWR, IRR, etc. on filtered set only
    compute_returns(&investment_holdings)
}
```

---

## 6. Net Worth Calculation

### 6.1 Components

```
Net Worth = Total Assets - Total Liabilities

Total Assets = Sum of all non-liability holdings' market_value
  - Investments: Securities, Crypto, Options, Commodities, PrivateEquity
  - Real Assets: Property, Vehicle, Collectible, PhysicalPrecious, Other

Total Liabilities = Sum of all Liability holdings' market_value
  - Note: Stored as positive, subtracted in formula
```

### 6.2 As-of-Date Semantics

**Rule**: Net worth at date D uses **latest valuation ≤ D** for each component.

```rust
fn get_valuation_as_of(asset_id: &str, date: NaiveDate) -> Option<Quote> {
    // Get most recent quote on or before the target date
    quotes::table
        .filter(quotes::symbol.eq(asset_id))
        .filter(quotes::data_source.eq("MANUAL"))
        .filter(quotes::date.le(date))
        .order(quotes::date.desc())
        .first()
}
```

**Staleness Handling**:
- UI shows "as of {date}" per line item when valuation is >30 days old
- Warning badge on holdings with valuations >90 days old
- Net worth tooltip shows oldest valuation date in the calculation

### 6.3 Linked Asset/Liability Display

When displaying a property with linked mortgage:

```
Property: Beach House
  Value: $450,000 (as of Jan 15, 2024)
  └─ Mortgage: -$280,000 (as of Dec 31, 2023)  ← Note different dates
  Net Equity: $170,000
```

**Critical**: This is **display-only aggregation**. The actual net worth calculation sums all assets and subtracts all liabilities independently - the link only affects visual grouping.

### 6.4 Configurable Views

Users can configure what's included in their "primary" net worth view:

```rust
struct NetWorthConfig {
    include_investments: bool,      // Default: true
    include_properties: bool,       // Default: true
    include_vehicles: bool,         // Default: true
    include_collectibles: bool,     // Default: true
    include_precious_metals: bool,  // Default: true
    include_other_assets: bool,     // Default: true
    include_liabilities: bool,      // Default: true
}
```

---

## 7. User Interface

### 7.1 Holdings Page Enhancement

**Single Unified List with Filters:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Holdings                                                        │
│                                                                 │
│ [All] [Investments] [Properties] [Vehicles] [Liabilities] ...   │  ← Filter chips
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Assets: $1,245,000    Debts: $320,000    Net Worth: $925,000│ │  ← Summary bar
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ▼ Investments ($650,000)                                        │  ← Collapsible group
│   AAPL         150 shares    $185.00    $27,750    +$5,200      │
│   VTSAX        500 shares    $110.00    $55,000    +$12,000     │
│   ...                                                           │
│                                                                 │
│ ▼ Properties ($520,000)                                         │
│   Beach House  1            --         $450,000    +$50,000     │
│     └─ Mortgage [Debt]      --         -$280,000   --           │  ← UI-grouped liability
│   Rental Condo 1            --         $280,000    N/A          │
│                                                                 │
│ ▼ Vehicles ($75,000)                                            │
│   Tesla M3     1            --         $45,000     -$15,000     │
│   Boat         1            --         $30,000     N/A          │
│                                                                 │
│ ▼ Precious Metals ($20,000)                                     │
│   Gold Bars    10 oz        $2,000     $20,000     +$2,000      │
│                                                                 │
│ ▼ Liabilities (-$40,000)                                        │  ← Unlinked liabilities
│   Credit Card  [Debt]       --         -$8,000     --           │
│   Student Loan [Debt]       --         -$32,000    --           │
└─────────────────────────────────────────────────────────────────┘
```

**Key UI Elements:**
- **Summary bar**: Assets (positive sum), Debts (positive sum of liabilities), Net Worth (assets - debts)
- **Group headers**: Collapsible/expandable by asset kind
- **Default sort**: Value descending within groups
- **Liability display**: Show with "Debt" pill, display as negative in value column
- **Linked liabilities**: Indented under their linked asset for visual grouping only
- **Staleness indicator**: Show "as of" date or warning for old valuations
- **Filter chips**: Stable IDs, persist selection

### 7.2 Quick Add Flow

**Step 1: Quick Add Modal (30 seconds)**

```
┌─────────────────────────────────────────────┐
│ Add Asset                              [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ Type                                        │
│ [Property ▼]                                │
│                                             │
│ Name                                        │
│ [Beach House                    ]           │
│                                             │
│ Currency                                    │
│ [USD ▼]                                     │
│                                             │
│ Quantity                                    │
│ [1                              ]           │  ← Default 1, editable
│                                             │
│ Current Value (total)                       │
│ [$  450,000                     ]           │
│                                             │
│ Value Date                                  │
│ [Jan 15, 2024            📅]                │
│                                             │
│ ☐ I have a mortgage/loan on this            │
│                                             │
│          [Cancel]  [Create Asset]           │
└─────────────────────────────────────────────┘
```

**On Create:**
1. Generate asset ID (PROP-xxxxxxxx)
2. Create account (name: "Beach House", type: PROPERTY, group: "Properties")
3. Create asset record with minimal data
4. Create TRANSFER_IN activity with `subtype: OPENING_POSITION`
5. Insert initial quote (valuation)
6. If mortgage toggle checked → open liability quick-add with `linked_asset_id` pre-filled

**Step 2: Details Sheet (auto-opens)**

```
┌─────────────────────────────────────────────┐
│ Beach House                           [X]   │
├─────────────────────────────────────────────┤
│                                             │
│ Purchase Information (optional)             │
│ ─────────────────────────────────────────── │
│ Purchase Price (total)                      │
│ [$  400,000                     ]           │
│                                             │
│ Purchase Date                               │
│ [Mar 1, 2020             📅]                │
│                                             │
│ Address                                     │
│ [123 Ocean Drive, Miami, FL     ]           │
│                                             │
│ Property Type                               │
│ [Residence ▼]                               │
│                                             │
│ Notes                                       │
│ [                               ]           │
│ [                               ]           │
│                                             │
│                    [Save Details]           │
└─────────────────────────────────────────────┘
```

### 7.3 Precious Metals Quick Add

```
┌─────────────────────────────────────────────┐
│ Add Precious Metal                     [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ Metal Type                                  │
│ [Gold ▼]                                    │
│                                             │
│ Name                                        │
│ [Gold Bars                      ]           │
│                                             │
│ Currency                                    │
│ [USD ▼]                                     │
│                                             │
│ Quantity                   Unit             │
│ [10                 ]      [oz ▼]           │
│                                             │
│ Current Price (per unit)                    │
│ [$  2,000                       ]           │
│                                             │
│ Total Value: $20,000                        │  ← Calculated display
│                                             │
│ Price Date                                  │
│ [Jan 15, 2024            📅]                │
│                                             │
│          [Cancel]  [Create Asset]           │
└─────────────────────────────────────────────┘
```

### 7.4 Liability Quick Add

```
┌─────────────────────────────────────────────┐
│ Add Liability                          [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ Type                                        │
│ [Mortgage ▼]                                │
│                                             │
│ Name                                        │
│ [Beach House Mortgage           ]           │
│                                             │
│ Currency                                    │
│ [USD ▼]                                     │
│                                             │
│ Current Balance                             │
│ [$  280,000                     ]           │
│                                             │
│ Balance Date                                │
│ [Jan 15, 2024            📅]                │
│                                             │
│ Link to Asset (optional)                    │
│ [Beach House (Property) ▼]                  │
│                                             │
│          [Cancel]  [Add Liability]          │
└─────────────────────────────────────────────┘
```

---

## 8. Data Model Changes

### 8.1 Activity Subtype Addition

Add new subtype for opening positions:

```rust
pub enum ActivitySubtype {
    // Existing subtypes...
    DRIP,
    STAKING_REWARD,
    DIVIDEND_IN_KIND,
    STOCK_DIVIDEND,

    // New
    OPENING_POSITION,  // Initial position for manual assets (property, vehicle, etc.)
}
```

### 8.2 Assets Table

No schema changes needed. Existing `metadata` JSON field handles:

```json
// Property metadata example (all monetary values as strings)
{
    "property_type": "residence",
    "address": "123 Ocean Drive, Miami, FL",
    "purchase_price": "400000.00",
    "purchase_date": "2020-03-01",
    "purchase_currency": "USD"
}

// Liability metadata example
{
    "liability_type": "mortgage",
    "linked_asset_id": "PROP-a1b2c3",
    "original_amount": "350000.00",
    "origination_date": "2020-03-01",
    "interest_rate": "3.5"
}

// Physical precious metals metadata
{
    "metal_type": "gold",
    "unit": "oz",
    "purchase_price_per_unit": "1800.00",
    "purchase_date": "2023-06-15"
}
```

### 8.3 Accounts Table

Add new account types:

```rust
pub enum AccountType {
    // Existing
    Securities,
    Cash,
    Crypto,

    // New
    Property,
    Vehicle,
    Collectible,
    Precious,
    Liability,
    Other,
}
```

### 8.4 Account Groups (Defaults)

```rust
fn default_group_for_account_type(account_type: &AccountType) -> &'static str {
    match account_type {
        AccountType::Securities => "Investments",
        AccountType::Cash => "Cash",
        AccountType::Crypto => "Crypto",
        AccountType::Property => "Properties",
        AccountType::Vehicle => "Vehicles",
        AccountType::Collectible => "Collectibles",
        AccountType::Precious => "Precious Metals",
        AccountType::Liability => "Liabilities",
        AccountType::Other => "Other Assets",
    }
}
```

---

## 9. API Design

### 9.1 Create Alternative Asset

**All monetary values use decimal strings for precision.**

```typescript
// POST /api/alternative-assets
interface CreateAlternativeAssetRequest {
    kind: "property" | "vehicle" | "collectible" | "precious" | "liability" | "other";
    name: string;
    currency: string;
    currentValue: string;   // Decimal string - total value
    valueDate: string;      // ISO date

    // Optional enrichment
    purchasePrice?: string;   // Decimal string - for gain calculation
    purchaseDate?: string;
    metadata?: Record<string, string>;  // Kind-specific fields

    // Liability-specific
    linkedAssetId?: string;
}

interface CreateAlternativeAssetResponse {
    assetId: string;      // e.g., "PROP-a1b2c3d4"
    quoteId: string;      // Initial valuation
}
```

### 9.2 Update Valuation

```typescript
// POST /api/alternative-assets/{assetId}/valuations
interface UpdateValuationRequest {
    value: string;        // Decimal string
    date: string;         // ISO date
    notes?: string;
}

interface UpdateValuationResponse {
    quoteId: string;
    valuationDate: string;
    value: string;
}
```

### 9.3 Link/Unlink Liability

```typescript
// POST /api/liabilities/{liabilityId}/link
interface LinkLiabilityRequest {
    targetAssetId: string;  // Property/vehicle to link to (UI-only)
}

// DELETE /api/liabilities/{liabilityId}/link
// Removes linked_asset_id from metadata
```

### 9.4 Get Net Worth

```typescript
// GET /api/net-worth?date={date}
interface NetWorthResponse {
    date: string;
    totalAssets: string;        // Decimal string
    totalLiabilities: string;   // Decimal string (positive)
    netWorth: string;           // Decimal string

    breakdown: {
        investments: string;
        properties: string;
        vehicles: string;
        collectibles: string;
        preciousMetals: string;
        otherAssets: string;
        liabilities: string;    // Positive magnitude
    };

    currency: string;  // Base currency

    // Staleness info
    oldestValuationDate: string;
    staleAssets: string[];  // Asset IDs with valuations >90 days old
}
```

---

## 10. Deletion Lifecycle

### 10.1 Deleting an Alternative Asset

Deletion is a **simple transactional operation**:

```rust
async fn delete_alternative_asset(asset_id: &str) -> Result<()> {
    transaction(|conn| {
        // 1. Unlink any liabilities that reference this asset
        //    (remove linked_asset_id from their metadata)
        diesel::update(assets::table)
            .filter(assets::metadata.like(format!("%\"linked_asset_id\":\"{}\"%", asset_id)))
            .set(assets::metadata.eq(
                // Remove linked_asset_id from metadata JSON
            ))
            .execute(conn)?;

        // 2. Delete all quotes for this asset
        diesel::delete(quotes::table)
            .filter(quotes::symbol.eq(asset_id))
            .filter(quotes::data_source.eq("MANUAL"))
            .execute(conn)?;

        // 3. Delete the asset record
        diesel::delete(assets::table)
            .filter(assets::id.eq(asset_id))
            .execute(conn)?;

        Ok(())
    })
}
```

**Note**: No account or activity deletion needed - alternative assets don't create them.

### 10.2 Soft Unlink on Property Deletion

When a property is deleted and has linked liabilities:

1. Transaction removes `linked_asset_id` from each liability's metadata
2. Liabilities remain in their own accounts (not deleted)
3. UI shows liabilities as standalone in the Liabilities group

### 10.3 Deleting a Liability

Similar pattern:
1. Delete quotes for the liability
2. Delete the opening position activity
3. Delete the liability account
4. Delete the liability asset

No cascading to linked property (liability doesn't own the property).

---

## 11. Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Extend AssetKind enum with new variants
- [ ] Add new AccountType variants
- [ ] Add OPENING_POSITION activity subtype
- [ ] Implement asset ID generation (prefixed nanoid)
- [ ] Add metadata schema validation per kind
- [ ] Implement auto-account creation service
- [ ] Add quotes table index for manual valuations

### Phase 2: Valuation System
- [ ] Implement manual quote insertion with (symbol, data_source, date) uniqueness
- [ ] Add valuation update API with decimal string handling
- [ ] Extend holdings calculator for alt asset kinds
- [ ] Implement gain calculation with N/A handling
- [ ] Add staleness detection (>30 days, >90 days)

### Phase 3: Quantity Support
- [ ] Update holdings calculation for variable quantities
- [ ] Handle property fractional ownership
- [ ] Handle precious metals weight-based holdings
- [ ] Update UI forms for quantity input per kind

### Phase 4: Liability UI-Only Linking
- [ ] Implement link/unlink API (metadata only)
- [ ] Soft unlink on asset deletion
- [ ] UI grouping of linked liabilities under assets

### Phase 5: Net Worth
- [ ] Implement net worth calculation service
- [ ] Add user settings for net worth config
- [ ] Build net worth API endpoint with staleness info
- [ ] Ensure consistent sign handling (store positive, subtract at aggregation)

### Phase 6: Deletion Lifecycle
- [ ] Implement transactional asset deletion
- [ ] Handle liability unlink on property deletion
- [ ] Add cascade warnings in UI

### Phase 7: Frontend - Holdings Enhancement
- [ ] Add filter chips to Holdings page
- [ ] Implement collapsible group headers
- [ ] Add summary bar (Assets, Debts, Net Worth)
- [ ] Handle liability display (Debt pill, negative values)
- [ ] Show linked liabilities indented under assets
- [ ] Add staleness indicators

### Phase 8: Frontend - Add/Edit Flows
- [ ] Build Quick Add modal for alt assets
- [ ] Build Details sheet for enrichment
- [ ] Build Update Valuation modal
- [ ] Build Liability add flow with linking
- [ ] Build Precious Metals add flow with quantity/unit

### Phase 9: Analytics Integration
- [ ] Add net worth widget to Analytics page
- [ ] Add net worth over time chart
- [ ] Ensure performance calcs exclude alt assets

---

## 12. Implementation Architecture

### 12.1 Repository Layer

The `AlternativeAssetRepository` handles complex database operations that require transactional integrity:

```rust
// crates/storage-sqlite/src/assets/alternative_repository.rs

pub struct AlternativeAssetRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl AlternativeAssetRepositoryTrait for AlternativeAssetRepository {
    /// Deletes an alternative asset transactionally:
    /// 1. Unlink any liabilities referencing this asset
    /// 2. Delete all MANUAL quotes
    /// 3. Delete OPENING_POSITION activity
    /// 4. Delete auto-created account
    /// 5. Delete asset record
    async fn delete_alternative_asset(&self, asset_id: &str) -> Result<()>;

    /// Updates asset metadata (for link/unlink operations)
    async fn update_asset_metadata(
        &self,
        asset_id: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<()>;

    /// Finds all liabilities linked to a given asset
    fn find_liabilities_linked_to(&self, linked_asset_id: &str) -> Result<Vec<String>>;
}
```

### 12.2 Tauri Commands

The following Tauri commands are exposed to the frontend:

| Command | Description |
|---------|-------------|
| `create_alternative_asset` | Creates asset + account + opening activity + initial quote |
| `update_alternative_asset_valuation` | Inserts new MANUAL quote |
| `update_alternative_asset_metadata` | Updates asset metadata (purchase info, etc.) |
| `delete_alternative_asset` | Transactional deletion of asset and related records |
| `link_liability` | Links liability to target asset via metadata |
| `unlink_liability` | Removes linked_asset_id from liability metadata |
| `get_net_worth` | Calculates net worth using snapshot-based approach |

### 12.3 Service Context Wiring

```rust
// src-tauri/src/context/providers.rs

let alternative_asset_repository =
    Arc::new(AlternativeAssetRepository::new(pool.clone(), writer.clone()));

Ok(ServiceContext {
    // ... other services ...
    alternative_asset_repository,
})
```

### 12.4 Net Worth Service

The `NetWorthService` uses the snapshot-based valuation approach consistent with the rest of the portfolio system:

```rust
// crates/core/src/portfolio/net_worth/net_worth_service.rs

impl NetWorthService {
    pub async fn get_net_worth(&self, as_of_date: NaiveDate) -> Result<NetWorthResponse> {
        // 1. Get all active accounts
        // 2. Get latest snapshot for each account
        // 3. For each holding in snapshot, get quote <= as_of_date
        // 4. Convert to base currency using FX rates
        // 5. Categorize by asset kind
        // 6. Calculate: net_worth = total_assets - total_liabilities
    }
}
```

---

## 13. Future Considerations (Out of Scope)

The following features are explicitly deferred:

1. **Rental Income Tracking**: Allow INCOME activities linked to Property assets
2. **Liability Payment Activities**: Track payments as activities for amortization history
3. **Liability Sync (Plaid)**: Connect to external sources for mortgage/credit card balances (data model supports this)
4. **Automatic Depreciation**: Vehicle depreciation schedules
5. **Document Attachments**: Attach appraisals, titles, statements to assets
6. **Property Expenses**: Track maintenance, taxes, insurance
7. **Zillow/Redfin Integration**: Auto-fetch property valuations

The data model is designed to support these features when needed.

---

## Appendix A: Asset ID Format

```
Format: {KIND_PREFIX}-{NANOID_8}

Prefixes:
- PROP- : Property
- VEH-  : Vehicle
- COLL- : Collectible
- PREC- : PhysicalPrecious
- LIAB- : Liability
- ALT-  : Other

Examples:
- PROP-a1b2c3d4
- VEH-x9y8z7w6
- LIAB-m5n6o7p8
- PREC-g1h2i3j4

Regex validation: ^(PROP|VEH|COLL|PREC|LIAB|ALT)-[a-zA-Z0-9]{8}$
```

## Appendix B: Quote Symbol Convention

For alternative assets, the quote symbol equals the asset ID:

```sql
-- Uniqueness constraint (may need migration if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_symbol_source_date
ON quotes (symbol, data_source, date);

-- Property valuation
INSERT INTO quotes (symbol, data_source, date, close, currency)
VALUES ('PROP-a1b2c3d4', 'MANUAL', '2024-01-15', '450000.00', 'USD');

-- Liability balance (stored as positive magnitude)
INSERT INTO quotes (symbol, data_source, date, close, currency)
VALUES ('LIAB-m5n6o7p8', 'MANUAL', '2024-01-15', '280000.00', 'USD');

-- Precious metal price per unit
INSERT INTO quotes (symbol, data_source, date, close, currency)
VALUES ('PREC-g1h2i3j4', 'MANUAL', '2024-01-15', '2000.00', 'USD');
```

## Appendix C: Holdings Display Rules

| Asset Kind | Value Source | Quantity Meaning | Gain Calculation | Show in Returns |
|------------|--------------|------------------|------------------|-----------------|
| Security | Latest quote | Shares | Cost basis from lots | Yes |
| Crypto | Latest quote | Units | Cost basis from lots | Yes |
| Property | Latest manual quote | Ownership fraction | purchase_price if set | No |
| Vehicle | Latest manual quote | Count (usually 1) | purchase_price if set | No |
| Collectible | Latest manual quote | Item count | purchase_price if set | No |
| PhysicalPrecious | Latest manual quote | Weight (oz/g/kg) | purchase_price if set | No |
| Liability | Latest manual quote | Always 1 | N/A | No |
| Other | Latest manual quote | Count/fraction | purchase_price if set | No |

## Appendix D: Sign Convention Reference

| Context | Liability Value | Example |
|---------|-----------------|---------|
| `quotes.close` | Positive | 280000.00 |
| `Holding.market_value` | Positive | 280000.00 |
| `NetWorthResponse.totalLiabilities` | Positive | "280000.00" |
| `NetWorthResponse.breakdown.liabilities` | Positive | "280000.00" |
| Net worth formula | Subtracted | assets - liabilities |
| UI Holdings list | Display negative | -$280,000 |
| UI Summary bar "Debts" | Display positive | $280,000 |

**Rule**: Store positive, display as needed, subtract in aggregation. Never double-negate.
