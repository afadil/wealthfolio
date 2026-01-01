# Holdings Calculator Implementation Plan

## Overview

This plan implements the changes defined in `holdings-calculator-spec.md`. Tasks are organized into phases with dependencies clearly marked. Tasks within the same phase can be parallelized where marked.

---

## Phase 1: Data Model Updates (Parallelizable)

These changes update structures and can be done in parallel since they don't depend on each other.

### Task 1.1: Add `fx_rate_to_position` to Lot struct
**File**: `crates/core/src/portfolio/snapshot/positions_model.rs`

**Changes**:
```rust
pub struct Lot {
    pub id: String,
    pub position_id: String,
    pub acquisition_date: DateTime<Utc>,
    pub quantity: Decimal,
    pub cost_basis: Decimal,
    pub acquisition_price: Decimal,
    pub acquisition_fees: Decimal,
    pub fx_rate_to_position: Option<Decimal>,  // NEW: audit trail for cross-currency purchases
}
```

**Also update**:
- Default construction in any tests
- Serialization if needed for storage

---

### Task 1.2: Add `cash_total_account_currency` to AccountStateSnapshot
**File**: `crates/core/src/portfolio/snapshot/snapshot_model.rs`

**Changes**:
```rust
pub struct AccountStateSnapshot {
    // ... existing fields ...

    // NEW: Cached convenience field for total cash in account currency
    #[serde(default)]
    pub cash_total_account_currency: Decimal,

    // OPTIONAL: Cached convenience field for total cash in base currency
    #[serde(default)]
    pub cash_total_base_currency: Decimal,
}
```

**Also update**:
- `Default` implementation
- Storage model in `crates/storage-sqlite/src/portfolio/snapshot/model.rs` (add columns)
- Migration file for new columns

---

### Task 1.3: Add `add_lot_values` method to Position
**File**: `crates/core/src/portfolio/snapshot/positions_model.rs`

**Add new method** (keep existing `add_lot` for backwards compatibility during transition):
```rust
impl Position {
    /// Adds a new lot from pre-converted values (avoids Activity clone).
    /// Returns the cost basis of the added lot in the position's currency.
    pub fn add_lot_values(
        &mut self,
        lot_id: String,
        quantity: Decimal,
        unit_price: Decimal,           // Already in position currency
        fee: Decimal,                  // Already in position currency
        acquisition_date: DateTime<Utc>,
        fx_rate_used: Option<Decimal>, // For audit trail
    ) -> Result<Decimal> {
        if !quantity.is_sign_positive() {
            warn!("Skipping add_lot_values with non-positive quantity: {}", quantity);
            return Ok(Decimal::ZERO);
        }

        let cost_basis = quantity * unit_price + fee;

        let new_lot = Lot {
            id: lot_id,
            position_id: self.id.clone(),
            acquisition_date,
            quantity,
            cost_basis,
            acquisition_price: unit_price,
            acquisition_fees: fee,
            fx_rate_to_position: fx_rate_used,
        };

        self.lots.push_back(new_lot);
        // Sort by acquisition_date
        let mut vec_lots: Vec<_> = self.lots.drain(..).collect();
        vec_lots.sort_by_key(|lot| lot.acquisition_date);
        self.lots = vec_lots.into();

        self.recalculate_aggregates();
        Ok(cost_basis)
    }
}
```

---

## Phase 2: Core Calculator Changes (Sequential - depends on Phase 1)

### Task 2.1: Add `add_cash` helper function
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

**Add at top of file**:
```rust
/// Helper to mutate cash balances in the correct currency.
#[inline]
fn add_cash(state: &mut AccountStateSnapshot, currency: &str, delta: Decimal) {
    *state.cash_balances
        .entry(currency.to_string())
        .or_insert(Decimal::ZERO) += delta;
}
```

---

### Task 2.2: Add asset currency cache
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

**Changes to `calculate_next_holdings`**:
```rust
pub fn calculate_next_holdings(
    &self,
    previous_snapshot: &AccountStateSnapshot,
    activities_today: &[Activity],
    target_date: NaiveDate,
) -> Result<HoldingsCalculationResult> {
    // ... existing setup ...

    // NEW: Session-wide asset currency cache
    let mut asset_currency_cache: HashMap<String, String> = HashMap::new();

    for activity in activities_today {
        // ... existing validation ...
        match self.process_single_activity(
            activity,
            &mut next_state,
            &account_currency,
            &mut asset_currency_cache,  // NEW parameter
        ) {
            // ... existing error handling ...
        }
    }

    // ... existing cost basis recalculation ...

    // NEW: Compute cash total in account currency
    next_state.cash_total_account_currency = self.compute_cash_total_in_account_currency(
        &next_state.cash_balances,
        &account_currency,
        target_date,
    );

    // ... rest of method ...
}
```

**Add helper methods**:
```rust
fn get_position_currency_cached(
    &self,
    asset_id: &str,
    activity_currency: &str,
    cache: &mut HashMap<String, String>,
) -> String {
    if let Some(ccy) = cache.get(asset_id) {
        return ccy.clone();
    }

    let ccy = self.asset_repository
        .get_by_id(asset_id)
        .map(|a| a.currency)
        .unwrap_or_else(|_| {
            warn!("Failed to get asset currency for {}, using activity currency {}", asset_id, activity_currency);
            activity_currency.to_string()
        });

    cache.insert(asset_id.to_string(), ccy.clone());
    ccy
}

fn compute_cash_total_in_account_currency(
    &self,
    cash_balances: &HashMap<String, Decimal>,
    account_currency: &str,
    target_date: NaiveDate,
) -> Decimal {
    let mut total = Decimal::ZERO;
    for (ccy, balance) in cash_balances {
        if ccy == account_currency {
            total += balance;
        } else {
            match self.fx_service.convert_currency_for_date(*balance, ccy, account_currency, target_date) {
                Ok(converted) => total += converted,
                Err(e) => {
                    warn!("Failed to convert cash {} {} to {}: {}. Using unconverted.", balance, ccy, account_currency, e);
                    total += balance;
                }
            }
        }
    }
    total
}
```

---

### Task 2.3: Update `process_single_activity` signature
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

**Update signature and remove precomputation**:
```rust
fn process_single_activity(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
    asset_currency_cache: &mut HashMap<String, String>,  // NEW
) -> Result<()> {
    let activity_type = ActivityType::from_str(&activity.activity_type)
        .map_err(|_| CalculatorError::UnsupportedActivityType(activity.activity_type.clone()))?;

    // REMOVED: precomputation of amount_acct and fee_acct
    // Each handler now converts only when needed

    match activity_type {
        ActivityType::Buy => self.handle_buy(activity, state, account_currency, asset_currency_cache),
        ActivityType::Sell => self.handle_sell(activity, state, account_currency, asset_currency_cache),
        ActivityType::Deposit => self.handle_deposit(activity, state, account_currency),
        ActivityType::Withdrawal => self.handle_withdrawal(activity, state, account_currency),
        ActivityType::Dividend | ActivityType::Interest => self.handle_income(activity, state),
        ActivityType::Fee | ActivityType::Tax => self.handle_charge(activity, state),
        ActivityType::AddHolding => self.handle_add_holding(activity, state, account_currency, asset_currency_cache),
        ActivityType::RemoveHolding => self.handle_remove_holding(activity, state, account_currency, asset_currency_cache),
        ActivityType::TransferIn => self.handle_transfer_in(activity, state, account_currency, asset_currency_cache),
        ActivityType::TransferOut => self.handle_transfer_out(activity, state, account_currency, asset_currency_cache),
        ActivityType::Split => Ok(()),
        ActivityType::Credit => self.handle_income(activity, state),
        ActivityType::Unknown => {
            warn!("Skipping unknown activity type for activity {}", activity.id);
            Ok(())
        }
    }
}
```

---

### Task 2.4: Rewrite `handle_buy` - book cash in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_buy(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
    asset_currency_cache: &mut HashMap<String, String>,
) -> Result<()> {
    let asset_id = activity.asset_id.as_deref()
        .ok_or_else(|| Error::Unexpected("Buy activity must have an asset_id".to_string()))?;

    // Get or create position with cached currency lookup
    let position_currency = self.get_position_currency_cached(asset_id, &activity.currency, asset_currency_cache);
    let position = self.get_or_create_position_mut_with_currency(state, asset_id, &position_currency, activity.activity_date)?;

    // Convert to position currency if needed
    let (unit_price_pos, fee_pos, fx_rate_used) = if position.currency == activity.currency {
        (activity.price(), activity.fee_amt(), None)
    } else {
        let (price, fee) = self.convert_to_position_currency(activity, &position.currency, account_currency)?;
        let fx_rate = self.get_fx_rate_for_position_conversion(activity, &position.currency, account_currency);
        (price, fee, fx_rate)
    };

    // Add lot using new method (avoids clone)
    position.add_lot_values(
        activity.id.clone(),
        activity.qty(),
        unit_price_pos,
        fee_pos,
        activity.activity_date,
        fx_rate_used,
    )?;

    // CRITICAL CHANGE: Book cash in ACTIVITY currency, not account currency
    let total_cost = activity.qty() * activity.price() + activity.fee_amt();
    add_cash(state, &activity.currency, -total_cost);

    Ok(())
}
```

---

### Task 2.5: Rewrite `handle_sell` - book cash in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_sell(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
    asset_currency_cache: &mut HashMap<String, String>,
) -> Result<()> {
    let asset_id = activity.asset_id.as_deref()
        .ok_or_else(|| Error::Unexpected("Sell activity must have an asset_id".to_string()))?;

    // CRITICAL CHANGE: Book cash in ACTIVITY currency
    let total_proceeds = activity.qty() * activity.price() - activity.fee_amt();
    add_cash(state, &activity.currency, total_proceeds);

    // Reduce position
    if let Some(position) = state.positions.get_mut(asset_id) {
        // Convert quantity to position currency if needed for lot matching
        let qty_to_reduce = if position.currency == activity.currency {
            activity.qty()
        } else {
            // For sells, quantity doesn't need currency conversion (shares are shares)
            activity.qty()
        };

        let (_qty_reduced, _cost_basis_sold) = position.reduce_lots_fifo(qty_to_reduce)?;
    } else {
        warn!("Attempted to Sell non-existent position {} via activity {}. Applying cash effect only.", asset_id, activity.id);
    }

    Ok(())
}
```

---

### Task 2.6: Rewrite `handle_income` - book cash in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_income(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
) -> Result<()> {
    // CRITICAL CHANGE: Book in activity.currency, not account currency
    let net_amount = activity.amt() - activity.fee_amt();
    add_cash(state, &activity.currency, net_amount);
    // Income does NOT affect net_contribution
    Ok(())
}
```

---

### Task 2.7: Rewrite `handle_charge` - book cash in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_charge(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
) -> Result<()> {
    let charge = if activity.fee_amt() != Decimal::ZERO {
        activity.fee_amt()
    } else {
        activity.amt()
    };

    if charge == Decimal::ZERO {
        warn!("Activity {} (FEE/TAX): 'fee' and 'amount' are both zero. No cash change.", activity.id);
        return Ok(());
    }

    // CRITICAL CHANGE: Book in activity.currency
    add_cash(state, &activity.currency, -charge.abs());
    // Charges do NOT affect net_contribution
    Ok(())
}
```

---

### Task 2.8: Rewrite `handle_deposit` - book cash in activity.currency, convert for contribution
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_deposit(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
) -> Result<()> {
    let activity_date = activity.activity_date.naive_utc().date();
    let activity_amount = activity.amt();

    // CRITICAL CHANGE: Book cash in activity.currency
    let net_cash = activity_amount - activity.fee_amt();
    add_cash(state, &activity.currency, net_cash);

    // Convert for net_contribution (in account currency)
    let amount_acct = self.convert_to_account_currency(activity_amount, activity, account_currency, "Deposit Amount");
    state.net_contribution += amount_acct;

    // Convert for net_contribution_base
    let base_ccy = self.base_currency.read().unwrap();
    let amount_base = self.fx_service.convert_currency_for_date(activity_amount, &activity.currency, &base_ccy, activity_date)
        .unwrap_or_else(|e| {
            warn!("Failed to convert deposit to base: {}. Using zero.", e);
            Decimal::ZERO
        });
    state.net_contribution_base += amount_base;

    Ok(())
}
```

---

### Task 2.9: Rewrite `handle_withdrawal` - book cash in activity.currency, convert for contribution
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_withdrawal(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
) -> Result<()> {
    let activity_date = activity.activity_date.naive_utc().date();
    let activity_amount = activity.amt();

    // CRITICAL CHANGE: Book cash in activity.currency
    let net_cash = activity_amount + activity.fee_amt();
    add_cash(state, &activity.currency, -net_cash);

    // Convert for net_contribution (in account currency)
    let amount_acct = self.convert_to_account_currency(activity_amount, activity, account_currency, "Withdrawal Amount");
    state.net_contribution -= amount_acct;

    // Convert for net_contribution_base
    let base_ccy = self.base_currency.read().unwrap();
    let amount_base = self.fx_service.convert_currency_for_date(activity_amount, &activity.currency, &base_ccy, activity_date)
        .unwrap_or_else(|e| {
            warn!("Failed to convert withdrawal to base: {}. Using zero.", e);
            Decimal::ZERO
        });
    state.net_contribution_base -= amount_base;

    Ok(())
}
```

---

### Task 2.10: Rewrite `handle_transfer_in` - internal by default, check metadata for EXTERNAL
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_transfer_in(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
    asset_currency_cache: &mut HashMap<String, String>,
) -> Result<()> {
    let is_external = activity.get_meta::<String>("kind")
        .map(|k| k.eq_ignore_ascii_case("EXTERNAL"))
        .unwrap_or(false);  // DEFAULT: INTERNAL

    if is_cash_asset(activity.asset_id.as_deref()) {
        // Cash transfer
        let net_amount = activity.amt() - activity.fee_amt();
        add_cash(state, &activity.currency, net_amount);

        // Only update contribution if EXTERNAL
        if is_external {
            let amount_acct = self.convert_to_account_currency(activity.amt(), activity, account_currency, "TransferIn");
            state.net_contribution += amount_acct;

            let base_ccy = self.base_currency.read().unwrap();
            let activity_date = activity.activity_date.naive_utc().date();
            if let Ok(amount_base) = self.fx_service.convert_currency_for_date(activity.amt(), &activity.currency, &base_ccy, activity_date) {
                state.net_contribution_base += amount_base;
            }
        }
    } else {
        // Asset transfer
        let asset_id = activity.asset_id.as_deref().unwrap_or("");
        let position_currency = self.get_position_currency_cached(asset_id, &activity.currency, asset_currency_cache);
        let position = self.get_or_create_position_mut_with_currency(state, asset_id, &position_currency, activity.activity_date)?;

        let (unit_price_pos, fee_pos, fx_rate_used) = if position.currency == activity.currency {
            (activity.price(), activity.fee_amt(), None)
        } else {
            let (price, fee) = self.convert_to_position_currency(activity, &position.currency, account_currency)?;
            let fx_rate = self.get_fx_rate_for_position_conversion(activity, &position.currency, account_currency);
            (price, fee, fx_rate)
        };

        let cost_basis_pos = position.add_lot_values(
            activity.id.clone(),
            activity.qty(),
            unit_price_pos,
            fee_pos,
            activity.activity_date,
            fx_rate_used,
        )?;

        // Fee in activity currency
        add_cash(state, &activity.currency, -activity.fee_amt());

        // Only update contribution if EXTERNAL
        if is_external {
            let cost_basis_acct = self.convert_position_amount_to_account_currency(cost_basis_pos, &position.currency, activity, account_currency, "TransferIn Asset");
            state.net_contribution += cost_basis_acct;

            let base_ccy = self.base_currency.read().unwrap();
            let activity_date = activity.activity_date.naive_utc().date();
            if let Ok(cost_basis_base) = self.fx_service.convert_currency_for_date(cost_basis_pos, &position.currency, &base_ccy, activity_date) {
                state.net_contribution_base += cost_basis_base;
            }
        }
    }

    Ok(())
}
```

---

### Task 2.11: Rewrite `handle_transfer_out` - internal by default, check metadata for EXTERNAL
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

Similar to Task 2.10 but with negative amounts and reduce_lots_fifo for assets.

---

### Task 2.12: Rewrite `handle_add_holding` - book fee in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

```rust
fn handle_add_holding(
    &self,
    activity: &Activity,
    state: &mut AccountStateSnapshot,
    account_currency: &str,
    asset_currency_cache: &mut HashMap<String, String>,
) -> Result<()> {
    let asset_id = activity.asset_id.as_deref()
        .ok_or_else(|| Error::Unexpected("AddHolding activity must have an asset_id".to_string()))?;

    let position_currency = self.get_position_currency_cached(asset_id, &activity.currency, asset_currency_cache);
    let position = self.get_or_create_position_mut_with_currency(state, asset_id, &position_currency, activity.activity_date)?;

    let (unit_price_pos, fee_pos, fx_rate_used) = if position.currency == activity.currency {
        (activity.price(), activity.fee_amt(), None)
    } else {
        let (price, fee) = self.convert_to_position_currency(activity, &position.currency, account_currency)?;
        let fx_rate = self.get_fx_rate_for_position_conversion(activity, &position.currency, account_currency);
        (price, fee, fx_rate)
    };

    let cost_basis_pos = position.add_lot_values(
        activity.id.clone(),
        activity.qty(),
        unit_price_pos,
        fee_pos,
        activity.activity_date,
        fx_rate_used,
    )?;

    // CHANGE: Fee in activity currency
    add_cash(state, &activity.currency, -activity.fee_amt());

    // ADD_HOLDING affects net_contribution (external flow)
    let cost_basis_acct = self.convert_position_amount_to_account_currency(cost_basis_pos, &position.currency, activity, account_currency, "AddHolding");
    state.net_contribution += cost_basis_acct;

    let base_ccy = self.base_currency.read().unwrap();
    let activity_date = activity.activity_date.naive_utc().date();
    if let Ok(cost_basis_base) = self.fx_service.convert_currency_for_date(cost_basis_pos, &position.currency, &base_ccy, activity_date) {
        state.net_contribution_base += cost_basis_base;
    }

    Ok(())
}
```

---

### Task 2.13: Rewrite `handle_remove_holding` - book fee in activity.currency
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

Similar to Task 2.12 but with reduce_lots_fifo and subtracting from net_contribution.

---

### Task 2.14: Update `get_or_create_position_mut` to use cache
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator.rs`

Add a new version that accepts pre-determined currency:
```rust
fn get_or_create_position_mut_with_currency<'a>(
    &self,
    state: &'a mut AccountStateSnapshot,
    asset_id: &str,
    position_currency: &str,
    date: DateTime<Utc>,
) -> std::result::Result<&'a mut Position, CalculatorError> {
    if asset_id.is_empty() || asset_id.starts_with(CASH_ASSET_PREFIX) {
        return Err(CalculatorError::InvalidActivity(format!(
            "Invalid asset_id for position: {}",
            asset_id
        )));
    }
    Ok(state
        .positions
        .entry(asset_id.to_string())
        .or_insert_with(|| {
            Position::new(
                state.account_id.clone(),
                asset_id.to_string(),
                position_currency.to_string(),
                date,
            )
        }))
}
```

---

## Phase 3: Tests Update (Parallelizable after Phase 2)

### Task 3.1: Update `holdings_calculator` unit tests
**File**: `crates/core/src/portfolio/snapshot/holdings_calculator_tests.rs` (or similar)

- Update tests to verify cash is booked in activity.currency
- Add tests for multi-currency cash balances
- Add tests for `cash_total_account_currency` computation

### Task 3.2: Update `positions_model` unit tests
**File**: `crates/core/src/portfolio/snapshot/positions_model.rs` (test module)

- Add tests for `add_lot_values` method
- Update tests for `fx_rate_to_position` field on Lot

### Task 3.3: Add transfer semantics tests
**File**: New or existing test file

- Test TRANSFER_IN/OUT with `kind: "INTERNAL"` (default) - no contribution change
- Test TRANSFER_IN/OUT with `kind: "EXTERNAL"` - contribution changes
- Test missing `kind` metadata defaults to INTERNAL

### Task 3.4: Add integration tests for multi-currency scenarios
- USD trade in CAD account → USD cash decreases, CAD unchanged
- Dividend in EUR to USD account → EUR cash increases
- Mixed currency portfolio cash total computation

---

## Phase 4: Storage/Migration (After Phase 1)

### Task 4.1: Update SQLite snapshot model
**File**: `crates/storage-sqlite/src/portfolio/snapshot/model.rs`

Add new fields to match core model.

### Task 4.2: Create migration for new columns
**File**: `crates/storage-sqlite/migrations/XXXX_holdings_calculator_updates/up.sql`

```sql
-- Add cash_total_account_currency to account_state_snapshots
ALTER TABLE account_state_snapshots ADD COLUMN cash_total_account_currency TEXT DEFAULT '0';
ALTER TABLE account_state_snapshots ADD COLUMN cash_total_base_currency TEXT DEFAULT '0';

-- Note: fx_rate_to_position on Lot is stored in JSON blob, no migration needed
```

---

## Execution Order

```
Phase 1 (Parallel):
├── Task 1.1: Lot.fx_rate_to_position
├── Task 1.2: AccountStateSnapshot.cash_total_account_currency
└── Task 1.3: Position.add_lot_values

Phase 2 (Sequential, after Phase 1):
├── Task 2.1: add_cash helper
├── Task 2.2: asset currency cache
├── Task 2.3: process_single_activity signature
├── Task 2.4: handle_buy
├── Task 2.5: handle_sell
├── Task 2.6: handle_income
├── Task 2.7: handle_charge
├── Task 2.8: handle_deposit
├── Task 2.9: handle_withdrawal
├── Task 2.10: handle_transfer_in
├── Task 2.11: handle_transfer_out
├── Task 2.12: handle_add_holding
├── Task 2.13: handle_remove_holding
└── Task 2.14: get_or_create_position_mut_with_currency

Phase 3 (Parallel, after Phase 2):
├── Task 3.1: holdings_calculator tests
├── Task 3.2: positions_model tests
├── Task 3.3: transfer semantics tests
└── Task 3.4: integration tests

Phase 4 (Parallel with Phase 1):
├── Task 4.1: SQLite model update
└── Task 4.2: Migration
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `crates/core/src/portfolio/snapshot/positions_model.rs` | Add `fx_rate_to_position` to Lot, add `add_lot_values` method |
| `crates/core/src/portfolio/snapshot/snapshot_model.rs` | Add `cash_total_account_currency`, `cash_total_base_currency` |
| `crates/core/src/portfolio/snapshot/holdings_calculator.rs` | Major rewrite of all handlers |
| `crates/storage-sqlite/src/portfolio/snapshot/model.rs` | Add new fields |
| `crates/storage-sqlite/migrations/...` | New migration |
| Various test files | Update/add tests |

---

## Risks and Mitigations

1. **Risk**: Breaking existing snapshot data
   - **Mitigation**: Migration adds columns with defaults; existing data remains valid

2. **Risk**: Performance regression from per-handler conversions
   - **Mitigation**: FxService already has session-wide cache; asset currency cache added

3. **Risk**: Multi-currency cash balances causing UI issues
   - **Mitigation**: `cash_total_account_currency` provides single number for UI; full breakdown available

4. **Risk**: Transfer semantics change affects existing calculations
   - **Mitigation**: Default to INTERNAL preserves behavior for most cases; existing data without `kind` metadata treated as internal
