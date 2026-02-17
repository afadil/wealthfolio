# Precious Metals Support

Physical precious metals (gold bars, silver coins, etc.) are supported as
`InstrumentType::Metal` assets with optional weight suffixes that scale spot prices
to the actual bar/coin value.

## Symbols

Base symbols: `XAU` (gold), `XAG` (silver), `XPT` (platinum), `XPD` (palladium).

Optional weight suffix appended with a dash:

| Symbol | Weight | Troy oz factor |
|--------|--------|---------------|
| `XAU` | 1 troy oz (default) | 1.0 |
| `XAU-1OZ` | 1 troy oz | 1.0 |
| `XAU-100G` | 100 grams | 3.21507 |
| `XAU-250G` | 250 grams | 8.03768 |
| `XAU-500G` | 500 grams | 16.0754 |
| `XAU-1KG` | 1 kilogram | 32.1507 |

Parsing: `parse_metal_weight_oz()` in `crates/core/src/assets/assets_model.rs`.
Unrecognized suffixes default to 1 troy oz.

## Pricing

Spot prices are fetched for the base metal symbol (e.g., `XAU`) from the Metal Price
API or Yahoo Finance. During sync (`crates/core/src/quotes/sync.rs`), OHLC values
are multiplied by the weight factor:

```rust
let metal_weight = if asset.is_metal() {
    asset.metal_weight_oz()
} else {
    Decimal::ONE
};
// ... fetch quotes ...
for q in &mut quotes {
    q.close *= metal_weight;
    q.open *= metal_weight;
    // etc.
}
```

So `XAU-1KG` quotes are spot gold * 32.1507, representing the value of a 1kg bar.

## Name Enrichment

During profile enrichment (`crates/core/src/assets/assets_service.rs`), the weight
suffix is appended to the provider name:

- `XAU` -> "Gold"
- `XAU-1KG` -> "Gold - 1kg"
- `XAU-500G` -> "Gold - 500g"
- `XAG-1OZ` -> "Silver" (1oz is the default unit, no suffix shown)

## Market Data Providers

| Provider | Capabilities |
|----------|-------------|
| Metal Price API | Spot prices (requires API key). Supports XAU, XAG, XPT, XPD + exotic metals. Free tier: latest only, no historical. |
| Yahoo Finance | Historical + latest. Uses symbols like `GC=F` (gold futures) resolved via the standard Yahoo resolver. |

## Frontend

Precious metals are created through the alternative assets quick-add flow
(`apps/frontend/src/pages/asset/alternative-assets/`). The UI provides:
- Metal type selector (Gold, Silver, Platinum, Palladium)
- Weight unit selector (Troy Ounce, Gram, Kilogram)
- Quantity input

They also work via CSV import with the metal symbol in the symbol column.
