# Activity Types Reference

This document provides a comprehensive reference for Activity types used in
Wealthfolio. Understanding these types is essential for tracking portfolio
movements and for creating activities programmatically through addons or CSV
imports.

## Overview

Wealthfolio uses a closed set of **14 canonical activity types**. Each activity
type has specific semantics affecting:

- **Cash Balance**: The cash position in the account (by currency)
- **Asset Quantity**: The number of shares/units held
- **Cost Basis**: The original cost of holdings for gain/loss calculations
- **Net Contribution**: Total money contributed to/withdrawn from the portfolio
  (affects TWR performance)

---

## Summary Table

| Type             | Category | Cash Impact          | Holdings Impact   | Cost Basis         | Net Contribution        | Required Asset |
| ---------------- | -------- | -------------------- | ----------------- | ------------------ | ----------------------- | -------------- |
| **BUY**          | Trading  | -(qty × price + fee) | +quantity         | +cost              | No change               | Yes            |
| **SELL**         | Trading  | +(qty × price - fee) | -quantity         | -cost (FIFO)       | No change               | Yes            |
| **SPLIT**        | Trading  | No change            | Adjusted          | Per-share adjusted | No change               | Yes            |
| **DEPOSIT**      | Cash     | +(amount - fee)      | N/A               | N/A                | +amount                 | No             |
| **WITHDRAWAL**   | Cash     | -(amount + fee)      | N/A               | N/A                | -amount                 | No             |
| **TRANSFER_IN**  | Transfer | +amount or +quantity | +quantity (asset) | Preserved/set      | +amount (account scope) | Optional       |
| **TRANSFER_OUT** | Transfer | -amount or -quantity | -quantity (asset) | Removed (FIFO)     | -amount (account scope) | Optional       |
| **DIVIDEND**     | Income   | +(amount - fee)      | No change         | No change          | No change               | Yes            |
| **INTEREST**     | Income   | +(amount - fee)      | No change         | No change          | No change               | Optional       |
| **CREDIT**       | Income   | +(amount - fee)      | No change         | No change          | Depends on subtype      | No             |
| **FEE**          | Charge   | -amount              | No change         | No change          | No change               | Optional       |
| **TAX**          | Charge   | -amount              | No change         | No change          | No change               | Optional       |
| **ADJUSTMENT**   | Other    | Varies               | Varies            | Varies             | No change               | Optional       |
| **UNKNOWN**      | Other    | No auto impact       | No auto impact    | No auto impact     | No change               | Optional       |

---

## Activity Categories

### Trading Activities

#### BUY

**Purpose**: Purchase of a security or other asset.

| Impact               | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Cash**             | Decreases by `(quantity × unit_price) + fee` in activity currency |
| **Holdings**         | Increases quantity; new lot created with cost basis               |
| **Cost Basis**       | Increases by `(quantity × unit_price) + fee`                      |
| **Net Contribution** | No change (internal reallocation of cash to asset)                |

**Required Fields**: `asset`, `quantity`, `unit_price`, `currency` **Optional
Fields**: `fee`, `amount`

**Example**: Buy 10 shares of AAPL at $150 with $5 fee

- Cash: -$1,505 USD
- Holdings: +10 AAPL shares
- Cost Basis: +$1,505

---

#### SELL

**Purpose**: Disposal of a security or other asset.

| Impact               | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Cash**             | Increases by `(quantity × unit_price) - fee` in activity currency |
| **Holdings**         | Decreases quantity; lots reduced using FIFO                       |
| **Cost Basis**       | Decreases by cost basis of sold lots (FIFO matching)              |
| **Net Contribution** | No change (internal reallocation of asset to cash)                |

**Required Fields**: `asset`, `quantity`, `unit_price`, `currency` **Optional
Fields**: `fee`, `amount`

**Note**: Realized gain/loss = proceeds - cost basis of sold lots.

---

#### SPLIT

**Purpose**: Stock split or reverse split adjustment.

| Impact               | Description                                    |
| -------------------- | ---------------------------------------------- |
| **Cash**             | No change                                      |
| **Holdings**         | Quantity adjusted by split ratio               |
| **Cost Basis**       | Per-share cost adjusted (total cost unchanged) |
| **Net Contribution** | No change                                      |

**Required Fields**: `asset`, `quantity` (new total shares) **Optional Fields**:
`metadata.split_ratio` (e.g., "2:1")

**Example**: 2-for-1 split of 100 shares at $200/share

- Before: 100 shares @ $200 = $20,000 cost basis
- After: 200 shares @ $100 = $20,000 cost basis

---

### Cash Activities

#### DEPOSIT

**Purpose**: Incoming funds from outside Wealthfolio (external source).

| Impact               | Description                                            |
| -------------------- | ------------------------------------------------------ |
| **Cash**             | Increases by `amount - fee` in activity currency       |
| **Holdings**         | N/A                                                    |
| **Cost Basis**       | N/A                                                    |
| **Net Contribution** | Increases by `amount` (new capital entering portfolio) |

**Required Fields**: `amount`, `currency` **Optional Fields**: `fee`

**TWR Impact**: External flow - creates a sub-period boundary for TWR
calculation.

---

#### WITHDRAWAL

**Purpose**: Outgoing funds to an external destination.

| Impact               | Description                                       |
| -------------------- | ------------------------------------------------- |
| **Cash**             | Decreases by `amount + fee` in activity currency  |
| **Holdings**         | N/A                                               |
| **Cost Basis**       | N/A                                               |
| **Net Contribution** | Decreases by `amount` (capital leaving portfolio) |

**Required Fields**: `amount`, `currency` **Optional Fields**: `fee`

**TWR Impact**: External flow - creates a sub-period boundary for TWR
calculation.

---

### Transfer Activities

#### TRANSFER_IN

**Purpose**: Move cash or assets into this account.

| Scenario           | Cash Impact | Holdings Impact     | Net Contribution            |
| ------------------ | ----------- | ------------------- | --------------------------- |
| **Cash transfer**  | +amount     | N/A                 | +amount (account scope)     |
| **Asset transfer** | -fee only   | +quantity (new lot) | +cost_basis (account scope) |

**Required Fields**:

- Cash: `amount`, `currency`
- Asset: `asset`, `quantity`, `unit_price`, `currency`

**Optional Fields**: `fee`, `metadata.flow.is_external`

**Flow Behavior**:

| Scope         | `is_external = false` (default)            | `is_external = true` |
| ------------- | ------------------------------------------ | -------------------- |
| **Account**   | +net_contribution                          | +net_contribution    |
| **Portfolio** | No change (nets to zero with TRANSFER_OUT) | +net_contribution    |

**Use Cases**:

- Default: Transfer between Wealthfolio accounts (cost basis preserved)
- External: Adding holdings from outside the portfolio (gifts, inheritance,
  external brokerage)

---

#### TRANSFER_OUT

**Purpose**: Move cash or assets out of this account.

| Scenario           | Cash Impact     | Holdings Impact  | Net Contribution            |
| ------------------ | --------------- | ---------------- | --------------------------- |
| **Cash transfer**  | -(amount + fee) | N/A              | -amount (account scope)     |
| **Asset transfer** | -fee only       | -quantity (FIFO) | -cost_basis (account scope) |

**Required Fields**:

- Cash: `amount`, `currency`
- Asset: `asset`, `quantity`, `currency`

**Optional Fields**: `fee`, `metadata.flow.is_external`

**Flow Behavior**: Same as TRANSFER_IN but with opposite sign.

**Use Cases**:

- Default: Transfer between Wealthfolio accounts
- External: Removing holdings from portfolio (gifts, donations, external
  transfer)

---

### Income Activities

#### DIVIDEND

**Purpose**: Cash dividend paid into the account.

| Impact               | Description                                      |
| -------------------- | ------------------------------------------------ |
| **Cash**             | Increases by `amount - fee` in activity currency |
| **Holdings**         | No change (unless DRIP subtype)                  |
| **Cost Basis**       | No change                                        |
| **Net Contribution** | No change (income, not new capital)              |

**Required Fields**: `asset`, `amount`, `currency` **Optional Fields**: `fee`,
`quantity` (for per-share tracking)

**Subtypes**: See [Dividend Subtypes](#dividend-subtypes) section.

---

#### INTEREST

**Purpose**: Interest earned on cash or fixed-income positions.

| Impact               | Description                                      |
| -------------------- | ------------------------------------------------ |
| **Cash**             | Increases by `amount - fee` in activity currency |
| **Holdings**         | No change (unless STAKING_REWARD subtype)        |
| **Cost Basis**       | No change                                        |
| **Net Contribution** | No change (income, not new capital)              |

**Required Fields**: `amount`, `currency` **Optional Fields**: `asset`, `fee`

**Subtypes**: See [Interest Subtypes](#interest-subtypes) section.

---

#### CREDIT

**Purpose**: Cash-only credit such as refunds, rebates, or bonuses.

| Impact               | Description                                      |
| -------------------- | ------------------------------------------------ |
| **Cash**             | Increases by `amount - fee` in activity currency |
| **Holdings**         | N/A                                              |
| **Cost Basis**       | N/A                                              |
| **Net Contribution** | Depends on subtype (see below)                   |

**Required Fields**: `amount`, `currency` **Optional Fields**: `subtype`

**Net Contribution by Subtype**:

| Subtype   | Net Contribution | Rationale                                   |
| --------- | ---------------- | ------------------------------------------- |
| `BONUS`   | +amount          | New capital (sign-up bonus, referral bonus) |
| `REBATE`  | No change        | Reduced trading cost, not new capital       |
| `REFUND`  | No change        | Reversal of existing fee, not new capital   |
| (default) | No change        | Internal adjustment                         |

---

### Fee & Tax Activities

#### FEE

**Purpose**: Stand-alone brokerage or platform fee not tied to a trade.

| Impact               | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| **Cash**             | Decreases by `amount` (or `fee` field) in activity currency |
| **Holdings**         | No change                                                   |
| **Cost Basis**       | No change                                                   |
| **Net Contribution** | No change                                                   |

**Required Fields**: `amount` or `fee`, `currency` **Optional Fields**: `asset`
(for asset-specific fees)

**Common Subtypes**:

- `MANAGEMENT_FEE`: Advisory/management fee
- `ADR_FEE`: ADR custody fee
- `INTEREST_CHARGE`: Margin interest

---

#### TAX

**Purpose**: Tax paid from the account (withholding, CGT, etc.).

| Impact               | Description                                |
| -------------------- | ------------------------------------------ |
| **Cash**             | Decreases by `amount` in activity currency |
| **Holdings**         | No change                                  |
| **Cost Basis**       | No change                                  |
| **Net Contribution** | No change                                  |

**Required Fields**: `amount`, `currency` **Optional Fields**: `asset` (for
asset-specific taxes)

**Common Subtypes**:

- `WITHHOLDING`: Dividend withholding tax
- `NRA_WITHHOLDING`: Non-resident alien withholding

---

### Other Activities

#### ADJUSTMENT

**Purpose**: Non-trade correction or transformation (usually no cash movement).

| Impact               | Description         |
| -------------------- | ------------------- |
| **Cash**             | Typically no change |
| **Holdings**         | May change          |
| **Cost Basis**       | May change          |
| **Net Contribution** | No change           |

**Required Fields**: Varies by use case **Optional Fields**: `metadata` with
adjustment details

**Use Cases**:

- Option expiring worthless
- Return of capital basis adjustment
- Merger/spinoff compiler input
- Corporate action adjustments

**Note**: This is a flexible type for non-standard corrections. Specific
handling depends on the `subtype` and metadata.

---

#### UNKNOWN

**Purpose**: Unmapped or unrecognized activity type requiring user review.

| Impact  | Description                          |
| ------- | ------------------------------------ |
| **All** | No automatic impact until classified |

**Behavior**: Activities imported with unrecognized types are marked as UNKNOWN
and flagged for review (`needs_review = true`). Users should manually reclassify
using `activity_type_override` or delete these activities.

---

## Subtypes

Subtypes provide semantic variations of activity types without schema changes.
The compiler expands these into canonical activity postings.

### Dividend Subtypes

| Subtype             | Description                                                    | Expansion                   |
| ------------------- | -------------------------------------------------------------- | --------------------------- |
| `DRIP`              | Dividend Reinvestment Plan - dividend automatically reinvested | DIVIDEND + BUY              |
| `QUALIFIED`         | Qualified dividend (tax classification)                        | DIVIDEND (pass-through)     |
| `ORDINARY`          | Ordinary dividend (tax classification)                         | DIVIDEND (pass-through)     |
| `RETURN_OF_CAPITAL` | Return of capital (reduces cost basis)                         | DIVIDEND (special handling) |
| `DIVIDEND_IN_KIND`  | Dividend paid in different asset (e.g., spinoff shares)        | DIVIDEND + TRANSFER_IN      |

#### DRIP Expansion

**Stored Activity**:

```json
{
  "activity_type": "DIVIDEND",
  "subtype": "DRIP",
  "asset": { "id": "AAPL" },
  "amount": 100, // dividend cash amount
  "quantity": 0.5, // shares received
  "unit_price": 200 // reinvestment price
}
```

**Compiled Postings**:

1. **DIVIDEND**: `amount = $100` (income recognition)
2. **BUY**: `quantity = 0.5, unit_price = $200` (share acquisition)

**Net Cash Effect**: ~$0 (dividend received equals purchase cost)

---

#### DIVIDEND_IN_KIND Expansion

**Stored Activity**:

```json
{
  "activity_type": "DIVIDEND",
  "subtype": "DIVIDEND_IN_KIND",
  "asset": { "id": "PARENT_CO" },
  "amount": 250,
  "quantity": 10, // shares of spinoff received
  "unit_price": 25, // FMV at receipt
  "metadata": {
    "received_asset_id": "SPINOFF_CO"
  }
}
```

**Compiled Postings**:

1. **DIVIDEND**: `amount = $250` (income recognition from PARENT_CO)
2. **TRANSFER_IN**: `asset = SPINOFF_CO, quantity = 10, unit_price = $25`
   (receive spinoff shares)

---

### Interest Subtypes

| Subtype            | Description                              | Expansion               |
| ------------------ | ---------------------------------------- | ----------------------- |
| `STAKING_REWARD`   | Crypto staking reward received as tokens | INTEREST + BUY          |
| `LENDING_INTEREST` | Interest from securities lending         | INTEREST (pass-through) |
| `COUPON`           | Bond coupon payment                      | INTEREST (pass-through) |

#### STAKING_REWARD Expansion

**Stored Activity**:

```json
{
  "activity_type": "INTEREST",
  "subtype": "STAKING_REWARD",
  "asset": { "id": "ETH" },
  "quantity": 0.01, // ETH received
  "unit_price": 2000, // FMV at receipt
  "amount": 20 // value = 0.01 * 2000
}
```

**Compiled Postings**:

1. **INTEREST**: `amount = $20` (income recognition)
2. **BUY**: `quantity = 0.01, unit_price = $2000` (token acquisition)

**Net Cash Effect**: $0 (income equals acquisition cost)

---

### Credit Subtypes

| Subtype  | Description                                  | Net Contribution          |
| -------- | -------------------------------------------- | ------------------------- |
| `BONUS`  | Sign-up/referral/promotional bonus           | External flow (+)         |
| `REBATE` | Trading rebate (maker rebate, volume rebate) | Internal flow (no change) |
| `REFUND` | Fee correction/reversal                      | Internal flow (no change) |

---

## Metadata Structure

Activities support a `metadata` JSON field for additional context:

```json
{
  "flow": {
    "is_external": true
  },
  "received_asset_id": "SPINOFF_CO",
  "split_ratio": "2:1",
  "source": {
    "broker": "Schwab",
    "original_type": "REI"
  }
}
```

### Key Metadata Fields

| Field                  | Type    | Used By          | Description                                     |
| ---------------------- | ------- | ---------------- | ----------------------------------------------- |
| `flow.is_external`     | boolean | TRANSFER_IN/OUT  | Marks transfer as crossing portfolio boundary   |
| `received_asset_id`    | string  | DIVIDEND_IN_KIND | Asset ID received (different from paying asset) |
| `split_ratio`          | string  | SPLIT            | Human-readable split ratio (e.g., "2:1")        |
| `source.broker`        | string  | All              | Original broker name                            |
| `source.original_type` | string  | All              | Raw activity type from provider                 |

---

## Activity Status

Each activity has a status that controls whether it affects calculations:

| Status    | Description                           | Affects Calculations |
| --------- | ------------------------------------- | -------------------- |
| `POSTED`  | Finalized activity                    | Yes                  |
| `PENDING` | Awaiting settlement or confirmation   | No                   |
| `DRAFT`   | User-created draft, not yet finalized | No                   |
| `VOID`    | Cancelled or reversed (soft delete)   | No                   |

**Note**: Only `POSTED` activities are compiled and processed by the holdings
calculator.

---

## Activity Type Override

Users can override the activity type using `activity_type_override` without
modifying the original `activity_type`. This is useful for:

- Correcting misclassified imports
- Mapping `UNKNOWN` types to canonical types
- Preserving original provider classification while using correct semantics

The `effective_type()` method returns the override if set, otherwise the
original type.

---

## Activity Type Groups

### Trading Types

```
BUY, SELL, SPLIT
```

### Income Types

```
DIVIDEND, INTEREST
```

### Cash-Only Types (no asset required)

```
DEPOSIT, WITHDRAWAL, INTEREST, TRANSFER_IN, TRANSFER_OUT, TAX, FEE, CREDIT
```

---

## Form Field Requirements

| Type             | Required Fields                                              |
| ---------------- | ------------------------------------------------------------ |
| **BUY**          | Asset, Quantity, Unit Price, Currency                        |
| **SELL**         | Asset, Quantity, Unit Price, Currency                        |
| **DIVIDEND**     | Asset, Amount, Currency                                      |
| **INTEREST**     | Amount, Currency                                             |
| **DEPOSIT**      | Amount, Currency                                             |
| **WITHDRAWAL**   | Amount, Currency                                             |
| **TRANSFER_IN**  | Amount (cash) or Asset+Quantity+Unit Price (asset), Currency |
| **TRANSFER_OUT** | Amount (cash) or Asset+Quantity (asset), Currency            |
| **FEE**          | Amount or Fee, Currency                                      |
| **TAX**          | Amount, Currency                                             |
| **SPLIT**        | Asset, Quantity (new total)                                  |
| **CREDIT**       | Amount, Currency                                             |
| **ADJUSTMENT**   | Varies                                                       |

---

## Workflow Recommendations

### Simple (Holdings-Only)

For quick onboarding when only tracking portfolio value:

1. Use `TRANSFER_IN` with `is_external = true` to add existing positions
2. Use `DEPOSIT` to set initial cash balance
3. Adjust as needed with `TRANSFER_IN/OUT`

### Full (Transaction-Level)

For precise IRR, cash-flow, and tax analytics:

1. Seed account with `DEPOSIT`
2. Record every `BUY`, `SELL`, `DIVIDEND`, `INTEREST`
3. Use `TRANSFER_IN/OUT` for inter-account moves (default internal)
4. Use `TRANSFER_IN/OUT` with `is_external = true` for external moves
5. Log expenses via `FEE` and `TAX`

---

## Best Practices

1. **Use DEPOSIT/WITHDRAWAL for external cash flows** - These properly track net
   contributions for performance calculations.

2. **Use TRANSFER_IN/OUT for inter-account moves** - Default behavior preserves
   cost basis and nets to zero at portfolio level.

3. **Mark external transfers explicitly** - Set
   `metadata.flow.is_external = true` when crossing portfolio boundary.

4. **Use subtypes for semantic variations** - Instead of custom types, use
   subtypes (e.g., DIVIDEND with subtype DRIP).

5. **Include fees in the activity** - Fees are automatically factored into cost
   basis and cash calculations.

6. **Set currency explicitly** - Always specify the activity currency for proper
   multi-currency handling.

7. **Use activity_type_override for corrections** - Preserves original
   classification for audit purposes.
