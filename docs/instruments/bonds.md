# Bond Support

Bonds (corporate, government, treasury) are first-class instrument types identified
by ISIN. Prices follow the percentage-of-par convention used in fixed income markets.

## Data Model

Bonds are `InstrumentType::Bond` assets. Bond details are stored in
`Asset.metadata.bond` as a `BondSpec`:

```rust
pub struct BondSpec {
    pub maturity_date: Option<NaiveDate>,
    pub coupon_rate: Option<Decimal>,
    pub face_value: Option<Decimal>,         // typically 1000
    pub coupon_frequency: Option<String>,    // ANNUAL, SEMI_ANNUAL, QUARTERLY, MONTHLY
    pub isin: Option<String>,
}
```

Access via `asset.bond_spec()` and `asset.is_bond()`.

## Pricing Convention

Bond prices are stored as **decimal fractions of par** (0-1 range):

- 97.025% of par is stored as `0.97025`
- 100% of par is stored as `1.0`

Users enter prices as percentages on the frontend; the entry boundary divides by 100.
All providers convert to this convention before returning quotes.

## Market Data Providers

Three providers handle bonds, registered in `crates/core/src/quotes/client.rs`:

| Provider | Priority | Capabilities | Coverage |
|----------|----------|-------------|----------|
| US Treasury Calc | 10 | Pricing only | US Treasuries (ISIN prefix `US912`) |
| Boerse Frankfurt | 15 | Pricing + profiles | European bonds, some US corporates |
| OpenFIGI | 5 | Profiles only | Global (any ISIN) |

**Pricing flow:** The resolver (`crates/market-data/src/resolver/rules_resolver.rs`)
passes the ISIN through to each provider. US Treasury Calc is skipped for non-`US912`
ISINs. Providers are tried in priority order until one succeeds.

**Profile flow (name enrichment):** Boerse Frankfurt is tried first (nice European
names like "Nestl&eacute; Finance International Ltd. 1,5% 20/30"), then OpenFIGI as
fallback (US corporates like "JPMORGAN CHASE & CO - JPM V2.069 06/01/29").

### US Treasury Calc

`crates/market-data/src/provider/us_treasury_calc/mod.rs`

Computes bond present value from Treasury.gov yield curve data. Fetches daily XML
yield curves, interpolates to the bond's remaining maturity, and discounts coupon
payments + principal. Handles both coupon bonds (PV of cash flows) and zero-coupon
T-bills (simple discount). Requires `BondQuoteMetadata` (coupon rate, maturity,
face value, frequency) in the `QuoteContext`.

### Boerse Frankfurt

`crates/market-data/src/provider/boerse_frankfurt/mod.rs`

Fetches bond price history from Deutsche Boerse's live API (XFRA exchange). Uses a
salt scraped from the frontend JS bundle to compute per-request auth headers. Also
provides profile data (instrument names) via the `instrument_information` endpoint.

### OpenFIGI

`crates/market-data/src/provider/openfigi/mod.rs`

Profile-only provider. POSTs to `api.openfigi.com/v3/mapping` with an ISIN, returns
issuer name + ticker in format `"{name} - {ticker}"`. Free, no API key, 25 req/min
rate limit.

## Provider Pinning

On first successful price sync, the winning provider is saved to
`asset.provider_config.preferred_provider`. Subsequent syncs skip the trial-and-error
and go directly to the pinned provider. See `crates/core/src/quotes/sync.rs`.

## Name Enrichment

During sync, if a bond's name is still a placeholder (name == ISIN), the sync service
calls `get_profile()` to fetch a real name from Boerse Frankfurt or OpenFIGI, then
persists it via `update_name()`. See `crates/core/src/quotes/sync.rs`.

## ISIN and CUSIP Utilities

- `crates/core/src/utils/isin.rs` — `parse_isin()` (full Luhn validation),
  `looks_like_isin()` (format-only heuristic)
- `crates/core/src/utils/cusip.rs` — `parse_cusip()` (9-char Luhn validation),
  `cusip_to_isin()` (e.g., `912810TH1` -> `US912810TH14`)

## Activity Types

Bonds reuse standard types:

| Action | Activity Type |
|--------|--------------|
| Buy | `BUY` |
| Sell | `SELL` |
| Coupon payment | `INTEREST` |

## CSV Import

Bonds are detected during CSV import by:
1. Explicit type hint (`BOND` or `FIXED_INCOME` in a type column)
2. ISIN detection via Luhn validation on the symbol

CUSIP symbols are automatically converted to ISINs (with `US` country prefix).
Bond metadata (`BondSpec`) is created with the ISIN; coupon/maturity details can
be added later via the asset edit sheet.

## Frontend

Bond fields are integrated into the buy/sell forms via the `assetType` discriminator,
with labels that adapt ("Face Value" / "Price % of Par" instead of "Shares" / "Price").
Bond-specific fields in `apps/frontend/src/pages/activity/components/forms/fields/`.
