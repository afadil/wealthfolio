# FX Rate Conversion Logic

This document explains how the `fx_rate` field on activities is used for currency conversions in the holdings calculator.

## The Three Currency Levels

When processing an activity, there are three currencies involved:

1. **Activity Currency** - The currency the user entered the transaction in
2. **Account Currency** - The account's base currency (e.g., your CAD brokerage account)
3. **Position Currency** - The asset's listing currency (e.g., AAPL trades in USD)

## The fx_rate Field

The `fx_rate` field on an activity is a single number that serves different purposes depending on the currency context. Its meaning is contextual:

- **If activity currency ≠ account currency**: fx_rate converts activity → account
- **If activity currency == account currency**: fx_rate converts activity → position (since no account conversion is needed)

## When Can fx_rate Be Used for Position Currency Conversion?

The holdings calculator needs to convert activity values to the position's currency for cost basis tracking. The `fx_rate` can only be used in specific scenarios:

### Case 1: Position Currency == Account Currency

```
Activity: USD → Position: CAD → Account: CAD
          fx_rate converts here ←――――――――――┘
```

**Example**: Buy SHOP (CAD stock) in a CAD account, entering price in USD
- fx_rate = 1.35 (USD → CAD)
- Since position and account are the same (CAD), fx_rate works for both conversions

### Case 2: Activity Currency == Account Currency

```
Activity: CAD → Position: USD
          └―――→ fx_rate converts here
Account: CAD (no conversion needed)
```

**Example**: Buy AAPL (USD stock) in a CAD account, entering price in CAD
- fx_rate = 0.75 (CAD → USD)
- Since activity == account, no account conversion is needed
- The fx_rate must be for converting to position currency

### Case 3: All Three Currencies Differ (CANNOT Use fx_rate)

```
Activity: USD → Position: EUR ← Need this conversion
          └―――→ Account: CAD  ← fx_rate gives this
```

**Example**: Buy BMW (EUR stock) in a CAD account, entering price in USD
- fx_rate = 1.35 (USD → CAD)
- But we need USD → EUR for position, not USD → CAD
- **Must use FxService** - fx_rate cannot be used here

## Implementation

The logic in `convert_activity_to_position_currency()`:

```rust
let can_use_fx_rate = position.currency == account_currency
    || activity.currency == account_currency;
```

This ensures fx_rate is only used when it actually converts to the target currency we need. When `can_use_fx_rate` is false, the system falls back to the FxService to get the correct exchange rate.

## Summary Table

| Activity Currency | Account Currency | Position Currency | fx_rate Used For |
|-------------------|------------------|-------------------|------------------|
| USD | CAD | CAD | Activity → Account/Position (same) |
| CAD | CAD | USD | Activity → Position |
| USD | CAD | EUR | Cannot use - falls back to FxService |
| USD | USD | USD | No conversion needed |
