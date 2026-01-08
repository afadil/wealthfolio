# Net Worth History Calculation Design

## Problem Statement

The current net worth history calculation has semantic issues:
1. Portfolio is treated as 0 before first valuation date, inflating "gain"
2. Time-series delta conflates deposits/withdrawals with actual investment gains
3. Frontend cannot distinguish between contribution and gain

## Data Sources

### 1. Portfolio Valuations (TOTAL account)
- Table: `daily_account_valuation` where `account_id = 'TOTAL'`
- Pre-calculated fields:
  - `total_value`: Market value of portfolio (in base currency via `fx_rate_to_base`)
  - `net_contribution`: Cumulative deposits - withdrawals
  - `cost_basis`: Total cost basis
- Investment gain = `total_value - net_contribution`

### 2. Alternative Assets (quotes table)
- Assets with `kind` in: PROPERTY, VEHICLE, COLLECTIBLE, PHYSICAL_PRECIOUS, OTHER
- Value = `close` price (quantity is always 1 for alternative assets)
- No contribution tracking (value-based, not transaction-based)

### 3. Liabilities (quotes table)
- Assets with `kind = LIABILITY`
- Value = `close` price (outstanding balance)
- Reduces net worth

## Calculation Rules

### Rule 1: Date Alignment
- Only emit history points for dates where **portfolio data exists**
- Rationale: Portfolio is the foundation; alternative assets are supplementary
- Edge case: If user has ONLY alternative assets, use first alt asset date

### Rule 2: Forward-Fill
- Portfolio: Carry forward last known value (handles weekends/holidays)
- Alternative assets: Carry forward last known quote
- Liabilities: Carry forward last known balance
- Never inject 0 for missing data

### Rule 3: Contribution Tracking
- `net_contribution` comes from portfolio TOTAL account only
- Alternative assets have no contribution concept (TODO: add purchase_price support)
- Liabilities have no contribution concept

### Rule 4: Gain Calculation (Frontend)
```
portfolioGain = (last.portfolioValue - last.netContribution) - (first.portfolioValue - first.netContribution)
altAssetGain = last.altAssetsValue - first.altAssetsValue
liabilityReduction = first.liabilities - last.liabilities
totalGain = portfolioGain + altAssetGain + liabilityReduction
```

## Data Model

```rust
pub struct NetWorthHistoryPoint {
    pub date: NaiveDate,
    pub currency: String,

    // Components (for detailed breakdown if needed)
    pub portfolio_value: Decimal,        // From TOTAL account total_value
    pub alternative_assets_value: Decimal, // Sum of non-liability alt assets
    pub total_liabilities: Decimal,      // Sum of liability assets

    // Totals
    pub total_assets: Decimal,           // portfolio_value + alternative_assets_value
    pub net_worth: Decimal,              // total_assets - total_liabilities

    // For proper gain calculation
    pub net_contribution: Decimal,       // From TOTAL account net_contribution
}
```

## Algorithm

```
fn get_net_worth_history(start_date, end_date) -> Vec<NetWorthHistoryPoint>:

    # 1. Load portfolio valuations for TOTAL account
    portfolio_valuations = load_total_account_valuations(start_date, end_date)
    portfolio_by_date = { v.date: v for v in portfolio_valuations }

    # 2. Load alternative assets and their quotes
    alt_assets = load_alternative_assets()
    asset_symbols = [a.id for a in alt_assets if a.kind != LIABILITY]
    liability_symbols = [a.id for a in alt_assets if a.kind == LIABILITY]

    # 3. Get quotes in range
    quotes_in_range = load_quotes(alt_assets.ids, start_date, end_date)

    # 4. Get initial values before start_date (for forward-fill)
    initial_values = {}
    for asset in alt_assets:
        if quote = get_latest_quote_as_of(asset.id, start_date):
            initial_values[asset.id] = convert_to_base(quote.close, asset.currency)

    # 5. Determine date range
    if portfolio_by_date.is_empty():
        # Edge case: only alternative assets
        all_dates = sorted(set(q.date for q in quotes_in_range))
    else:
        # Normal case: start from first portfolio date
        portfolio_start = min(portfolio_by_date.keys())
        all_dates = sorted(set(
            [d for d in portfolio_by_date.keys()] +
            [q.date for q in quotes_in_range if q.date >= portfolio_start]
        ))

    # 6. Build history with forward-fill
    current_portfolio = PortfolioState(value=0, contribution=0)  # Will be set on first data
    current_assets = initial_values.copy()
    history = []

    for date in all_dates:
        # Update portfolio if we have data for this date
        if date in portfolio_by_date:
            v = portfolio_by_date[date]
            current_portfolio = PortfolioState(
                value = v.total_value * v.fx_rate_to_base,
                contribution = v.net_contribution
            )

        # Update alt assets if we have quotes for this date
        for quote in quotes_on_date(quotes_in_range, date):
            current_assets[quote.symbol] = convert_to_base(quote.close, quote.currency, date)

        # Compute totals
        alt_assets_value = sum(current_assets[s] for s in asset_symbols if s in current_assets)
        liabilities_value = sum(current_assets[s] for s in liability_symbols if s in current_assets)

        total_assets = current_portfolio.value + alt_assets_value
        net_worth = total_assets - liabilities_value

        history.append(NetWorthHistoryPoint {
            date,
            currency: base_currency,
            portfolio_value: current_portfolio.value,
            alternative_assets_value: alt_assets_value,
            total_liabilities: liabilities_value,
            total_assets,
            net_worth,
            net_contribution: current_portfolio.contribution,
        })

    return history
```

## Edge Cases

| Case | Behavior |
|------|----------|
| No portfolio data, only alt assets | Start from first alt asset quote; `net_contribution = 0` |
| No alt assets, only portfolio | `alternative_assets_value = 0`, `total_liabilities = 0` |
| Gaps in portfolio (weekends) | Forward-fill from last known value |
| Alt asset has no quote in range but has quote before | Use initial value, forward-fill |
| Date range before any data exists | Return empty history |
| Liability only, no positive assets | `net_worth` will be negative |
| Alt asset currency differs from base | Convert using FX rate for that date |

## Test Cases

1. **Basic scenario**: Portfolio + 1 property + 1 liability over 5 days
2. **Portfolio only**: No alternative assets
3. **Alt assets only**: No portfolio (edge case for new users)
4. **Forward-fill**: Alt asset has quote day 1 and day 5, verify days 2-4 use day 1 value
5. **Multi-currency**: Portfolio in USD, property in EUR, verify FX conversion
6. **Gain calculation**: Verify `(end - start)` using contribution-adjusted values
7. **Weekend gaps**: Portfolio has Mon/Tue/Wed/Thu/Fri, verify no gaps
8. **Empty range**: Date range before any data
9. **Single day**: Start = end date
10. **Liability reduction**: Verify mortgage paydown shows as positive contribution to net worth

## Frontend Changes

Update gain calculation in `net-worth-page.tsx`:

```typescript
const { gainLossAmount, gainLossPercent } = useMemo(() => {
  if (!historyData || historyData.length < 2) {
    return { gainLossAmount: 0, gainLossPercent: 0 };
  }

  const first = historyData[0];
  const last = historyData[historyData.length - 1];

  // Portfolio gain (contribution-adjusted)
  const firstPortfolioGain = first.portfolioValue - first.netContribution;
  const lastPortfolioGain = last.portfolioValue - last.netContribution;
  const portfolioGain = lastPortfolioGain - firstPortfolioGain;

  // Alternative asset gain (simple delta, no contributions)
  const altAssetGain = last.alternativeAssetsValue - first.alternativeAssetsValue;

  // Liability reduction (positive = good)
  const liabilityReduction = first.totalLiabilities - last.totalLiabilities;

  // Total gain
  const totalGain = portfolioGain + altAssetGain + liabilityReduction;

  // Percent based on starting position (excluding contributions)
  const startingValue = first.netWorth;
  const percent = startingValue !== 0 ? totalGain / Math.abs(startingValue) : 0;

  return { gainLossAmount: totalGain, gainLossPercent: percent };
}, [historyData]);
```

## Migration Notes

- New fields added to `NetWorthHistoryPoint` - frontend needs update
- Existing behavior changes: gain will be smaller (correct) after fix
- No database migration needed - all data already exists
