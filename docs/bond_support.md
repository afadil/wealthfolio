# Bond Support Implementation

## Overview

This document describes the implementation of global bond support (EU, UK, US) in the portfolio tracker, following patterns established for options support.

## Database Migration

Created `/src-core/migrations/2026-02-03-000000_add_bond_support/up.sql` with columns:
- `maturity_date TEXT` - Bond maturity date (YYYY-MM-DD)
- `coupon_rate TEXT` - Annual coupon rate as percentage (e.g., 5.25)
- `face_value TEXT` - Par/face value (default: 1000)
- `coupon_frequency TEXT` - ANNUAL, SEMI_ANNUAL, QUARTERLY, MONTHLY

## Backend (Rust) Changes

### Constants (`src-core/src/assets/assets_constants.rs`)
- `BOND_ASSET_TYPE = "BOND"`
- `DEFAULT_BOND_FACE_VALUE = 1000`
- Coupon frequency constants: `COUPON_FREQUENCY_ANNUAL`, `COUPON_FREQUENCY_SEMI_ANNUAL`, `COUPON_FREQUENCY_QUARTERLY`, `COUPON_FREQUENCY_MONTHLY`

### Asset Model (`src-core/src/assets/assets_model.rs`)
- Added bond fields to `Asset`, `NewAsset`, and `AssetDB` structs:
  - `maturity_date: Option<String>`
  - `coupon_rate: Option<Decimal>`
  - `face_value: Option<Decimal>`
  - `coupon_frequency: Option<String>`
- Added `is_bond()` method to `Asset`
- Added `get_face_value()` method (defaults to 1000)
- Added `new_bond()` constructor to `NewAsset`

### Schema (`src-core/src/schema.rs`)
- Updated assets table definition with new columns

### Holdings Model (`src-core/src/portfolio/holdings/holdings_model.rs`)
- Added bond fields to `Instrument` struct

### Holdings Service (`src-core/src/portfolio/holdings/holdings_service.rs`)
- Updated instrument creation to include bond fields when building holdings

## Frontend (TypeScript) Changes

### Types (`src/lib/types.ts`)
Added bond fields to:
- `Asset` interface
- `AssetProfile` interface
- `Instrument` interface

Fields added:
```typescript
maturityDate?: string | null;
couponRate?: number | null;
faceValue?: number | null;
couponFrequency?: string | null;
```

### Asset Commands (`src/commands/asset.ts`)
Added bond fields to `NewAsset` interface (as strings for API compatibility)

### Constants (`src/lib/constants.ts`)
Added `{ label: "Bond", value: "BOND" }` to `ASSET_SUBCLASS_TYPES`

### Icons (`packages/ui/src/components/ui/icons.tsx`)
Added `Landmark` icon from lucide-react for bonds tab

### Bond Form (`src/pages/activity/components/forms/bond-form.tsx`)
New form component for bond transactions with:
- **Bond Details Section:**
  - Symbol/ISIN input
  - Name (optional)
  - Maturity Date picker
  - Face Value (default: 1000)
  - Coupon Rate (%)
  - Coupon Frequency selector
- **Trade Details Section:**
  - Quantity
  - Price (% of par)
  - Fee
- **Computed Total:** Shows calculated value using bond pricing formula

### Schema (`src/pages/activity/components/forms/schemas.ts`)
- Added `bondActivitySchema` for bond form validation
- Added `combinedActivitySchema` union to handle both regular and bond activities
- Bond schema uses `isBond: z.literal(true)` as discriminator

### Activity Form (`src/pages/activity/components/activity-form.tsx`)
- Added "Bonds" tab with Landmark icon (7 columns total now)
- Added `BondForm` component to tab content
- Added bond handling in `onSubmit`:
  - Detects bond activities via `bondSymbol` and `isBond` fields
  - Creates bond asset via `upsertAsset` before creating activity
  - Sets asset type to "BOND", asset class to "FIXED_INCOME"

### Holdings Table (`src/pages/holdings/components/holdings-table.tsx`)
Updated quantity column to show appropriate unit labels:
- "contracts" for options
- "bonds" for bonds
- "shares" for stocks

## Key Design Decisions

### 1. Activity Types
**Decision:** Reuse existing types
- `BUY` / `SELL` for bond transactions
- `INTEREST` for coupon payments (already exists, semantically correct)

Unlike options, bonds don't have unique lifecycle events (exercise, expiry) that require new activity types.

### 2. Bond Pricing
Bond prices are quoted as **percentage of par** (e.g., 98.5 = 98.5% of face value).

**Valuation formula:**
```
market_value = quantity * (quoted_price / 100) * face_value
```

### 3. Data Source
**Phase 1:** Manual entry with MANUAL data source
- No automatic price lookup initially
- Users enter bond prices manually

**Future phases could add:**
- OpenFIGI for ISIN validation
- Finnhub for US corporate bond prices
- FinanceFlowAPI for government bond yields

### 4. Accrued Interest
**Decision:** Include in total transaction price, note breakdown in `comment` field
- Example comment: "Price: 98.5%, Accrued interest: $12.50"
- No new fields needed on Activity model
- Keeps implementation simple

### 5. Coupon Payments
**Decision:** Record as `INTEREST` activity when received
- Via CSV import or manual entry
- No forecasting/scheduling of expected payments
- Existing income tracking infrastructure handles this

## CSV Import Support

Bonds can be imported via CSV with these optional bond-specific columns:
- `maturityDate` - Bond maturity date (YYYY-MM-DD format)
- `couponRate` - Annual coupon rate as percentage (e.g., 5.25)
- `faceValue` - Par/face value (defaults to 1000 if not specified)
- `couponFrequency` - Payment frequency: `ANNUAL`, `SEMI_ANNUAL`, `QUARTERLY`, or `MONTHLY`

When any of these fields are present in an import, the system:
1. Automatically detects it as a bond import
2. Creates a bond asset with the appropriate fields
3. Sets asset type to `BOND` and asset class to `FIXED_INCOME`

**Example CSV columns:**
```
date,activityType,symbol,quantity,unitPrice,currency,maturityDate,couponRate,faceValue,couponFrequency
2024-01-15,BUY,US912828ZT42,10,98.5,USD,2034-01-15,4.25,1000,SEMI_ANNUAL
```

## File Changes Summary

| File | Changes |
|------|---------|
| `src-core/migrations/2026-02-03-000000_add_bond_support/up.sql` | New migration |
| `src-core/src/assets/assets_constants.rs` | Bond constants |
| `src-core/src/assets/assets_model.rs` | Bond fields, methods |
| `src-core/src/schema.rs` | Schema update |
| `src-core/src/portfolio/holdings/holdings_model.rs` | Instrument fields |
| `src-core/src/portfolio/holdings/holdings_service.rs` | Instrument creation |
| `src-core/src/activities/activities_model.rs` | Bond fields in ActivityImport |
| `src-core/src/activities/activities_service.rs` | Bond detection and asset creation |
| `src/lib/types.ts` | TypeScript interfaces |
| `src/lib/schemas.ts` | Bond fields in importActivitySchema |
| `src/lib/constants.ts` | Asset subclass types |
| `src/commands/asset.ts` | NewAsset interface |
| `packages/ui/src/components/ui/icons.tsx` | Landmark icon |
| `src/pages/activity/components/forms/bond-form.tsx` | New form component |
| `src/pages/activity/components/forms/schemas.ts` | Bond schema |
| `src/pages/activity/components/activity-form.tsx` | Bond tab integration |
| `src/pages/holdings/components/holdings-table.tsx` | Quantity labels |

## Testing

1. **Unit tests**: All 76 Rust tests pass
2. **Type checking**: TypeScript compiles without errors
3. **Manual testing recommended**:
   - Create bond via UI
   - Buy activity -> verify holding value
   - Verify portfolio totals include bonds correctly
   - Import bonds via CSV with bond-specific fields
   - Verify imported bonds have correct maturity, coupon, and face value
