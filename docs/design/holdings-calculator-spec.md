# Holdings Calculator Design Specification

## Overview

The Holdings Calculator is responsible for computing account state snapshots based on activity streams. It processes compiled activities (canonical postings from the compiler) and produces snapshots containing positions, cash balances, cost basis, and net contributions.

**Key Principle**: The calculator is deliberately "dumb" — it branches only on `activity_type`. All semantic complexity (subtypes, provider quirks, metadata interpretation) is handled by the **compiler** layer before activities reach the calculator.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Stored Events  │ --> │ ActivityCompiler │ --> │ HoldingsCalculator  │
│  (activities)   │     │ (expands events) │     │ (processes postings)│
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                           │
                                                           ▼
                                                 ┌─────────────────────┐
                                                 │ AccountStateSnapshot│
                                                 │ - positions         │
                                                 │ - cash_balances     │
                                                 │ - cost_basis        │
                                                 │ - net_contribution  │
                                                 └─────────────────────┘
```

---

## Activity Type Semantics

### External Flow Activities (affect net_contribution)
These represent money/assets entering or leaving the tracked portfolio from external sources.

| Activity Type | Cash Effect | Position Effect | Net Contribution |
|--------------|-------------|-----------------|------------------|
| `DEPOSIT` | +amount in activity.currency | None | +amount (account ccy) |
| `WITHDRAWAL` | -amount in activity.currency | None | -amount (account ccy) |
| `ADD_HOLDING` | -fee only | +quantity (creates lot) | +cost_basis (account ccy) |
| `REMOVE_HOLDING` | -fee only | -quantity (reduces lots FIFO) | -cost_basis_removed (account ccy) |

### Internal Flow Activities (do NOT affect net_contribution)
These represent activity within the portfolio that doesn't change total portfolio value from external perspective.

| Activity Type | Cash Effect | Position Effect | Net Contribution |
|--------------|-------------|-----------------|------------------|
| `BUY` | -total_cost in activity.currency | +quantity (creates lot) | None |
| `SELL` | +proceeds in activity.currency | -quantity (reduces lots FIFO) | None |
| `DIVIDEND` | +amount in activity.currency | None | None |
| `INTEREST` | +amount in activity.currency | None | None |
| `CREDIT` | +amount in activity.currency | None | None |
| `FEE` | -amount in activity.currency | None | None |
| `TAX` | -amount in activity.currency | None | None |
| `TRANSFER_IN` | See below | See below | Default: None (configurable) |
| `TRANSFER_OUT` | See below | See below | Default: None (configurable) |
| `SPLIT` | None | Mutates lot quantities in-place | None |

---

## Critical Design Decisions

### 1. Cash Booking: Activity Currency (Not Account Currency)

**Problem**: Current code books cash to `account_currency`, which is incorrect for multi-currency accounts (e.g., USD trade in CAD account books CAD instead of USD).

**Solution**: Book cash in `activity.currency` always.

```rust
// Helper function for cash mutations
#[inline]
fn add_cash(state: &mut AccountStateSnapshot, currency: &str, delta: Decimal) {
    *state.cash_balances
        .entry(currency.to_string())
        .or_insert(Decimal::ZERO) += delta;
}

// BUY example
let total_cost = activity.qty() * activity.price() + activity.fee_amt();
add_cash(state, &activity.currency, -total_cost);

// SELL example
let total_proceeds = activity.qty() * activity.price() - activity.fee_amt();
add_cash(state, &activity.currency, total_proceeds);
```

**Cash Balances Structure**:
- **Source of truth**: `cash_balances: HashMap<String, Decimal>` (multi-currency ledger)
- **Cached convenience**: `cash_total_account_currency: Decimal` on AccountStateSnapshot
- **Cached convenience**: `cash_total_base_currency: Decimal` (optional)
- **Cache timing**: Computed once at end of `calculate_next_holdings()`, not per-activity

**New Currency Handling**: Auto-create new currency balance entry when first encountered.

---

### 2. Transfer Activity Semantics

**Default Behavior**: TRANSFER_IN/TRANSFER_OUT are **internal** (no net_contribution effect).

**Configurable via Metadata**:
```json
{
  "kind": "INTERNAL",     // or "EXTERNAL"
  "source_group_id": "uuid-linking-both-legs"
}
```

- `kind: "INTERNAL"` (default): No net_contribution change, purely moves assets between tracked accounts
- `kind: "EXTERNAL"`: Treats as DEPOSIT/WITHDRAWAL equivalent (from/to untracked accounts)
- `source_group_id`: Required for internal transfers, links the TRANSFER_IN and TRANSFER_OUT legs

**Cash Transfer**:
```rust
// TRANSFER_IN (cash)
let net = activity.amt() - activity.fee_amt();
add_cash(state, &activity.currency, net);
// NO net_contribution change for internal

// TRANSFER_OUT (cash)
let net = activity.amt() + activity.fee_amt();
add_cash(state, &activity.currency, -net);
// NO net_contribution change for internal
```

**Asset Transfer**:
```rust
// TRANSFER_IN (asset)
position.add_lot_values(qty, price, fee, currency, date, fx_rate)?;
add_cash(state, &activity.currency, -fee);  // fee in activity currency
// NO net_contribution change for internal

// TRANSFER_OUT (asset)
position.reduce_lots_fifo(qty)?;
add_cash(state, &activity.currency, -fee);  // fee in activity currency
// NO net_contribution change for internal
```

---

### 3. Currency Conversion Strategy

**Lazy Conversion with Caching**:
- Conversions only performed when actually needed
- FxService's CurrencyConverter provides session-wide caching via BTreeMap
- No per-activity precomputation of `amount_acct`/`fee_acct`

**FX Rate Hierarchy**:
1. If `activity.fx_rate` is present and non-zero, use it directly
2. Otherwise, use FxService to lookup rate for activity date

**When Conversions Are Needed**:
- `net_contribution` / `net_contribution_base` calculations → convert to account/base currency
- Cost basis aggregation at end of day → convert position currencies to account currency
- Cash total cache computation → convert all currency balances to account currency

**Historical FX Policy**:
- **Cost basis**: Use activity-date FX rates (locked at purchase time)
- **Valuation**: Use snapshot-date FX rates (point-in-time value)

---

### 4. Position and Lot Management

**Position Currency**:
- Determined from asset's listing currency (via `asset_repository.get_by_id()`)
- Falls back to activity currency if asset lookup fails
- Session-wide cache for asset currencies (same pattern as FxService)

**Lot Structure** (updated):
```rust
pub struct Lot {
    pub id: String,
    pub quantity: Decimal,
    pub cost_per_share: Decimal,        // In position currency
    pub currency: String,               // Position currency
    pub acquisition_date: NaiveDate,
    pub fx_rate_to_position: Option<Decimal>,  // NEW: audit trail for cross-currency purchases
}
```

**Position::add_lot Signature** (updated to avoid Activity clone):
```rust
pub fn add_lot_values(
    &mut self,
    quantity: Decimal,
    unit_price: Decimal,           // Already converted to position currency
    fee: Decimal,                  // Already converted to position currency
    currency: &str,                // Position currency
    acquisition_date: NaiveDate,
    fx_rate_used: Option<Decimal>, // For audit trail
) -> Result<Decimal>;              // Returns cost basis added
```

**FIFO Lot Reduction**:
- `reduce_lots_fifo(quantity)` returns `(qty_reduced, cost_basis_removed)`
- Overselling is allowed → creates negative position (reflects short selling or data issues)
- No position deletion on zero quantity (position remains for history)

**Split Handling**:
- Mutates existing lots in-place (quantity adjustment, cost per share adjustment)
- No audit trail of pre-split values (simpler, but loses history)

---

### 5. Corporate Actions

**SPLIT**:
- Already implemented
- Mutates lot quantities and cost-per-share in-place
- No cash effect, no net_contribution effect

**Mergers/Spinoffs**:
- Represented as multiple linked activities via `source_group_id`:
  1. `REMOVE_HOLDING` of old asset (qty out)
  2. `ADD_HOLDING` of new asset(s) (qty in)
  3. Optional cash leg for cash-in-lieu (use `DIVIDEND` or `CREDIT`)
- Calculator processes each activity independently; linking is for UI/audit only

---

### 6. Asset Currency Cache

**Purpose**: Avoid DB hit per unique asset during position creation.

**Implementation**:
```rust
// Session-wide cache, threaded through calculation
let mut asset_currency_cache: HashMap<String, String> = HashMap::new();

fn get_position_currency_cached(
    &self,
    asset_id: &str,
    activity_currency: &str,  // fallback
    cache: &mut HashMap<String, String>,
) -> String {
    if let Some(ccy) = cache.get(asset_id) {
        return ccy.clone();
    }

    let ccy = self.asset_repository
        .get_by_id(asset_id)
        .map(|a| a.currency)
        .unwrap_or_else(|_| activity_currency.to_string());

    cache.insert(asset_id.to_string(), ccy.clone());
    ccy
}
```

---

### 7. Error Handling and Warnings

**Warning-Based Processing**:
- Activities that fail to process generate warnings, not hard errors
- Calculation continues with remaining activities
- Warnings collected in `HoldingsCalculationResult.warnings`

**Negative Cash**: Warn but allow (reflects margin accounts or data issues)

**Negative Position**: Allow (reflects short selling or data issues)

**Missing FX Rate**: Warn and use fallback (original amount without conversion)

---

## Data Flow Summary

```
For each activity in day:
  1. Parse activity_type
  2. Check transfer "kind" metadata if TRANSFER_*
  3. Route to handler based on activity_type

  Handler responsibilities:
  - Book cash in activity.currency (via add_cash helper)
  - Update position (create lot or reduce via FIFO)
  - Update net_contribution only for external flows
  - Convert to account/base currency only when needed for contributions

After all activities:
  1. Compute cash_total_account_currency from cash_balances HashMap
  2. Compute total cost_basis by converting position cost bases to account currency
  3. Generate snapshot with all computed values
```

---

## Implementation Checklist

### Phase 1: Core Corrections
- [ ] Add `add_cash()` helper function
- [ ] Change BUY/SELL to book cash in `activity.currency`
- [ ] Change INCOME (DIVIDEND/INTEREST/CREDIT) to book in `activity.currency`
- [ ] Change CHARGE (FEE/TAX) to book in `activity.currency`
- [ ] Add `cash_total_account_currency` field to AccountStateSnapshot
- [ ] Compute cash total once at end of `calculate_next_holdings()`

### Phase 2: Transfer Semantics
- [ ] Remove net_contribution updates from TRANSFER_IN/TRANSFER_OUT
- [ ] Add metadata check for `kind: "EXTERNAL"` to optionally enable contribution updates
- [ ] Update TRANSFER handlers to book cash/positions in activity.currency

### Phase 3: Performance Optimizations
- [ ] Remove precomputation of `amount_acct`/`fee_acct` in `process_single_activity()`
- [ ] Add session-wide asset currency cache
- [ ] Update `Position::add_lot` signature to accept values directly (avoid Activity clone)
- [ ] Add `fx_rate_to_position` field to Lot struct

### Phase 4: Cleanup
- [ ] Update tests for new cash booking behavior
- [ ] Update tests for transfer semantics
- [ ] Add tests for multi-currency cash balances
- [ ] Add tests for EXTERNAL transfer metadata

---

## Appendix: Activity Handler Summary

| Handler | Cash Mutation | Position Mutation | Contribution Mutation |
|---------|--------------|-------------------|----------------------|
| `handle_buy` | `-total_cost` in activity.ccy | `add_lot_values()` | None |
| `handle_sell` | `+proceeds` in activity.ccy | `reduce_lots_fifo()` | None |
| `handle_deposit` | `+net_amount` in activity.ccy | None | `+amount` (acct ccy) |
| `handle_withdrawal` | `-net_amount` in activity.ccy | None | `-amount` (acct ccy) |
| `handle_income` | `+net_amount` in activity.ccy | None | None |
| `handle_charge` | `-charge` in activity.ccy | None | None |
| `handle_add_holding` | `-fee` in activity.ccy | `add_lot_values()` | `+cost_basis` (acct ccy) |
| `handle_remove_holding` | `-fee` in activity.ccy | `reduce_lots_fifo()` | `-cost_basis` (acct ccy) |
| `handle_transfer_in` | `+net` in activity.ccy | `add_lot_values()` (if asset) | None (unless EXTERNAL) |
| `handle_transfer_out` | `-net` in activity.ccy | `reduce_lots_fifo()` (if asset) | None (unless EXTERNAL) |
| `handle_split` | None | Mutate lot qty/price | None |

---

## Open Questions / Future Considerations

1. **Wash Sale Rules**: Not currently implemented. Would require tracking sales within 30-day window and adjusting cost basis of replacement purchases.

2. **Specific Lot Identification**: Currently FIFO only. LIFO or specific ID selection could be added via metadata on SELL activities.

3. **Return of Capital**: Currently treated as DIVIDEND. Could have dedicated handling that reduces cost basis instead of adding to cash.

4. **Settlement Date Accounting**: Currently uses activity_date. Settlement date handling could be added for more accurate cash timing.
