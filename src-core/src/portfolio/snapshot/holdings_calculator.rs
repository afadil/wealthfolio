use crate::activities::{Activity, ActivityType};
use crate::assets::AssetRepositoryTrait;
use crate::constants::CASH_ASSET_PREFIX;
use crate::errors::{CalculatorError, Error, Result};
use crate::fx::fx_traits::FxServiceTrait;
use crate::portfolio::snapshot::AccountStateSnapshot;
use crate::portfolio::snapshot::Position;

use chrono::{DateTime, NaiveDate, Utc};
use log::{debug, error, warn};
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::{Arc, RwLock};

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
    pub fn calculate_next_holdings(
        &self,
        previous_snapshot: &AccountStateSnapshot,
        activities_today: &[Activity], // Assumes these are for the *target* date and already split-adjusted
        target_date: NaiveDate,
    ) -> Result<AccountStateSnapshot> {
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

        for activity in activities_today {
            if activity.activity_date.naive_utc().date() != target_date {
                warn!(
                    "Activity {} date {} does not match target snapshot date {}. Skipping.",
                    activity.id,
                    activity.activity_date.naive_utc().date(),
                    target_date
                );
                continue;
            }
            match self.process_single_activity(activity, &mut next_state, &account_currency) {
                Ok(_) => {} // Log success if needed
                Err(e) => {
                    // Using Error::Calculation which now directly wraps CalculatorError
                    let calc_error = CalculatorError::Calculation(format!(
                        "Error processing activity {} for account {} on date {}: {}",
                        activity.id, next_state.account_id, target_date, e
                    ));
                    error!("{}", calc_error);
                    // Decide whether to return Err(Error::Calculation(calc_error)) or continue
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

        next_state.id = format!(
            "{}_{}",
            next_state.account_id,
            target_date.format("%Y-%m-%d")
        );

        Ok(next_state)
    }

    /// Processes a single activity, updating positions, cash, and net_deposit.
    /// Uses fx rate cache only for converting activity amounts to account currency.
    fn process_single_activity(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
    ) -> Result<()> {
        let activity_type = ActivityType::from_str(&activity.activity_type).map_err(|_| {
            CalculatorError::UnsupportedActivityType(activity.activity_type.clone())
        })?;

        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        // Convert activity amounts needed in account currency using ACTIVITY date
        let amount_acct = match self.fx_service.convert_currency_for_date(
            self.get_activity_amount(activity),
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Activity Amount {}): Failed conversion {} {}->{} on {}: {}. Using original amount.",
                    activity.id, self.get_activity_amount(activity), activity_currency, account_currency, activity_date, e
                );
                self.get_activity_amount(activity) // Fallback to original amount
            }
        };

        let fee_acct = match self.fx_service.convert_currency_for_date(
            activity.fee,
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Activity Fee {}): Failed conversion {} {}->{} on {}: {}. Using original fee.",
                    activity.id, activity.fee, activity_currency, account_currency, activity_date, e
                );
                activity.fee // Fallback to original fee
            }
        };

        // Dispatch to Specific Handlers (signatures updated)
        match activity_type {
            ActivityType::Buy => self.handle_buy(activity, state, account_currency, fee_acct),
            ActivityType::Sell => self.handle_sell(activity, state, account_currency, fee_acct),
            ActivityType::Deposit => {
                self.handle_deposit(activity, state, account_currency, amount_acct, fee_acct)
            }
            ActivityType::Withdrawal => {
                self.handle_withdrawal(activity, state, account_currency, amount_acct, fee_acct)
            }
            ActivityType::Dividend | ActivityType::Interest => {
                self.handle_income(state, account_currency, amount_acct, fee_acct)
            }
            ActivityType::Fee | ActivityType::Tax => {
                self.handle_charge(activity, state, account_currency, &activity_type)
            }
            ActivityType::AddHolding => {
                self.handle_add_holding(activity, state, account_currency, fee_acct)
            }
            ActivityType::RemoveHolding => {
                self.handle_remove_holding(activity, state, account_currency, fee_acct)
            }
            ActivityType::TransferIn => {
                self.handle_transfer_in(activity, state, account_currency, amount_acct, fee_acct)
            }
            ActivityType::TransferOut => {
                self.handle_transfer_out(activity, state, account_currency, amount_acct, fee_acct)
            }
            ActivityType::Split => Ok(()),
        }
    }

    // --- Activity Type Handlers (Updated Signatures & Conversions) ---

    fn handle_buy(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        let position = self.get_or_create_position_mut(
            state,
            &activity.asset_id,
            activity_currency,
            activity.activity_date,
        )?;

        // Check if currency conversion is needed and handle accordingly
        let converted_activity;
        let activity_to_use = if position.currency.is_empty()
            || position.currency == activity.currency
        {
            // No conversion needed, use original activity directly
            activity
        } else {
            // Conversion needed, convert and store in local variable
            converted_activity =
                self.convert_activity_to_position_currency(activity, position, &ActivityType::Buy)?;
            &converted_activity
        };

        let _cost_basis_asset_curr = position.add_lot(activity_to_use)?;

        // Calculate total cost in Account Currency for cash adjustment
        let unit_price_acct = match self.fx_service.convert_currency_for_date(
            activity.unit_price,
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Buy Unit Price {}): Failed conversion {} {}->{} on {}: {}. Using original price.",
                    activity.id, activity.unit_price, activity_currency, account_currency, activity_date, e
                 );
                activity.unit_price // Fallback
            }
        };

        let total_cost_acct = (activity.quantity * unit_price_acct) + fee_acct;

        *state
            .cash_balances
            .entry(account_currency.to_string())
            .or_insert(Decimal::ZERO) -= total_cost_acct;

        Ok(())
    }

    fn handle_sell(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        let unit_price_acct = match self.fx_service.convert_currency_for_date(
            activity.unit_price,
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Sell Unit Price {}): Failed conversion {} {}->{} on {}: {}. Using original price.",
                    activity.id, activity.unit_price, activity_currency, account_currency, activity_date, e
                 );
                activity.unit_price // Fallback
            }
        };

        let total_proceeds_acct = (activity.quantity * unit_price_acct) - fee_acct;

        if let Some(position) = state.positions.get_mut(&activity.asset_id) {
            // Check if currency conversion is needed and handle accordingly
            let converted_activity;
            let activity_to_use =
                if position.currency.is_empty() || position.currency == activity.currency {
                    // No conversion needed, use original activity directly
                    activity
                } else {
                    // Conversion needed, convert and store in local variable
                    converted_activity = self.convert_activity_to_position_currency(
                        activity,
                        position,
                        &ActivityType::Sell,
                    )?;
                    &converted_activity
                };

            let (_qty_reduced, _cost_basis_sold_asset_curr) =
                position.reduce_lots_fifo(activity_to_use.quantity)?;

            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) += total_proceeds_acct;
        } else {
            warn!("Attempted to Sell non-existent/zero position {} via activity {}. Applying cash effect.",
                     activity.asset_id, activity.id);
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) += total_proceeds_acct;
        }
        Ok(())
    }

    fn handle_deposit(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal,    // Already converted using activity date
    ) -> Result<()> {
        let base_ccy = self.base_currency.read().unwrap();
        let activity_date = activity.activity_date.naive_utc().date();
        let activity_amount = activity.amount.unwrap_or(Decimal::ZERO);
        let amount_base = match self.fx_service.convert_currency_for_date(
            activity_amount,
            &activity.currency,
            &base_ccy,
            activity_date,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!("Holdings Calc (NetContrib Deposit {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.", activity.id, activity_amount, &activity.currency, &base_ccy, activity_date, e);
                Decimal::ZERO
            }
        };

        let net_amount_acct = amount_acct - fee_acct;
        *state
            .cash_balances
            .entry(account_currency.to_string())
            .or_insert(Decimal::ZERO) += net_amount_acct;
        // Net deposit uses pre-fee amount, already converted correctly
        state.net_contribution += amount_acct;
        state.net_contribution_base += amount_base;
        Ok(())
    }

    fn handle_withdrawal(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal,    // Already converted using activity date
    ) -> Result<()> {
        let base_ccy = self.base_currency.read().unwrap();
        let activity_date = activity.activity_date.naive_utc().date();
        let activity_amount = activity.amount.unwrap_or(Decimal::ZERO);
        let amount_base = match self.fx_service.convert_currency_for_date(
            activity_amount,
            &activity.currency,
            &base_ccy,
            activity_date,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!("Holdings Calc (NetContrib Withdrawal {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.", activity.id, activity_amount, &activity.currency, &base_ccy, activity_date, e);
                Decimal::ZERO
            }
        };

        let net_amount_acct = amount_acct + fee_acct;
        *state
            .cash_balances
            .entry(account_currency.to_string())
            .or_insert(Decimal::ZERO) -= net_amount_acct;
        // Net deposit uses pre-fee amount, already converted correctly
        state.net_contribution -= amount_acct;
        state.net_contribution_base -= amount_base;
        Ok(())
    }

    fn handle_income(
        &self,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal,    // Already converted using activity date
    ) -> Result<()> {
        let net_change = amount_acct - fee_acct;
        *state
            .cash_balances
            .entry(account_currency.to_string())
            .or_insert(Decimal::ZERO) += net_change;
        // Income does not affect the net contribution.
        Ok(())
    }

    fn handle_charge(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        activity_type: &ActivityType,
    ) -> Result<()> {
        // Determine charge amount from raw activity values first
        let raw_charge = if activity.fee != Decimal::ZERO {
            activity.fee
        } else {
            activity.amount.unwrap_or(Decimal::ZERO)
        };

        if raw_charge == Decimal::ZERO {
            warn!(
                "Activity {} ({}): 'fee' and 'amount' are both zero. No cash change.",
                activity.id,
                activity_type.as_str()
            );
            return Ok(());
        }

        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        // Convert the determined charge amount to account currency
        let charge_acct = match self.fx_service.convert_currency_for_date(
            raw_charge,
            activity_currency,
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Charge Activity {}): Failed conversion {} {}->{} on {}: {}. Using zero charge.",
                    activity.id, raw_charge, activity_currency, account_currency, activity_date, e
                 );
                Decimal::ZERO // Fallback to zero on error
            }
        };

        if charge_acct != Decimal::ZERO {
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= charge_acct.abs();
        }
        // Charges do not affect net deposit
        Ok(())
    }

    fn handle_add_holding(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        let position = self.get_or_create_position_mut(
            state,
            &activity.asset_id,
            activity_currency,
            activity.activity_date,
        )?;

        // Check if currency conversion is needed and handle accordingly
        let converted_activity;
        let activity_to_use =
            if position.currency.is_empty() || position.currency == activity.currency {
                // No conversion needed, use original activity directly
                activity
            } else {
                // Conversion needed, convert and store in local variable
                converted_activity = self.convert_activity_to_position_currency(
                    activity,
                    position,
                    &ActivityType::AddHolding,
                )?;
                &converted_activity
            };

        let cost_basis_asset_curr = position.add_lot(activity_to_use)?;

        // Adjust cash for fee (already in account currency)
        *state
            .cash_balances
            .entry(account_currency.to_string())
            .or_insert(Decimal::ZERO) -= fee_acct;

        // Convert asset cost basis to account currency using ACTIVITY date for net deposit
        let cost_basis_acct_curr_for_deposit = match self.fx_service.convert_currency_for_date(
            cost_basis_asset_curr,
            activity_currency, // Position currency = activity currency here
            account_currency,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (Net Deposit AddHolding {}): Failed conversion {} {}->{} on {}: {}. Net deposit unchanged.",
                    activity.id, cost_basis_asset_curr, activity_currency, account_currency, activity_date, e
                );
                Decimal::ZERO // Fallback to zero change
            }
        };

        let base_ccy = self.base_currency.read().unwrap();
        let cost_basis_base_for_deposit = match self.fx_service.convert_currency_for_date(
            cost_basis_asset_curr,
            activity_currency,
            &base_ccy,
            activity_date,
        ) {
            Ok(converted) => converted,
            Err(e) => {
                warn!(
                    "Holdings Calc (NetContribBase AddHolding {}): Failed conversion {} {}->{} on {}: {}. Adding unconverted amount to base contribution.",
                    activity.id, cost_basis_asset_curr, activity_currency, &base_ccy, activity_date, e
                );
                cost_basis_asset_curr // Fallback to unconverted amount
            }
        };

        state.net_contribution += cost_basis_acct_curr_for_deposit;
        state.net_contribution_base += cost_basis_base_for_deposit;
        Ok(())
    }

    fn handle_remove_holding(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        let mut cost_basis_removed_asset_curr_opt: Option<Decimal> = None;
        let mut position_currency_opt: Option<String> = None;
        let mut position_found = false;
        let activity_date = activity.activity_date.naive_utc().date();

        {
            // Block for position borrow
            if let Some(position) = state.positions.get_mut(&activity.asset_id) {
                position_found = true;
                position_currency_opt = Some(position.currency.clone());
                if position.currency.is_empty() {
                    warn!("Position {} being removed has no currency set. Cannot calculate net deposit impact accurately.", position.id);
                }

                // Check if currency conversion is needed and handle accordingly
                let converted_activity;
                let activity_to_use =
                    if position.currency.is_empty() || position.currency == activity.currency {
                        // No conversion needed, use original activity directly
                        activity
                    } else {
                        // Conversion needed, convert and store in local variable
                        converted_activity = self.convert_activity_to_position_currency(
                            activity,
                            position,
                            &ActivityType::RemoveHolding,
                        )?;
                        &converted_activity
                    };

                let (_qty_reduced, cost_basis_removed) =
                    position.reduce_lots_fifo(activity_to_use.quantity)?;
                cost_basis_removed_asset_curr_opt = Some(cost_basis_removed);
            }
        } // Borrow ends

        if position_found {
            // Adjust cash for fee
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= fee_acct;

            // Adjust net deposit if cost basis was removed and currency is known
            if let (Some(cost_basis_removed_asset_curr), Some(position_currency)) =
                (cost_basis_removed_asset_curr_opt, position_currency_opt)
            {
                if !position_currency.is_empty() && cost_basis_removed_asset_curr != Decimal::ZERO {
                    // Convert asset cost basis removed to account currency using ACTIVITY date
                    let cost_basis_removed_acct_curr = match self
                        .fx_service
                        .convert_currency_for_date(
                            cost_basis_removed_asset_curr,
                            &position_currency,
                            account_currency,
                            activity_date,
                        ) {
                        Ok(converted) => converted,
                        Err(e) => {
                            warn!(
                                "Holdings Calc (Net Deposit RemoveHolding {}): Failed conversion {} {}->{} on {}: {}. Net deposit unchanged.",
                                activity.id, cost_basis_removed_asset_curr, position_currency, account_currency, activity_date, e
                            );
                            Decimal::ZERO // Fallback to zero change
                        }
                    };

                    let base_ccy = self.base_currency.read().unwrap();
                    let cost_basis_removed_base = match self.fx_service.convert_currency_for_date(
                        cost_basis_removed_asset_curr,
                        &position_currency,
                        &base_ccy,
                        activity_date,
                    ) {
                        Ok(converted) => converted,
                        Err(e) => {
                            warn!(
                                "Holdings Calc (NetContribBase RemoveHolding {}): Failed conversion {} {}->{} on {}: {}. Adding unconverted amount to base contribution.",
                                activity.id, cost_basis_removed_asset_curr, position_currency, &base_ccy, activity_date, e
                            );
                            cost_basis_removed_asset_curr // Fallback to unconverted amount
                        }
                    };

                    state.net_contribution -= cost_basis_removed_acct_curr;
                    state.net_contribution_base -= cost_basis_removed_base;
                } else if position_currency.is_empty() {
                    // Warning already issued above if currency was empty
                } // else cost_basis_removed_asset_curr is zero, no change needed
            }
        } else {
            warn!("Attempted to RemoveHolding non-existent/zero position {} via activity {}. Applying fee only.",
                        activity.asset_id, activity.id);
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= fee_acct;
        }
        Ok(())
    }

    fn handle_transfer_in(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted (if cash) using activity date
        fee_acct: Decimal,    // Already converted using activity date
    ) -> Result<()> {
        if activity.asset_id.starts_with(CASH_ASSET_PREFIX) {
            // Cash transfer
            let base_ccy = self.base_currency.read().unwrap();
            let activity_date = activity.activity_date.naive_utc().date();
            let activity_amount = self.get_activity_amount(activity);

            let amount_base = match self.fx_service.convert_currency_for_date(
                activity_amount,
                &activity.currency,
                &base_ccy,
                activity_date,
            ) {
                Ok(c) => c,
                Err(e) => {
                    warn!("Holdings Calc (NetContrib TransferIn Cash {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.", activity.id, activity_amount, &activity.currency, &base_ccy, activity_date, e);
                    Decimal::ZERO
                }
            };
            let net_amount_acct = amount_acct - fee_acct;
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) += net_amount_acct;
            state.net_contribution += amount_acct; // Use pre-fee amount
            state.net_contribution_base += amount_base;
        } else {
            // Asset transfer
            let activity_currency = &activity.currency;
            let activity_date = activity.activity_date.naive_utc().date();

            let position = self.get_or_create_position_mut(
                state,
                &activity.asset_id,
                activity_currency,
                activity.activity_date,
            )?;

            // Check if currency conversion is needed and handle accordingly
            let converted_activity;
            let activity_to_use =
                if position.currency.is_empty() || position.currency == activity.currency {
                    // No conversion needed, use original activity directly
                    activity
                } else {
                    // Conversion needed, convert and store in local variable
                    converted_activity = self.convert_activity_to_position_currency(
                        activity,
                        position,
                        &ActivityType::TransferIn,
                    )?;
                    &converted_activity
                };

            let cost_basis_asset_curr = position.add_lot(activity_to_use)?;

            // Adjust cash for fee (already in account currency)
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= fee_acct;

            // Convert asset cost basis to account currency using ACTIVITY date for net deposit
            let cost_basis_acct_curr_for_deposit = match self.fx_service.convert_currency_for_date(
                cost_basis_asset_curr,
                activity_currency,
                account_currency,
                activity_date,
            ) {
                Ok(converted) => converted,
                Err(e) => {
                    warn!(
                          "Holdings Calc (Net Deposit TransferIn Asset {}): Failed conversion {} {}->{} on {}: {}. Net deposit unchanged.",
                          activity.id, cost_basis_asset_curr, activity_currency, account_currency, activity_date, e
                      );
                    Decimal::ZERO // Fallback to zero change
                }
            };

            let base_ccy = self.base_currency.read().unwrap();
            let cost_basis_base_for_deposit = match self.fx_service.convert_currency_for_date(
                cost_basis_asset_curr,
                activity_currency,
                &base_ccy,
                activity_date,
            ) {
                Ok(converted) => converted,
                Err(e) => {
                    warn!(
                          "Holdings Calc (NetContribBase TransferIn Asset {}): Failed conversion {} {}->{} on {}: {}. Adding unconverted amount to base contribution.",
                          activity.id, cost_basis_asset_curr, activity_currency, &base_ccy, activity_date, e
                      );
                    cost_basis_asset_curr // Fallback to unconverted amount
                }
            };

            state.net_contribution += cost_basis_acct_curr_for_deposit;
            state.net_contribution_base += cost_basis_base_for_deposit;
        }
        Ok(())
    }

    fn handle_transfer_out(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted (if cash) using activity date
        fee_acct: Decimal,    // Already converted using activity date
    ) -> Result<()> {
        if activity.asset_id.starts_with(CASH_ASSET_PREFIX) {
            // Cash transfer
            let base_ccy = self.base_currency.read().unwrap();
            let activity_date = activity.activity_date.naive_utc().date();
            let activity_amount = self.get_activity_amount(activity);

            let amount_base = match self.fx_service.convert_currency_for_date(
                activity_amount,
                &activity.currency,
                &base_ccy,
                activity_date,
            ) {
                Ok(c) => c,
                Err(e) => {
                    warn!("Holdings Calc (NetContrib TransferOut Cash {}): Failed conversion {} {}->{} on {}: {}. Base contribution not updated.", activity.id, activity_amount, &activity.currency, &base_ccy, activity_date, e);
                    Decimal::ZERO
                }
            };
            let net_amount_acct = amount_acct + fee_acct;
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= net_amount_acct;
            state.net_contribution -= amount_acct; // Use pre-fee amount
            state.net_contribution_base -= amount_base;
        } else {
            // Asset transfer
            let mut cost_basis_removed_asset_curr_opt: Option<Decimal> = None;
            let mut position_currency_opt: Option<String> = None;
            let mut position_found = false;
            let activity_date = activity.activity_date.naive_utc().date();

            {
                // Block for position borrow
                if let Some(position) = state.positions.get_mut(&activity.asset_id) {
                    position_found = true;
                    position_currency_opt = Some(position.currency.clone());
                    if position.currency.is_empty() {
                        warn!("Position {} being transferred out has no currency set. Cannot calculate net deposit impact accurately.", position.id);
                    }

                    // Check if currency conversion is needed and handle accordingly
                    let converted_activity;
                    let activity_to_use =
                        if position.currency.is_empty() || position.currency == activity.currency {
                            // No conversion needed, use original activity directly
                            activity
                        } else {
                            // Conversion needed, convert and store in local variable
                            converted_activity = self.convert_activity_to_position_currency(
                                activity,
                                position,
                                &ActivityType::TransferOut,
                            )?;
                            &converted_activity
                        };

                    let (_qty_reduced, cost_basis_removed) =
                        position.reduce_lots_fifo(activity_to_use.quantity)?;
                    cost_basis_removed_asset_curr_opt = Some(cost_basis_removed);
                }
            } // Borrow ends

            if position_found {
                // Adjust cash for fee
                *state
                    .cash_balances
                    .entry(account_currency.to_string())
                    .or_insert(Decimal::ZERO) -= fee_acct;

                // Adjust net deposit if cost basis was removed and currency is known
                if let (Some(cost_basis_removed_asset_curr), Some(position_currency)) =
                    (cost_basis_removed_asset_curr_opt, position_currency_opt)
                {
                    if !position_currency.is_empty()
                        && cost_basis_removed_asset_curr != Decimal::ZERO
                    {
                        // Convert asset cost basis removed to account currency using ACTIVITY date
                        let cost_basis_removed_acct_curr = match self
                            .fx_service
                            .convert_currency_for_date(
                                cost_basis_removed_asset_curr,
                                &position_currency,
                                account_currency,
                                activity_date,
                            ) {
                            Ok(converted) => converted,
                            Err(e) => {
                                warn!(
                                    "Holdings Calc (Net Deposit TransferOut Asset {}): Failed conversion {} {}->{} on {}: {}. Net deposit unchanged.",
                                    activity.id, cost_basis_removed_asset_curr, position_currency, account_currency, activity_date, e
                                );
                                Decimal::ZERO // Fallback to zero change
                            }
                        };

                        let base_ccy = self.base_currency.read().unwrap();
                        let cost_basis_removed_base = match self
                            .fx_service
                            .convert_currency_for_date(
                                cost_basis_removed_asset_curr,
                                &position_currency,
                                &base_ccy,
                                activity_date,
                            ) {
                            Ok(converted) => converted,
                            Err(e) => {
                                warn!(
                                    "Holdings Calc (NetContribBase TransferOut Asset {}): Failed conversion {} {}->{} on {}: {}. Adding unconverted amount to base contribution.",
                                    activity.id, cost_basis_removed_asset_curr, position_currency, &base_ccy, activity_date, e
                                );
                                cost_basis_removed_asset_curr // Fallback to unconverted amount
                            }
                        };

                        state.net_contribution -= cost_basis_removed_acct_curr;
                        state.net_contribution_base -= cost_basis_removed_base;
                    } else if position_currency.is_empty() {
                        // Warning already issued above
                    } // else cost_basis_removed_asset_curr is zero, no change needed
                }
            } else {
                warn!("Attempted to TransferOut non-existent/zero position {} via activity {}. Applying fee only.",
                             activity.asset_id, activity.id);
                *state
                    .cash_balances
                    .entry(account_currency.to_string())
                    .or_insert(Decimal::ZERO) -= fee_acct;
            }
        }
        Ok(())
    }

    /// Gets amount from activity, handling missing values. Returns ZERO if missing.
    fn get_activity_amount(&self, activity: &Activity) -> Decimal {
        activity.amount.unwrap_or(Decimal::ZERO)
    }

    /// Determines the correct currency for a position based on the asset's listing currency.
    /// If the asset's listing currency cannot be determined, falls back to the activity currency.
    fn get_position_currency(&self, asset_id: &str) -> Result<String> {
        debug!("Getting position currency for asset_id: {}", asset_id);
        match self.asset_repository.get_by_id(asset_id) {
            Ok(asset) => Ok(asset.currency),
            Err(e) => {
                error!("Failed to get asset for asset_id '{}': {}", asset_id, e);
                Err(Error::Calculation(CalculatorError::Calculation(format!(
                    "Asset not found for id: {}",
                    asset_id
                ))))
            }
        }
    }

    /// Converts an activity to match the position's currency if needed.
    /// Returns a converted activity only when conversion is actually required.
    fn convert_activity_to_position_currency(
        &self,
        activity: &Activity,
        position: &Position,
        activity_type: &ActivityType, // Use enum instead of string
    ) -> Result<Activity> {
        // Early return without cloning if no conversion is needed
        if position.currency.is_empty() || position.currency == activity.currency {
            return Err(CalculatorError::InvalidActivity(
                "convert_activity_to_position_currency should only be called when conversion is needed".to_string()
            ).into());
        }

        let activity_date = activity.activity_date.naive_utc().date();

        // Convert unit_price to position currency
        let converted_unit_price = self
            .fx_service
            .convert_currency_for_date(
                activity.unit_price,
                &activity.currency,
                &position.currency,
                activity_date,
            )
            .map_err(|e| {
                CalculatorError::CurrencyConversion(format!(
                "Failed to convert {:?} activity {} unit price from {} to position currency {}: {}",
                activity_type, activity.id, activity.currency, position.currency, e
            ))
            })?;

        // Convert fee to position currency
        let converted_fee = self
            .fx_service
            .convert_currency_for_date(
                activity.fee,
                &activity.currency,
                &position.currency,
                activity_date,
            )
            .map_err(|e| {
                CalculatorError::CurrencyConversion(format!(
                    "Failed to convert {:?} activity {} fee from {} to position currency {}: {}",
                    activity_type, activity.id, activity.currency, position.currency, e
                ))
            })?;

        // Create converted activity only when actually needed
        let mut converted_activity = activity.clone();
        converted_activity.unit_price = converted_unit_price;
        converted_activity.fee = converted_fee;
        converted_activity.currency = position.currency.clone();

        Ok(converted_activity)
    }

    /// Helper method to get/create position. Sets Position currency based on the asset's listing currency.
    /// Falls back to activity currency if asset listing currency cannot be determined.
    fn get_or_create_position_mut<'a>(
        &self,
        state: &'a mut AccountStateSnapshot,
        asset_id: &str,
        activity_currency: &str, // Currency from the activity (used as fallback)
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
                // Create new position using the asset's listing currency
                let position_currency = self.get_position_currency(asset_id).unwrap_or_else(|_| {
                    warn!(
                        "Failed to get asset currency for {}, using activity currency {}",
                        asset_id, activity_currency
                    );
                    activity_currency.to_string()
                });
                Position::new(
                    state.account_id.clone(),
                    asset_id.to_string(),
                    position_currency,
                    date,
                )
            }))
    }
}
