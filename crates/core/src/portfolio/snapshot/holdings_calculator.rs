use crate::activities::{Activity, ActivityType};
use crate::assets::is_cash_asset_id;
use crate::assets::AssetRepositoryTrait;
use crate::errors::{CalculatorError, Error, Result};
use crate::fx::FxServiceTrait;
use crate::portfolio::snapshot::AccountStateSnapshot;
use crate::portfolio::snapshot::HoldingsCalculationResult;
use crate::portfolio::snapshot::HoldingsCalculationWarning;
use crate::portfolio::snapshot::Position;

use chrono::{DateTime, NaiveDate, Utc};
use log::{debug, error, warn};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, RwLock};

/// Helper function for cash mutations.
/// Books cash in the specified currency (should be activity.currency per design spec).
#[inline]
fn add_cash(state: &mut AccountStateSnapshot, currency: &str, delta: Decimal) {
    *state
        .cash_balances
        .entry(currency.to_string())
        .or_insert(Decimal::ZERO) += delta;
}

/// Calculates the holding state (positions, cash, cost basis, net deposits) based on activities.
/// It does not calculate market values or base currency conversions related to valuation.
#[derive(Clone)]
pub struct HoldingsCalculator {
    pub fx_service: Arc<dyn FxServiceTrait>, // only deals with activity/account currency adjustments
    pub base_currency: Arc<RwLock<String>>,
    pub asset_repository: Arc<dyn AssetRepositoryTrait>,
}
impl HoldingsCalculator {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        base_currency: Arc<RwLock<String>>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
    ) -> Self {
        Self {
            fx_service,
            base_currency,
            asset_repository,
        }
    }

    /// Calculates the next day's holding state based on the previous state and today's activities.
    /// Returns a snapshot with updated positions, cash, cost basis, and net deposits,
    /// but with valuation fields (market value, base conversions, day gain) potentially stale or zeroed.
    ///
    /// The result includes both the calculated snapshot and any warnings for activities that
    /// could not be processed. This allows callers to see which activities failed without
    /// stopping the entire calculation.
    pub fn calculate_next_holdings(
        &self,
        previous_snapshot: &AccountStateSnapshot,
        activities_today: &[Activity], // Assumes these are for the *target* date and already split-adjusted
        target_date: NaiveDate,
    ) -> Result<HoldingsCalculationResult> {
        debug!(
            "Calculating holdings for account {} on date {}",
            previous_snapshot.account_id, target_date
        );

        let mut next_state = previous_snapshot.clone();
        next_state.snapshot_date = target_date;
        next_state.calculated_at = Utc::now().naive_utc();
        next_state.cost_basis = Decimal::ZERO; // Will be recalculated at the end
        next_state.net_contribution = previous_snapshot.net_contribution; // Carry forward
        next_state.net_contribution_base = previous_snapshot.net_contribution_base;

        let account_currency = next_state.currency.clone();
        let mut warnings: Vec<HoldingsCalculationWarning> = Vec::new();

        // Session-wide asset info cache to avoid DB lookups per unique asset.
        // Stores (currency, is_alternative) for each asset.
        let mut asset_currency_cache: HashMap<String, (String, bool)> = HashMap::new();

        for activity in activities_today {
            if activity.activity_date.naive_utc().date() != target_date {
                let warning = HoldingsCalculationWarning {
                    activity_id: activity.id.clone(),
                    account_id: next_state.account_id.clone(),
                    date: target_date,
                    message: format!(
                        "Activity date {} does not match target snapshot date {}. Skipped.",
                        activity.activity_date.naive_utc().date(),
                        target_date
                    ),
                };
                warn!("{}", warning);
                warnings.push(warning);
                continue;
            }
            match self.process_single_activity(
                activity,
                &mut next_state,
                &account_currency,
                &mut asset_currency_cache,
            ) {
                Ok(_) => {} // Activity processed successfully
                Err(e) => {
                    let warning = HoldingsCalculationWarning {
                        activity_id: activity.id.clone(),
                        account_id: next_state.account_id.clone(),
                        date: target_date,
                        message: format!("Failed to process activity: {}", e),
                    };
                    error!("{}", warning);
                    warnings.push(warning);
                    // Continue processing other activities
                }
            }
        }

        // Recalculate cost basis in account currency using SNAPSHOT date rates
        let mut final_cost_basis_acct = Decimal::ZERO;
        for position in next_state.positions.values() {
            let position_currency = &position.currency;

            if position_currency.is_empty() {
                warn!(
                    "Position {} has no currency set. Skipping its cost basis.",
                    position.id
                );
                continue;
            }
            if position_currency == &account_currency {
                final_cost_basis_acct += position.total_cost_basis;
                continue;
            }

            match self.fx_service.convert_currency_for_date(
                position.total_cost_basis,
                position_currency,
                &account_currency,
                target_date,
            ) {
                Ok(converted_cost) => {
                    final_cost_basis_acct += converted_cost;
                }
                Err(e) => {
                    error!(
                         "Holdings Calc (Book Cost): Failed to convert {} {} to {} on {}: {}. Using original unconverted cost for snapshot.",
                         position.total_cost_basis, position_currency, account_currency, target_date, e
                     );
                    if position_currency != &account_currency {
                        final_cost_basis_acct += position.total_cost_basis;
                    }
                }
            }
        }
        next_state.cost_basis = final_cost_basis_acct;

        // Compute cash totals (once at end of day per spec)
        self.compute_cash_totals(&mut next_state, target_date);

        next_state.id = format!(
            "{}_{}",
            next_state.account_id,
            target_date.format("%Y-%m-%d")
        );

        Ok(HoldingsCalculationResult::with_warnings(
            next_state, warnings,
        ))
    }

    /// Processes a single activity, updating positions, cash, and net_deposit.
    /// Books cash in ACTIVITY currency (not account currency) per design spec.
    /// Uses asset_currency_cache to avoid repeated DB lookups for asset currencies and kind info.
    fn process_single_activity(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        asset_currency_cache: &mut HashMap<String, (String, bool)>,
    ) -> Result<()> {
        let activity_type = ActivityType::from_str(&activity.activity_type).map_err(|_| {
            CalculatorError::UnsupportedActivityType(activity.activity_type.clone())
        })?;

        // Dispatch to Specific Handlers
        // NOTE: Removed precomputation of amount_acct/fee_acct - handlers convert when needed
        match activity_type {
            ActivityType::Buy => {
                self.handle_buy(activity, state, account_currency, asset_currency_cache)
            }
            ActivityType::Sell => {
                self.handle_sell(activity, state, account_currency, asset_currency_cache)
            }
            ActivityType::Deposit => self.handle_deposit(activity, state, account_currency),
            ActivityType::Withdrawal => self.handle_withdrawal(activity, state, account_currency),
            ActivityType::Dividend | ActivityType::Interest | ActivityType::Credit => {
                self.handle_income(activity, state)
            }
            ActivityType::Fee | ActivityType::Tax => {
                self.handle_charge(activity, state, &activity_type)
            }
            ActivityType::TransferIn => {
                // Handles both internal transfers and external transfers (is_external=true)
                // External transfers affect net_contribution (used for add holding, external deposits)
                self.handle_transfer_in(activity, state, account_currency, asset_currency_cache)
            }
            ActivityType::TransferOut => {
                // Handles both internal transfers and external transfers (is_external=true)
                // External transfers affect net_contribution (used for remove holding, external withdrawals)
                self.handle_transfer_out(activity, state, account_currency, asset_currency_cache)
            }
            ActivityType::Split => Ok(()),
            ActivityType::Adjustment => {
                // ADJUSTMENT: Non-trade correction / transformation (usually no cash movement)
                // Examples: option expire worthless, RoC basis adjustment, merger/spinoff
                // Currently just skip - specific handling will be added as needed
                Ok(())
            }
            ActivityType::Unknown => {
                warn!(
                    "Unknown activity type for activity {}. Skipping.",
                    activity.id
                );
                Ok(())
            }
        }
    }

    // --- Activity Type Handlers ---
    // Per design spec: Book cash in ACTIVITY currency, not account currency.

    /// Handle BUY activity.
    /// Books cash outflow in ACTIVITY currency.
    fn handle_buy(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        asset_currency_cache: &mut HashMap<String, (String, bool)>,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let asset_id = activity.asset_id.as_deref().unwrap_or("");

        let position = self.get_or_create_position_mut_cached(
            state,
            asset_id,
            activity_currency,
            activity.activity_date,
            asset_currency_cache,
        )?;

        // Determine position currency and if conversion is needed
        let position_currency = position.currency.clone();
        let needs_conversion =
            !position_currency.is_empty() && position_currency != activity.currency;

        // Get values for lot, converting if needed
        let (unit_price_for_lot, fee_for_lot, fx_rate_used) = if needs_conversion {
            let (converted_price, converted_fee, fx_rate) = self.convert_to_position_currency(
                activity.price(),
                activity.fee_amt(),
                activity,
                &position_currency,
                account_currency,
            )?;
            (converted_price, converted_fee, fx_rate)
        } else {
            (activity.price(), activity.fee_amt(), None)
        };

        // Use add_lot_values to avoid cloning Activity
        let _cost_basis_asset_curr = position.add_lot_values(
            activity.id.clone(),
            activity.qty(),
            unit_price_for_lot,
            fee_for_lot,
            activity.activity_date,
            fx_rate_used,
        )?;

        // Book cash outflow in ACTIVITY currency
        let total_cost = (activity.qty() * activity.price()) + activity.fee_amt();
        add_cash(state, activity_currency, -total_cost);

        Ok(())
    }

    /// Handle SELL activity.
    /// Books cash inflow in ACTIVITY currency.
    fn handle_sell(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        _account_currency: &str,
        _asset_currency_cache: &mut HashMap<String, (String, bool)>,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let asset_id = activity.asset_id.as_deref().unwrap_or("");

        // Book cash inflow in ACTIVITY currency (proceeds = qty * price - fee)
        let total_proceeds = (activity.qty() * activity.price()) - activity.fee_amt();
        add_cash(state, activity_currency, total_proceeds);

        if let Some(position) = state.positions.get_mut(asset_id) {
            // reduce_lots_fifo only needs quantity, not price
            let (_qty_reduced, _cost_basis_sold_asset_curr) =
                position.reduce_lots_fifo(activity.qty())?;
        } else {
            warn!(
                "Attempted to Sell non-existent/zero position {} via activity {}. Applying cash effect only.",
                asset_id, activity.id
            );
        }
        Ok(())
    }

    /// Handle DEPOSIT activity.
    /// Books cash inflow in ACTIVITY currency.
    /// Updates net_contribution in account currency.
    fn handle_deposit(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();
        let activity_amount = activity.amt();

        // Book cash in ACTIVITY currency (amount - fee)
        let net_amount = activity_amount - activity.fee_amt();
        add_cash(state, activity_currency, net_amount);

        // Convert for net_contribution (pre-fee amount in account currency)
        let amount_acct = self.convert_to_account_currency(
            activity_amount,
            activity,
            account_currency,
            "Deposit Amount",
        );

        // Convert for net_contribution_base
        let base_ccy = self.base_currency.read().unwrap();
        let amount_base = match self.fx_service.convert_currency_for_date(
            activity_amount,
            activity_currency,
            &base_ccy,
            activity_date,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!(
                    "Holdings Calc (NetContrib Deposit {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.",
                    activity.id, activity_amount, activity_currency, &base_ccy, activity_date, e
                );
                Decimal::ZERO
            }
        };

        state.net_contribution += amount_acct;
        state.net_contribution_base += amount_base;
        Ok(())
    }

    /// Handle WITHDRAWAL activity.
    /// Books cash outflow in ACTIVITY currency.
    /// Updates net_contribution in account currency.
    fn handle_withdrawal(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();
        let activity_amount = activity.amt();

        // Book cash outflow in ACTIVITY currency (amount + fee)
        let net_amount = activity_amount + activity.fee_amt();
        add_cash(state, activity_currency, -net_amount);

        // Convert for net_contribution (pre-fee amount in account currency)
        let amount_acct = self.convert_to_account_currency(
            activity_amount,
            activity,
            account_currency,
            "Withdrawal Amount",
        );

        // Convert for net_contribution_base
        let base_ccy = self.base_currency.read().unwrap();
        let amount_base = match self.fx_service.convert_currency_for_date(
            activity_amount,
            activity_currency,
            &base_ccy,
            activity_date,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!(
                    "Holdings Calc (NetContrib Withdrawal {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.",
                    activity.id, activity_amount, activity_currency, &base_ccy, activity_date, e
                );
                Decimal::ZERO
            }
        };

        state.net_contribution -= amount_acct;
        state.net_contribution_base -= amount_base;
        Ok(())
    }

    /// Handle DIVIDEND/INTEREST/CREDIT activities.
    /// Books cash inflow in ACTIVITY currency.
    /// Income does NOT affect net_contribution.
    fn handle_income(&self, activity: &Activity, state: &mut AccountStateSnapshot) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_amount = activity.amt();

        // Book cash in ACTIVITY currency (amount - fee)
        let net_amount = activity_amount - activity.fee_amt();
        add_cash(state, activity_currency, net_amount);

        // Income does not affect net_contribution
        Ok(())
    }

    /// Handle FEE/TAX activities.
    /// Books cash outflow in ACTIVITY currency.
    /// Charges do NOT affect net_contribution.
    fn handle_charge(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        activity_type: &ActivityType,
    ) -> Result<()> {
        let activity_currency = &activity.currency;

        // Determine charge amount: prefer fee field, fall back to amount
        let charge = if activity.fee_amt() != Decimal::ZERO {
            activity.fee_amt()
        } else {
            activity.amt()
        };

        if charge == Decimal::ZERO {
            warn!(
                "Activity {} ({}): 'fee' and 'amount' are both zero. No cash change.",
                activity.id,
                activity_type.as_str()
            );
            return Ok(());
        }

        // Book cash outflow in ACTIVITY currency
        add_cash(state, activity_currency, -charge.abs());

        // Charges do not affect net_contribution
        Ok(())
    }

    /// Handle TRANSFER_IN activity.
    /// Books cash/asset inflow in ACTIVITY currency.
    /// Default: INTERNAL (no net_contribution change).
    /// If metadata.kind == "EXTERNAL", treats as external deposit.
    fn handle_transfer_in(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        asset_currency_cache: &mut HashMap<String, (String, bool)>,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_amount = activity.amt();
        let asset_id = activity.asset_id.as_deref().unwrap_or("");

        // Check if this is an EXTERNAL transfer (affects net_contribution)
        let is_external = self.is_external_transfer(activity);

        if is_cash_asset_id(asset_id) || asset_id.is_empty() {
            // Cash transfer: book in ACTIVITY currency
            let net_amount = activity_amount - activity.fee_amt();
            add_cash(state, activity_currency, net_amount);

            // Only update net_contribution if EXTERNAL
            if is_external {
                let activity_date = activity.activity_date.naive_utc().date();
                let amount_acct = self.convert_to_account_currency(
                    activity_amount,
                    activity,
                    account_currency,
                    "TransferIn Cash",
                );

                let base_ccy = self.base_currency.read().unwrap();
                let amount_base = match self.fx_service.convert_currency_for_date(
                    activity_amount,
                    activity_currency,
                    &base_ccy,
                    activity_date,
                ) {
                    Ok(c) => c,
                    Err(e) => {
                        warn!(
                            "Holdings Calc (NetContrib TransferIn Cash {}): Failed conversion {}: {}.",
                            activity.id, activity_currency, e
                        );
                        Decimal::ZERO
                    }
                };

                state.net_contribution += amount_acct;
                state.net_contribution_base += amount_base;
            }
        } else {
            // Asset transfer
            let activity_date = activity.activity_date.naive_utc().date();

            let position = self.get_or_create_position_mut_cached(
                state,
                asset_id,
                activity_currency,
                activity.activity_date,
                asset_currency_cache,
            )?;

            let position_currency = position.currency.clone();
            let needs_conversion =
                !position_currency.is_empty() && position_currency != activity.currency;

            // Get values for lot, converting if needed
            let (unit_price_for_lot, fee_for_lot, fx_rate_used) = if needs_conversion {
                let (converted_price, converted_fee, fx_rate) = self.convert_to_position_currency(
                    activity.price(),
                    activity.fee_amt(),
                    activity,
                    &position_currency,
                    account_currency,
                )?;
                (converted_price, converted_fee, fx_rate)
            } else {
                (activity.price(), activity.fee_amt(), None)
            };

            // Use add_lot_values to avoid cloning Activity
            let cost_basis_asset_curr = position.add_lot_values(
                activity.id.clone(),
                activity.qty(),
                unit_price_for_lot,
                fee_for_lot,
                activity.activity_date,
                fx_rate_used,
            )?;

            // Book fee in ACTIVITY currency
            add_cash(state, activity_currency, -activity.fee_amt());

            // Only update net_contribution if EXTERNAL
            if is_external {
                let cost_basis_acct = self.convert_position_amount_to_account_currency(
                    cost_basis_asset_curr,
                    &position_currency,
                    activity,
                    account_currency,
                    "Net Deposit TransferIn Asset",
                );

                let base_ccy = self.base_currency.read().unwrap();
                let cost_basis_base = match self.fx_service.convert_currency_for_date(
                    cost_basis_asset_curr,
                    &position_currency,
                    &base_ccy,
                    activity_date,
                ) {
                    Ok(converted) => converted,
                    Err(e) => {
                        warn!(
                            "Holdings Calc (NetContribBase TransferIn Asset {}): Failed conversion: {}.",
                            activity.id, e
                        );
                        cost_basis_asset_curr
                    }
                };

                state.net_contribution += cost_basis_acct;
                state.net_contribution_base += cost_basis_base;
            }
        }
        Ok(())
    }

    /// Handle TRANSFER_OUT activity.
    /// Books cash/asset outflow in ACTIVITY currency.
    /// Default: INTERNAL (no net_contribution change).
    /// If metadata.kind == "EXTERNAL", treats as external withdrawal.
    fn handle_transfer_out(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        _asset_currency_cache: &mut HashMap<String, (String, bool)>,
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_amount = activity.amt();
        let asset_id = activity.asset_id.as_deref().unwrap_or("");

        // Check if this is an EXTERNAL transfer (affects net_contribution)
        let is_external = self.is_external_transfer(activity);

        if is_cash_asset_id(asset_id) || asset_id.is_empty() {
            // Cash transfer: book outflow in ACTIVITY currency (amount + fee)
            let net_amount = activity_amount + activity.fee_amt();
            add_cash(state, activity_currency, -net_amount);

            // Only update net_contribution if EXTERNAL
            if is_external {
                let activity_date = activity.activity_date.naive_utc().date();
                let amount_acct = self.convert_to_account_currency(
                    activity_amount,
                    activity,
                    account_currency,
                    "TransferOut Cash",
                );

                let base_ccy = self.base_currency.read().unwrap();
                let amount_base = match self.fx_service.convert_currency_for_date(
                    activity_amount,
                    activity_currency,
                    &base_ccy,
                    activity_date,
                ) {
                    Ok(c) => c,
                    Err(e) => {
                        warn!(
                            "Holdings Calc (NetContrib TransferOut Cash {}): Failed conversion {}: {}.",
                            activity.id, activity_currency, e
                        );
                        Decimal::ZERO
                    }
                };

                state.net_contribution -= amount_acct;
                state.net_contribution_base -= amount_base;
            }
        } else {
            // Asset transfer
            let activity_date = activity.activity_date.naive_utc().date();

            // Book fee in ACTIVITY currency
            add_cash(state, activity_currency, -activity.fee_amt());

            if let Some(position) = state.positions.get_mut(asset_id) {
                let position_currency = position.currency.clone();
                if position_currency.is_empty() {
                    warn!(
                        "Position {} being transferred out has no currency set.",
                        position.id
                    );
                }

                let (_qty_reduced, cost_basis_removed) =
                    position.reduce_lots_fifo(activity.qty())?;

                // Only update net_contribution if EXTERNAL
                if is_external
                    && !position_currency.is_empty()
                    && cost_basis_removed != Decimal::ZERO
                {
                    let cost_basis_removed_acct = self.convert_position_amount_to_account_currency(
                        cost_basis_removed,
                        &position_currency,
                        activity,
                        account_currency,
                        "Net Deposit TransferOut Asset",
                    );

                    let base_ccy = self.base_currency.read().unwrap();
                    let cost_basis_removed_base = match self.fx_service.convert_currency_for_date(
                        cost_basis_removed,
                        &position_currency,
                        &base_ccy,
                        activity_date,
                    ) {
                        Ok(converted) => converted,
                        Err(e) => {
                            warn!(
                                "Holdings Calc (NetContribBase TransferOut Asset {}): Failed conversion: {}.",
                                activity.id, e
                            );
                            cost_basis_removed
                        }
                    };

                    state.net_contribution -= cost_basis_removed_acct;
                    state.net_contribution_base -= cost_basis_removed_base;
                }
            } else {
                warn!(
                    "Attempted to TransferOut non-existent position {} via activity {}. Fee applied only.",
                    asset_id, activity.id
                );
            }
        }
        Ok(())
    }

    /// Converts an amount from activity currency to account currency.
    /// If the activity has a valid fx_rate (Some and not zero), uses it directly.
    /// Otherwise, falls back to the FxService for conversion.
    /// The fx_rate represents the rate to convert from activity currency to account currency.
    fn convert_to_account_currency(
        &self,
        amount: Decimal,
        activity: &Activity,
        account_currency: &str,
        context: &str,
    ) -> Decimal {
        let activity_currency = &activity.currency;

        // If currencies are the same, no conversion needed
        if activity_currency == account_currency {
            return amount;
        }

        // Check if activity has a valid fx_rate (Some and not zero)
        if let Some(fx_rate) = activity.fx_rate {
            if fx_rate != Decimal::ZERO {
                // Use the provided fx_rate directly
                debug!(
                    "Using activity fx_rate {} for {} conversion {}->{} (activity {})",
                    fx_rate, context, activity_currency, account_currency, activity.id
                );
                return amount * fx_rate;
            }
        }

        // Fall back to FxService for conversion
        let activity_date = activity.activity_date.naive_utc().date();
        match self.fx_service.convert_currency_for_date(
            amount,
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc ({} {}): Failed conversion {} {}->{} on {}: {}. Using original amount.",
                    context, activity.id, amount, activity_currency, account_currency, activity_date, e
                );
                amount // Fallback to original amount
            }
        }
    }

    /// Determines the currency and alternative asset flag for a position.
    /// Returns (currency, is_alternative).
    fn get_position_info(&self, asset_id: &str) -> Result<(String, bool)> {
        debug!("Getting position info for asset_id: {}", asset_id);
        match self.asset_repository.get_by_id(asset_id) {
            Ok(asset) => {
                let is_alternative = asset.is_alternative();
                Ok((asset.currency, is_alternative))
            }
            Err(e) => {
                error!("Failed to get asset for asset_id '{}': {}", asset_id, e);
                Err(Error::Calculation(CalculatorError::Calculation(format!(
                    "Asset not found for id: {}",
                    asset_id
                ))))
            }
        }
    }

    /// Converts an amount from position currency to account currency.
    /// This is used for cost basis which is stored in position currency, not activity currency.
    /// When activity currency == position currency, uses activity's fx_rate if available.
    /// Otherwise, falls back to FxService with position currency.
    fn convert_position_amount_to_account_currency(
        &self,
        amount: Decimal,
        position_currency: &str,
        activity: &Activity,
        account_currency: &str,
        context: &str,
    ) -> Decimal {
        // If position currency matches account currency, no conversion needed
        if position_currency == account_currency {
            return amount;
        }

        // If activity currency matches position currency, we can use activity's fx_rate
        if activity.currency == position_currency {
            if let Some(fx_rate) = activity.fx_rate {
                if fx_rate != Decimal::ZERO {
                    debug!(
                        "Using activity fx_rate {} for {} conversion {}->{} (activity {})",
                        fx_rate, context, position_currency, account_currency, activity.id
                    );
                    return amount * fx_rate;
                }
            }
        }

        // Fall back to FxService for conversion
        let activity_date = activity.activity_date.naive_utc().date();
        match self.fx_service.convert_currency_for_date(
            amount,
            position_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc ({} {}): Failed conversion {} {}->{} on {}: {}. Using original amount.",
                    context, activity.id, amount, position_currency, account_currency, activity_date, e
                );
                amount // Fallback to original amount
            }
        }
    }

    /// Helper method to get/create position with asset currency caching.
    /// Uses cache to avoid repeated DB lookups for the same asset.
    /// Cache stores (currency, is_alternative) tuple for each asset.
    fn get_or_create_position_mut_cached<'a>(
        &self,
        state: &'a mut AccountStateSnapshot,
        asset_id: &str,
        activity_currency: &str,
        date: DateTime<Utc>,
        cache: &mut HashMap<String, (String, bool)>,
    ) -> std::result::Result<&'a mut Position, CalculatorError> {
        if asset_id.is_empty() || is_cash_asset_id(asset_id) {
            return Err(CalculatorError::InvalidActivity(format!(
                "Invalid asset_id for position: {}",
                asset_id
            )));
        }

        Ok(state
            .positions
            .entry(asset_id.to_string())
            .or_insert_with(|| {
                // Check cache first for (currency, is_alternative) tuple
                let (position_currency, is_alternative) = if let Some((ccy, is_alt)) = cache.get(asset_id) {
                    (ccy.clone(), *is_alt)
                } else {
                    // Lookup from asset repository
                    let (ccy, is_alt) = self.get_position_info(asset_id).unwrap_or_else(|_| {
                        warn!(
                            "Failed to get asset info for {}, using activity currency {} and is_alternative=false",
                            asset_id, activity_currency
                        );
                        (activity_currency.to_string(), false)
                    });
                    cache.insert(asset_id.to_string(), (ccy.clone(), is_alt));
                    (ccy, is_alt)
                };

                Position::new_with_alternative_flag(
                    state.account_id.clone(),
                    asset_id.to_string(),
                    position_currency,
                    date,
                    is_alternative,
                )
            }))
    }

    /// Converts unit_price and fee to position currency.
    /// Returns (converted_price, converted_fee, fx_rate_used).
    fn convert_to_position_currency(
        &self,
        unit_price: Decimal,
        fee: Decimal,
        activity: &Activity,
        position_currency: &str,
        account_currency: &str,
    ) -> Result<(Decimal, Decimal, Option<Decimal>)> {
        let activity_date = activity.activity_date.naive_utc().date();

        // Determine when we can use the activity's fx_rate for position currency conversion
        let can_use_fx_rate =
            position_currency == account_currency || activity.currency == account_currency;

        if can_use_fx_rate {
            if let Some(fx_rate) = activity.fx_rate.filter(|r| *r != Decimal::ZERO) {
                debug!(
                    "Using activity fx_rate {} for position currency conversion {} -> {} (activity {})",
                    fx_rate, activity.currency, position_currency, activity.id
                );
                return Ok((unit_price * fx_rate, fee * fx_rate, Some(fx_rate)));
            }
        }

        // Fall back to FxService
        let converted_price = self
            .fx_service
            .convert_currency_for_date(
                unit_price,
                &activity.currency,
                position_currency,
                activity_date,
            )
            .map_err(|e| {
                CalculatorError::CurrencyConversion(format!(
                    "Failed to convert unit_price from {} to {}: {}",
                    activity.currency, position_currency, e
                ))
            })?;

        let converted_fee = self
            .fx_service
            .convert_currency_for_date(fee, &activity.currency, position_currency, activity_date)
            .map_err(|e| {
                CalculatorError::CurrencyConversion(format!(
                    "Failed to convert fee from {} to {}: {}",
                    activity.currency, position_currency, e
                ))
            })?;

        // Calculate implied fx_rate for audit trail
        let fx_rate_used = if unit_price != Decimal::ZERO {
            Some(converted_price / unit_price)
        } else {
            None
        };

        Ok((converted_price, converted_fee, fx_rate_used))
    }

    /// Checks if a transfer activity is marked as EXTERNAL in metadata.
    /// EXTERNAL transfers affect net_contribution (like DEPOSIT/WITHDRAWAL).
    /// Default is INTERNAL (no net_contribution effect).
    ///
    /// Metadata structure: `{"flow": {"is_external": true}}`
    /// - If no `flow` key, or no `is_external` key, or `is_external` is false → INTERNAL
    /// - If `flow.is_external` is true → EXTERNAL
    fn is_external_transfer(&self, activity: &Activity) -> bool {
        if let Some(ref metadata) = activity.metadata {
            // Check for metadata.flow.is_external == true
            if let Some(flow) = metadata.get("flow") {
                if let Some(is_external) = flow.get("is_external").and_then(|v| v.as_bool()) {
                    return is_external;
                }
            }
        }
        false // Default to INTERNAL
    }

    /// Computes cash totals in account and base currencies.
    /// Called once at end of daily calculation per spec.
    fn compute_cash_totals(&self, state: &mut AccountStateSnapshot, target_date: NaiveDate) {
        let account_currency = &state.currency;
        let base_ccy = self.base_currency.read().unwrap();

        let mut total_acct = Decimal::ZERO;
        let mut total_base = Decimal::ZERO;

        for (currency, &amount) in &state.cash_balances {
            // Convert to account currency
            if currency == account_currency {
                total_acct += amount;
            } else {
                match self.fx_service.convert_currency_for_date(
                    amount,
                    currency,
                    account_currency,
                    target_date,
                ) {
                    Ok(converted) => total_acct += converted,
                    Err(e) => {
                        warn!(
                            "Failed to convert cash {} {} to account currency {}: {}. Using unconverted.",
                            amount, currency, account_currency, e
                        );
                        total_acct += amount;
                    }
                }
            }

            // Convert to base currency
            if currency == base_ccy.as_str() {
                total_base += amount;
            } else {
                match self.fx_service.convert_currency_for_date(
                    amount,
                    currency,
                    &base_ccy,
                    target_date,
                ) {
                    Ok(converted) => total_base += converted,
                    Err(e) => {
                        warn!(
                            "Failed to convert cash {} {} to base currency {}: {}. Using unconverted.",
                            amount, currency, &base_ccy, e
                        );
                        total_base += amount;
                    }
                }
            }
        }

        state.cash_total_account_currency = total_acct;
        state.cash_total_base_currency = total_base;
    }
}
