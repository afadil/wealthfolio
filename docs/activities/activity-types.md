# Activity Types Reference

This document provides a comprehensive reference for Activity types used in Wealthfolio. Understanding these types is essential for creating activities programmatically through the addon API.

> **Note**: For complete addon development guidance, see the [Addon Developer Guide](addon-developer-guide.md) and [API Reference](addon-api-reference.md).

## Activity Reference

| Type | Typical Use Case | Cash Impact | Holdings Impact |
|------|-----------------|-------------|-----------------|
| **BUY** | Purchase of a security or other asset. | Decreases cash | Increases quantity |
| **SELL** | Disposal of a security or asset. | Increases cash | Decreases quantity |
| **DIVIDEND** | Cash dividend paid into the account. | Increases cash | – |
| **INTEREST** | Interest earned on cash or fixed-income positions. | Increases cash | – |
| **DEPOSIT** | Incoming funds from outside Wealthfolio. | Increases cash | – |
| **WITHDRAWAL** | Outgoing funds to an external account. | Decreases cash | – |
| **ADD_HOLDING** | Bring in a position without recording a trade (e.g. opening balance, gift received, option assignment). | Fee only | Increases quantity |
| **REMOVE_HOLDING** | Write-off, gift, or expire a position without recording a sale. | Fee only | Decreases quantity |
| **TRANSFER_IN** | Move cash or assets into this account from another Wealthfolio account (asset cost basis preserved). | Increases cash or quantity | Increases quantity for assets |
| **TRANSFER_OUT** | Move cash or assets out of this account (asset cost basis exported). | Decreases cash or quantity | Decreases quantity for assets |
| **FEE** | Stand-alone brokerage or platform fee not tied to a trade. | Decreases cash | – |
| **TAX** | Tax paid from the account (e.g. dividend withholding, realised CGT). | Decreases cash | – |
| **SPLIT** | Stock split or reverse split. Adjusts units and per-share cost so total cost remains constant. | – | Quantity and unit cost adjusted |

> **Tip**: Every cash leg automatically books to the synthetic symbol
> `$CASH-<CCY>` (for example `$CASH-USD`) so cash balances remain visible
> alongside securities.

## Quick‑Start Cheat‑Sheet

Use this table as a guide for common workflows:

| Scenario | Recommended Activities | Why |
|----------|-----------------------|-----|
| Initial snapshot | `ADD_HOLDING`, `DEPOSIT` | Fast way to seed starting positions and cash. |
| Routine trading | `BUY`, `SELL` (plus `DIVIDEND`, `INTEREST`) | Full P/L and cash reconciliation. |
| Inter-account moves | `TRANSFER_IN`, `TRANSFER_OUT` | Retains cost basis; avoids phantom gains/losses. |
| One-off charges | `FEE`, `TAX` | Keeps expense reporting explicit. |
| Gifts / write-offs | `ADD_HOLDING`, `REMOVE_HOLDING` | Sidesteps cash when no sale proceeds exist. |
| Corporate action | `SPLIT` | Normalises quantity/cost without affecting value. |


## Required Form Fields

All activities require you to choose an **account** and **date**. The table below lists the additional mandatory inputs shown in the add-activity forms.

| Type | Required Fields |
|------|----------------|
| **BUY** | Symbol, Quantity, Unit Price |
| **SELL** | Symbol, Quantity, Unit Price |
| **DIVIDEND** | Symbol, Amount |
| **INTEREST** | Amount |
| **DEPOSIT** | Amount |
| **WITHDRAWAL** | Amount |
| **TRANSFER_IN** | Amount |
| **TRANSFER_OUT** | Amount |
| **ADD_HOLDING** | Symbol, Quantity, Average Cost |
| **REMOVE_HOLDING** | Symbol, Quantity, Average Cost |
| **FEE** | Fee Amount |
| **TAX** | Amount |
| **SPLIT** | Symbol, Split Ratio |

## Workflow Styles

**Simple (Holdings-Only)**
- Use `ADD_HOLDING` / `REMOVE_HOLDING` to line up positions.
- Adjust cash once with `DEPOSIT` / `WITHDRAWAL`.
- Good for quick onboarding or backfilling missing history when only tracking portfolio value.

**Full (Transaction-Level)**
1. Seed the account with a `DEPOSIT`.
2. Record every `BUY`, `SELL`, `DIVIDEND`, `INTEREST`.
3. Mirror transfers with `TRANSFER_IN` / `TRANSFER_OUT`.
4. Log ad-hoc expenses via `FEE` and `TAX`.
- Good for precise IRR, cash-flow and tax analytics.

Activities can be inserted retroactively; Wealthfolio recalculates balances automatically.
