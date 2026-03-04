# Instrument Types

## Overview

Instrument types classify financial assets for market data routing. They
determine which provider/endpoint is used to fetch quotes and how the asset
behaves during import, display, and portfolio calculations.

The `InstrumentType` enum lives in
`crates/core/src/assets/assets_model.rs` and is serialized as
`SCREAMING_SNAKE_CASE` in JSON and SQLite.

## Canonical Types

| Type     | DB value   | Description                                    | Provider routing                              |
| -------- | ---------- | ---------------------------------------------- | --------------------------------------------- |
| Equity   | `EQUITY`   | Stocks, ETFs, mutual funds, indices            | Yahoo Finance (default)                       |
| Crypto   | `CRYPTO`   | Cryptocurrencies (BTC-USD, ETH-USD)            | Yahoo Finance                                 |
| Fx       | `FX`       | Currency exchange rates                        | Yahoo Finance                                 |
| Option   | `OPTION`   | Options contracts (OCC format)                 | Yahoo Finance                                 |
| Metal    | `METAL`    | Precious metal spot prices (XAU, XAG, XPT)     | Metal Price API                               |
| Bond     | `BOND`     | Fixed-income instruments (bonds, T-bills)       | US Treasury Calc, Börse Frankfurt, OpenFIGI   |

## Alias Normalization

Both the backend (`parse_instrument_type` in `activities_service.rs`) and the
frontend (`normalizeInstrumentType` in `instrument-type.ts`) accept aliases and
normalize them to canonical types. Normalization is case-insensitive and
tolerates whitespace, hyphens, and underscores.

| Canonical | Accepted aliases                                       |
| --------- | ------------------------------------------------------ |
| EQUITY    | `STOCK`, `ETF`, `MUTUALFUND`, `MUTUAL_FUND`, `INDEX`  |
| CRYPTO    | `CRYPTOCURRENCY`                                       |
| FX        | `FOREX`, `CURRENCY`                                    |
| OPTION    | `OPT` (frontend only)                                  |
| METAL     | `COMMODITY`                                            |
| BOND      | `FIXEDINCOME`, `FIXED_INCOME`, `DEBT`                  |

Unrecognized strings return `None` / `undefined` — they do not cause hard
errors during check, but will be flagged as missing during import apply.

## CSV Import

### instrumentType column

The `instrumentType` column is optional. If present, the value is normalized
using the alias table above. The column name is auto-mapped from common
aliases: `instrumentType`, `instrument_type`, `Instrument Type`, `Asset Type`,
`Security Type`.

### Typed symbol prefixes

When no `instrumentType` column is present, the symbol field can carry a type
prefix:

```
bond:US912828ZT58
option:AAPL260918C00200000
crypto:BTC-USD
equity:MSFT
```

The prefix is split from the symbol by `splitInstrumentPrefixedSymbol` and
normalized. If the prefix is unrecognized (e.g., `futures:CL2412`), the entire
string is treated as a plain symbol.

### Precedence during import check

When `check_activities_import` runs, instrument type is resolved in this order:

1. **Explicit value** — the `instrumentType` field on the import row (after
   normalization)
2. **Inferred from symbol + MIC** — `infer_asset_kind` uses the symbol
   pattern, exchange MIC, or explicit `assetKind` input to determine type
3. If neither produces a result, the field remains `None`. The import apply
   step will flag this as an error (`"Instrument type is missing"`).

**Note:** The existing-asset lookup during check enriches `symbol_name` and
`quote_ccy` from a matching asset, but does **not** backfill `instrumentType`.
This means re-importing activities for an existing bond/option without
specifying instrument type will require the type to be set explicitly in the
CSV or via the UI.

## Activity Search Filter

The activities page exposes an `instrumentType` faceted filter. The filter
sends an array of canonical type strings to the `search_activities` endpoint:

```json
{
  "instrumentTypeFilter": ["BOND", "OPTION"]
}
```

The filter options are defined in `apps/frontend/src/lib/constants.ts` as
`INSTRUMENT_TYPE_OPTIONS` and include all six canonical types.

## Key Source Files

| File | Role |
| ---- | ---- |
| `crates/core/src/assets/assets_model.rs` | `InstrumentType` enum definition |
| `crates/core/src/activities/activities_service.rs` | `parse_instrument_type` (backend normalization) |
| `apps/frontend/src/pages/activity/import/utils/instrument-type.ts` | `normalizeInstrumentType`, `splitInstrumentPrefixedSymbol` |
| `apps/frontend/src/lib/constants.ts` | `InstrumentType` const, `INSTRUMENT_TYPE_OPTIONS` |
| `crates/storage-sqlite/src/activities/repository.rs` | `search_activities` with `instrument_type_filter` |
