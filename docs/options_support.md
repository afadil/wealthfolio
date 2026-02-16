# Options Support Implementation

## Overview

This document describes the implementation of options contract support (calls and puts) in the portfolio tracker. Options use the OCC (Options Clearing Corporation) symbol format for standardized identification and enable automatic price lookup from Yahoo Finance.

## Database Migration

Created `/src-core/migrations/2026-02-01-000000_add_options_support/up.sql` with columns:
- `underlying_symbol TEXT` - The underlying stock symbol (e.g., AAPL)
- `strike_price TEXT` - Strike price of the option
- `expiration_date TEXT` - Option expiration date (YYYY-MM-DD)
- `option_type TEXT` - CALL or PUT
- `contract_multiplier TEXT` - Shares per contract (default: 100)

## Backend (Rust) Changes

### Activity Types (`src-core/src/activities/activities_constants.rs`)
New activity types for options lifecycle:
- `OPTION_BUY` - Buy to open an option contract
- `OPTION_SELL` - Sell to close an option contract
- `OPTION_EXERCISE` - Exercise a long option
- `OPTION_EXPIRY` - Option expires worthless

Also added:
- `OPTION_ACTIVITY_TYPES` array containing all four types
- Updated `TRADING_ACTIVITY_TYPES` to include option activity types

### Constants (`src-core/src/assets/assets_constants.rs`)
- `OPTION_ASSET_TYPE = "OPTION"`
- `OPTION_TYPE_CALL = "CALL"`
- `OPTION_TYPE_PUT = "PUT"`
- `DEFAULT_OPTION_MULTIPLIER = 100`

### Asset Model (`src-core/src/assets/assets_model.rs`)
Added fields to `Asset`, `NewAsset`, and `AssetDB` structs:
- `underlying_symbol: Option<String>`
- `strike_price: Option<Decimal>`
- `expiration_date: Option<String>`
- `option_type: Option<String>`
- `contract_multiplier: Option<Decimal>`

Added methods:
- `is_option()` - Returns true if asset type is OPTION
- `get_contract_multiplier()` - Returns multiplier (default: 1)
- `new_option_contract()` - Constructor for creating option assets

### OCC Symbol Utility (`src-core/src/utils/occ_symbol.rs`)
New module for parsing and building OCC option symbols.

**OCC Symbol Format (21 characters):**
- Characters 1-6: Root symbol (underlying), left-justified, space-padded
- Characters 7-12: Expiration date (YYMMDD)
- Character 13: Option type (C = Call, P = Put)
- Characters 14-21: Strike price (5 integer + 3 decimal digits)

Example: `AAPL  240119C00195000` means:
- Underlying: AAPL
- Expiration: January 19, 2024
- Type: Call
- Strike: $195.00

Key functions:
- `parse_occ_symbol()` - Parses OCC symbol into components
- `build_occ_symbol()` - Builds OCC symbol from components
- `looks_like_occ_symbol()` - Detects if a string is an OCC symbol

### Holdings Calculator (`src-core/src/portfolio/snapshot/holdings_calculator.rs`)
Updated to handle options:
- Uses `contract_multiplier` in position calculations
- Handles OPTION_BUY, OPTION_SELL, OPTION_EXERCISE, OPTION_EXPIRY activities
- Stores multiplier in position data

### Holdings Model (`src-core/src/portfolio/holdings/holdings_model.rs`)
Added to `Instrument` struct:
- `underlying_symbol: Option<String>`
- `strike_price: Option<Decimal>`
- `expiration_date: Option<String>`
- `option_type: Option<String>`
- `contract_multiplier: Option<Decimal>`

Added to `Holding` struct:
- `contract_multiplier: Decimal` (defaults to 1)

### Holdings Valuation Service (`src-core/src/portfolio/holdings/holdings_valuation_service.rs`)
Updated valuation formula to include contract multiplier:
```
market_value = quantity * price * contract_multiplier
```

### Market Data Service (`src-core/src/market_data/market_data_service.rs`)
- Added `validate_symbol()` function to check if symbol exists on Yahoo Finance
- Options with OCC symbols can be looked up automatically

### Schema (`src-core/src/schema.rs`)
Updated assets table with new option columns.

## Frontend (TypeScript) Changes

### Types (`src/lib/types.ts`)
Added option fields to:
- `Asset` interface
- `AssetProfile` interface
- `Instrument` interface

Fields:
```typescript
underlyingSymbol?: string | null;
strikePrice?: number | null;
expirationDate?: string | null;
optionType?: string | null;
contractMultiplier?: number | null;
```

### Constants (`src/lib/constants.ts`)
Added:
- Activity types: `OPTION_BUY`, `OPTION_SELL`, `OPTION_EXERCISE`, `OPTION_EXPIRY`
- `OPTION_ACTIVITY_TYPES` array
- Updated `TRADING_ACTIVITY_TYPES` to include options
- Added `{ label: "Option", value: "OPTION" }` to `ASSET_SUBCLASS_TYPES`
- Added `ActivityTypeNames` for option types

### Icons (`packages/ui/src/components/ui/icons.tsx`)
Added `Candlestick` icon for options tab.

### Market Data Commands (`src/commands/market-data.ts`)
Added `validateSymbol()` function to verify OCC symbols exist.

### Asset Commands (`src/commands/asset.ts`)
Added option fields to `NewAsset` interface.

### Options Form (`src/pages/activity/components/forms/options-form.tsx`)
New form component with:
- **Activity Types:**
  - Buy to Open
  - Sell to Close
  - Exercise
  - Expiry
- **Option Contract Section:**
  - Underlying Symbol (ticker search)
  - Strike Price
  - Expiration Date picker
  - Option Type (Call/Put radio buttons)
  - Contract Multiplier (default: 100)
- **Trade Details Section:**
  - Contracts (quantity)
  - Premium/Share (for buy/sell)
  - Fee
- **Computed Total:** Shows `quantity * premium * multiplier + fee`

### Schema (`src/pages/activity/components/forms/schemas.ts`)
Added `optionsActivitySchema` with validation for:
- Activity type (OPTION_BUY, OPTION_SELL, OPTION_EXERCISE, OPTION_EXPIRY)
- Underlying symbol (required)
- Strike price (positive number)
- Expiration date (required)
- Option type (CALL or PUT)
- Contract multiplier (default: 100)
- Quantity (contracts)
- Unit price (premium)
- Fee

### Option Validation Dialog (`src/pages/activity/components/option-validation-dialog.tsx`)
Warning dialog shown when OCC symbol cannot be found on Yahoo Finance.
- Allows user to proceed with manual tracking
- Or go back to fix the symbol

### Activity Form (`src/pages/activity/components/activity-form.tsx`)
- Added "Options" tab with Candlestick icon
- Added OCC symbol building logic:
  - Format: `{UNDERLYING}{YYMMDD}{C|P}{strike*1000 padded to 8 digits}`
- Validates OCC symbol via Yahoo Finance
- Creates option asset via `upsertAsset` before creating activity

### Holdings Table (`src/pages/holdings/components/holdings-table.tsx`)
- Shows "contracts" instead of "shares" for options
- Uses underlying symbol for TickerAvatar

### Asset Profile Page (`src/pages/asset/asset-profile-page.tsx`)
- Displays underlying symbol for option avatars
- Calculates average cost accounting for multiplier

### Activity Table (`src/pages/activity/components/activity-table/`)
- Shows underlying symbol for option activities

## Key Design Decisions

### 1. OCC Symbol Format
Options use standardized OCC symbols that:
- Enable automatic price lookup from Yahoo Finance
- Provide unique identification for each contract
- Include all contract details in the symbol itself

### 2. Activity Types
Created four dedicated activity types for options:
- **OPTION_BUY**: Opening a long position (decreases cash)
- **OPTION_SELL**: Closing a position (increases cash)
- **OPTION_EXERCISE**: Converting to underlying shares
- **OPTION_EXPIRY**: Worthless expiration (no cash flow)

### 3. Contract Multiplier
- Default: 100 shares per contract
- Configurable for non-standard contracts
- Applied in all valuation calculations

### 4. Pricing
- Options are quoted per share, not per contract
- Total value = contracts × price × multiplier
- Yahoo Finance provides automatic quotes for US options

### 5. Yahoo Finance Integration
- Automatic validation of OCC symbols
- Real-time pricing for standard US options
- Manual entry fallback for unsupported options

## File Changes Summary

| File | Changes |
|------|---------|
| `src-core/migrations/2026-02-01-000000_add_options_support/up.sql` | New migration |
| `src-core/src/activities/activities_constants.rs` | Option activity types |
| `src-core/src/activities/activities_model.rs` | Import handling |
| `src-core/src/assets/assets_constants.rs` | Option constants |
| `src-core/src/assets/assets_model.rs` | Option fields, methods |
| `src-core/src/utils/occ_symbol.rs` | New OCC symbol parser |
| `src-core/src/schema.rs` | Schema update |
| `src-core/src/portfolio/snapshot/holdings_calculator.rs` | Option position handling |
| `src-core/src/portfolio/holdings/holdings_model.rs` | Instrument/Holding fields |
| `src-core/src/portfolio/holdings/holdings_valuation_service.rs` | Multiplier in valuation |
| `src-core/src/market_data/market_data_service.rs` | Symbol validation |
| `src/lib/types.ts` | TypeScript interfaces |
| `src/lib/constants.ts` | Activity types, asset subclass |
| `src/commands/asset.ts` | NewAsset interface |
| `src/commands/market-data.ts` | validateSymbol function |
| `packages/ui/src/components/ui/icons.tsx` | Candlestick icon |
| `src/pages/activity/components/forms/options-form.tsx` | New form component |
| `src/pages/activity/components/forms/schemas.ts` | Options schema |
| `src/pages/activity/components/option-validation-dialog.tsx` | Validation warning |
| `src/pages/activity/components/activity-form.tsx` | Options tab integration |
| `src/pages/holdings/components/holdings-table.tsx` | Contract display |
| `src/pages/asset/asset-profile-page.tsx` | Option avatar handling |

## CSV Import Support

Options can be imported via CSV with:
- Activity type: OPTION_BUY, OPTION_SELL, OPTION_EXERCISE, OPTION_EXPIRY
- Symbol: OCC format (e.g., AAPL240119C00195000)
- The OCC symbol is automatically parsed to extract:
  - Underlying symbol
  - Strike price
  - Expiration date
  - Option type (Call/Put)

## Testing

1. **Unit tests**: OCC symbol parsing/building tests in `occ_symbol.rs`
2. **Holdings calculator tests**: Option position tracking
3. **Manual testing recommended**:
   - Create option via UI
   - Verify OCC symbol validation
   - Check valuation with multiplier
   - Test exercise and expiry flows
