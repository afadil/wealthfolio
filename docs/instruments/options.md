# Options Support

Options contracts (calls and puts) are first-class instrument types. They use OCC
symbol format for identification and support automatic price lookup from Yahoo Finance.

## Data Model

Options are `InstrumentType::Option` assets. Contract details are stored in
`Asset.metadata.option` as an `OptionSpec`:

```rust
pub struct OptionSpec {
    pub underlying_asset_id: String,
    pub expiration: NaiveDate,
    pub right: String,        // "CALL" or "PUT"
    pub strike: Decimal,
    pub multiplier: Decimal,  // typically 100
    pub occ_symbol: Option<String>,
}
```

Access via `asset.option_spec()` and `asset.contract_multiplier()`.

## OCC Symbol Format

21-character standard: `AAPL  240119C00195000`

| Chars | Meaning |
|-------|---------|
| 1-6   | Root symbol (left-justified, space-padded) |
| 7-12  | Expiration date (YYMMDD) |
| 13    | Option type (C = Call, P = Put) |
| 14-21 | Strike price (5 integer + 3 decimal, no dot) |

Parsing utilities in `crates/core/src/utils/occ_symbol.rs`:
- `parse_occ_symbol()` — OCC string to components
- `build_occ_symbol()` — components to OCC string
- `looks_like_occ_symbol()` — heuristic detection
- `normalize_option_symbol()` — handles Fidelity compact format

## Activity Types

Options reuse standard activity types with subtypes:

| Action | Activity Type | Subtype |
|--------|--------------|---------|
| Buy to open | `BUY` | — |
| Sell to close | `SELL` | — |
| Exercise | `SELL` | `OPTION_EXERCISE` |
| Expire worthless | `ADJUSTMENT` | `OPTION_EXPIRY` |

Subtypes are defined in `crates/core/src/activities/activities_constants.rs`.

## Valuation

Options are quoted per share; the contract multiplier scales to true value:

```
market_value = quantity * price * contract_multiplier
```

The holdings calculator (`crates/core/src/portfolio/snapshot/holdings_calculator.rs`)
caches `(currency, is_alternative, contract_multiplier)` per asset and applies the
multiplier to both lot cost basis and cash flows.

## Frontend

Options are integrated into existing buy/sell forms via an `assetType` discriminator
(not separate forms). Key components:

- `apps/frontend/src/pages/activity/components/forms/fields/option-contract-fields.tsx`
  — Underlying symbol search, strike, expiration, call/put, multiplier fields.
  Auto-fills from pasted OCC symbols.
- `apps/frontend/src/pages/activity/components/forms/exercise-form.tsx` — Exercise flow
- `apps/frontend/src/pages/activity/components/forms/expiry-form.tsx` — Expiry flow
- `apps/frontend/src/pages/activity/config/activity-form-config.ts` — Routes `EXERCISE`
  and `EXPIRY` picker types to the correct forms, mapping to `SELL`/`ADJUSTMENT` +
  subtypes for the backend.

## CSV Import

OCC symbols in the `symbol` column are auto-detected and parsed. The import extracts
underlying, strike, expiration, and option type from the symbol. CUSIP-format option
identifiers and Fidelity compact format are normalized to standard OCC.
