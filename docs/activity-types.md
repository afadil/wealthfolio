# Activity Types Reference

This document describes the canonical activity types supported by Wealthfolio, their purpose, and their impact on portfolio calculations.

## Overview

Wealthfolio uses a closed set of 14 canonical activity types. Each activity type has specific semantics for how it affects:
- **Cash Balance**: The cash position in the account
- **Asset Quantity**: The number of shares/units held
- **Cost Basis**: The original cost of holdings for gain/loss calculations
- **Net Contribution**: Total money contributed to/withdrawn from the portfolio

## Activity Types

### Trading Activities

#### BUY
**Purpose**: Purchase of a security or other asset.

| Field | Impact |
|-------|--------|
| Cash | Decreases by `(quantity × unit_price) + fee` |
| Quantity | Increases by `quantity` |
| Cost Basis | Increases by `(quantity × unit_price) + fee` |
| Net Contribution | No change (internal reallocation) |

**Required Fields**: `asset_id`, `quantity`, `unit_price`, `currency`
**Optional Fields**: `fee`, `amount`

---

#### SELL
**Purpose**: Disposal of a security or other asset.

| Field | Impact |
|-------|--------|
| Cash | Increases by `(quantity × unit_price) - fee` |
| Quantity | Decreases by `quantity` |
| Cost Basis | Decreases (FIFO lot matching) |
| Net Contribution | No change (internal reallocation) |

**Required Fields**: `asset_id`, `quantity`, `unit_price`, `currency`
**Optional Fields**: `fee`, `amount`

**Note**: Realized gain/loss is calculated as proceeds minus cost basis of sold lots.

---

#### SPLIT
**Purpose**: Stock split or reverse split adjustment.

| Field | Impact |
|-------|--------|
| Cash | No change |
| Quantity | Adjusted by split ratio |
| Cost Basis | Per-share cost adjusted (total unchanged) |
| Net Contribution | No change |

**Required Fields**: `asset_id`, `quantity` (new total shares)
**Optional Fields**: None typically needed

**Example**: A 2-for-1 split doubles quantity and halves per-share cost basis.

---

### Cash Activities

#### DEPOSIT
**Purpose**: Incoming funds from outside Wealthfolio (external source).

| Field | Impact |
|-------|--------|
| Cash | Increases by `amount` |
| Quantity | N/A |
| Cost Basis | N/A |
| Net Contribution | Increases by `amount` |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `fee`

---

#### WITHDRAWAL
**Purpose**: Outgoing funds to an external destination.

| Field | Impact |
|-------|--------|
| Cash | Decreases by `amount + fee` |
| Quantity | N/A |
| Cost Basis | N/A |
| Net Contribution | Decreases by `amount` |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `fee`

---

#### TRANSFER_IN
**Purpose**: Move cash or assets into this account.

| Field | Impact (Internal) | Impact (External) |
|-------|-------------------|-------------------|
| Cash | Increases | Increases |
| Quantity | Increases (if asset) | Increases (if asset) |
| Cost Basis | Preserved from source | Set from `unit_price` |
| Net Contribution | No change | Increases |

**Required Fields**: `amount` (cash) or `asset_id`, `quantity`, `unit_price` (asset), `currency`
**Optional Fields**: `fee`, `metadata.flow.is_external`

**Behavior**:
- **Default (internal)**: Transfer between Wealthfolio accounts. No net contribution impact.
- **External** (`metadata.flow.is_external = true`): Transfer from untracked source. Affects net contribution. Used for:
  - Adding initial holdings
  - Gifts or inheritance received
  - Transfers from external brokerages

---

#### TRANSFER_OUT
**Purpose**: Move cash or assets out of this account.

| Field | Impact (Internal) | Impact (External) |
|-------|-------------------|-------------------|
| Cash | Decreases | Decreases |
| Quantity | Decreases (if asset) | Decreases (if asset) |
| Cost Basis | Exported to destination | Removed (FIFO) |
| Net Contribution | No change | Decreases |

**Required Fields**: `amount` (cash) or `asset_id`, `quantity` (asset), `currency`
**Optional Fields**: `fee`, `metadata.flow.is_external`

**Behavior**:
- **Default (internal)**: Transfer between Wealthfolio accounts. No net contribution impact.
- **External** (`metadata.flow.is_external = true`): Transfer to untracked destination. Affects net contribution. Used for:
  - Removing holdings (gifts, donations)
  - Transfers to external brokerages
  - Write-offs

---

### Income Activities

#### DIVIDEND
**Purpose**: Cash dividend paid into the account.

| Field | Impact |
|-------|--------|
| Cash | Increases by `amount` |
| Quantity | No change |
| Cost Basis | No change |
| Net Contribution | No change |

**Required Fields**: `asset_id`, `amount`, `currency`
**Optional Fields**: `fee`, `quantity` (for per-share tracking)

**Subtypes**:
- `DRIP`: Dividend reinvested (expands to DIVIDEND + BUY)
- `QUALIFIED`: Qualified dividend (tax classification)
- `ORDINARY`: Ordinary dividend (tax classification)
- `RETURN_OF_CAPITAL`: Return of capital (reduces cost basis)
- `DIVIDEND_IN_KIND`: Dividend paid in different asset (expands to DIVIDEND + TRANSFER_IN)

---

#### INTEREST
**Purpose**: Interest earned on cash or fixed-income positions.

| Field | Impact |
|-------|--------|
| Cash | Increases by `amount` |
| Quantity | No change |
| Cost Basis | No change |
| Net Contribution | No change |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `asset_id`, `fee`

**Subtypes**:
- `STAKING_REWARD`: Crypto staking reward (may expand to INTEREST + BUY)
- `LENDING_INTEREST`: Interest from securities lending
- `COUPON`: Bond coupon payment

---

### Fee & Tax Activities

#### FEE
**Purpose**: Stand-alone brokerage or platform fee not tied to a trade.

| Field | Impact |
|-------|--------|
| Cash | Decreases by `amount` |
| Quantity | No change |
| Cost Basis | No change |
| Net Contribution | No change |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `asset_id`

**Subtypes**:
- `MANAGEMENT_FEE`: Advisory/management fee
- `ADR_FEE`: ADR custody fee
- `INTEREST_CHARGE`: Margin interest

---

#### TAX
**Purpose**: Tax paid from the account (withholding, CGT, etc.).

| Field | Impact |
|-------|--------|
| Cash | Decreases by `amount` |
| Quantity | No change |
| Cost Basis | No change |
| Net Contribution | No change |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `asset_id`

**Subtypes**:
- `WITHHOLDING`: Dividend withholding tax
- `NRA_WITHHOLDING`: Non-resident alien withholding

---

### Other Activities

#### CREDIT
**Purpose**: Cash-only credit such as refunds, rebates, or bonuses.

| Field | Impact |
|-------|--------|
| Cash | Increases by `amount` |
| Quantity | N/A |
| Cost Basis | N/A |
| Net Contribution | No change (default) |

**Required Fields**: `amount`, `currency`
**Optional Fields**: `metadata.flow.is_external`

**Note**: If `metadata.flow.is_external = true`, affects net contribution (treated as external deposit).

**Subtypes**:
- `FEE_REFUND`: Fee refund
- `TAX_REFUND`: Tax refund
- `BONUS`: Account bonus
- `REBATE`: Rebate payment
- `REVERSAL`: Transaction reversal

---

#### ADJUSTMENT
**Purpose**: Non-trade correction or transformation (usually no cash movement).

| Field | Impact |
|-------|--------|
| Cash | Typically no change |
| Quantity | May change |
| Cost Basis | May change |
| Net Contribution | Typically no change |

**Required Fields**: Varies by use case
**Optional Fields**: `metadata` with adjustment details

**Use Cases**:
- Option expiring worthless
- Return of capital basis adjustment
- Merger/spinoff compiler input
- Corporate action adjustments

**Note**: This is a flexible type for non-standard corrections. Specific handling depends on the `subtype` and metadata.

---

#### UNKNOWN
**Purpose**: Unmapped or unrecognized activity type requiring user review.

| Field | Impact |
|-------|--------|
| All | No automatic impact |

**Note**: Activities imported with unrecognized types are marked as UNKNOWN and flagged for review. Users should manually classify or delete these activities.

---

## Metadata Structure

Activities support a `metadata` JSON field for additional context:

```json
{
  "flow": {
    "is_external": true  // Marks transfer as external (affects net_contribution)
  },
  "received_asset_id": "SPINOFF_CO",  // For DIVIDEND_IN_KIND subtype
  "split_ratio": "2:1",  // For SPLIT activities
  "source": {
    "broker": "Schwab",
    "original_type": "REI"
  }
}
```

## Activity Status

Each activity has a status:

| Status | Description |
|--------|-------------|
| `POSTED` | Finalized activity affecting calculations |
| `PENDING` | Awaiting settlement or confirmation |
| `DRAFT` | User-created draft, not yet finalized |
| `VOID` | Cancelled or reversed (excluded from calculations) |

## Best Practices

1. **Use DEPOSIT/WITHDRAWAL for external cash flows** - These properly track net contributions for performance calculations.

2. **Use TRANSFER_IN/OUT with `is_external=true` for adding/removing holdings** - This replaces the legacy ADD_HOLDING/REMOVE_HOLDING types and provides consistent semantics.

3. **Use subtypes for semantic variations** - Instead of creating custom types, use subtypes (e.g., DIVIDEND with subtype DRIP) for rich categorization while maintaining canonical type behavior.

4. **Include fees in the activity** - Fees are automatically factored into cost basis and cash calculations.

5. **Set currency explicitly** - Always specify the activity currency to ensure proper multi-currency handling.
