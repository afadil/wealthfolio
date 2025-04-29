use crate::activities::{Activity, ActivityType};
use crate::errors::{CalculatorError, Result};
use crate::fx::fx_traits::FxServiceTrait;
use crate::portfolio::snapshot::AccountStateSnapshot;
use crate::portfolio::snapshot::Position;

use chrono::{DateTime, NaiveDate, Utc};
use log::{debug, error, warn};
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Arc;

/// Calculates the holding state (positions, cash, cost basis, net deposits) based on activities.
/// It does not calculate market values or base currency conversions related to valuation.
#[derive(Clone)]
pub struct HoldingsCalculator {
    pub fx_service: Arc<dyn FxServiceTrait>, // only deals with activity/account currency adjustments
}

impl HoldingsCalculator {
    pub fn new(fx_service: Arc<dyn FxServiceTrait>) -> Self {
        Self { fx_service }
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
                 warn!("Position {} has no currency set. Skipping its cost basis.", position.id);
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
                 target_date // SNAPSHOT date
             ) {
                 Ok(converted_cost) => final_cost_basis_acct += converted_cost,
                 Err(e) => {
                     error!(
                         "Holdings Calc (Book Cost): Failed to convert {} {} to {} on {}: {}. Skipping position cost.",
                         position.total_cost_basis, position_currency, account_currency, target_date, e
                     );
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
        let activity_type = ActivityType::from_str(&activity.activity_type)
            .map_err(|_| CalculatorError::UnsupportedActivityType(activity.activity_type.clone()))?;

        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        // Convert activity amounts needed in account currency using ACTIVITY date
        let amount_acct = match self.fx_service.convert_currency_for_date(
            self.get_activity_amount(activity), 
            activity_currency, 
            account_currency, 
            activity_date
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
            activity_date
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
            ActivityType::Deposit => self.handle_deposit( state, account_currency, amount_acct, fee_acct),
            ActivityType::Withdrawal => self.handle_withdrawal( state, account_currency, amount_acct, fee_acct),
            ActivityType::Dividend | ActivityType::Interest => self.handle_income(state, account_currency, amount_acct, fee_acct),
            ActivityType::Fee | ActivityType::Tax => self.handle_charge(activity, state, account_currency, &activity_type),
            ActivityType::AddHolding => self.handle_add_holding(activity, state, account_currency, fee_acct),
            ActivityType::RemoveHolding => self.handle_remove_holding(activity, state, account_currency, fee_acct),
            ActivityType::TransferIn => self.handle_transfer_in(activity, state, account_currency, amount_acct, fee_acct),
            ActivityType::TransferOut => self.handle_transfer_out(activity, state, account_currency, amount_acct, fee_acct),
            ActivityType::Split => Ok(()), 
            ActivityType::ConversionIn => self.handle_conversion_in(activity, state, account_currency, amount_acct, fee_acct),
            ActivityType::ConversionOut => self.handle_conversion_out(activity, state, account_currency, amount_acct, fee_acct),
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

        let position = Self::get_or_create_position_mut(
            state,
            &activity.asset_id,
            activity_currency, 
            activity.activity_date,
        )?;
        let _cost_basis_asset_curr = position.add_lot(activity, &ActivityType::Buy)?;

        // Calculate total cost in Account Currency for cash adjustment
        let unit_price_acct = match self.fx_service.convert_currency_for_date(
            activity.unit_price, 
            activity_currency, 
            account_currency, 
            activity_date
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
            activity_date
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
            let (_qty_reduced, _cost_basis_sold_asset_curr) = 
                position.reduce_lots_fifo(activity.quantity)?;
            
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
        state: &mut AccountStateSnapshot, 
        account_currency: &str, 
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal // Already converted using activity date
    ) -> Result<()> { 
        let net_amount_acct = amount_acct - fee_acct;
        *state.cash_balances.entry(account_currency.to_string()).or_insert(Decimal::ZERO) += net_amount_acct;
        // Net deposit uses pre-fee amount, already converted correctly
        state.net_contribution += amount_acct;
        Ok(()) 
    }

    fn handle_withdrawal( 
        &self,
        state: &mut AccountStateSnapshot, 
        account_currency: &str, 
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal // Already converted using activity date
    ) -> Result<()> { 
        let net_amount_acct = amount_acct + fee_acct;
        *state.cash_balances.entry(account_currency.to_string()).or_insert(Decimal::ZERO) -= net_amount_acct;
        // Net deposit uses pre-fee amount, already converted correctly
        state.net_contribution -= amount_acct;
        Ok(()) 
    }

    fn handle_income( 
        &self,
        state: &mut AccountStateSnapshot, 
        account_currency: &str, 
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> { 
         let net_amount_acct = amount_acct - fee_acct;
         *state.cash_balances.entry(account_currency.to_string()).or_insert(Decimal::ZERO) += net_amount_acct;
         // Income does not affect net deposit
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
             warn!("Activity {} ({}): 'fee' and 'amount' are both zero. No cash change.", activity.id, activity_type.as_str());
             return Ok(());
        }

        let activity_currency = &activity.currency;
        let activity_date = activity.activity_date.naive_utc().date();

        // Convert the determined charge amount to account currency
        let charge_acct = match self.fx_service.convert_currency_for_date(
            raw_charge, 
            activity_currency, 
            account_currency, 
            activity_date
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

        let position = Self::get_or_create_position_mut(
            state,
            &activity.asset_id,
            activity_currency, 
            activity.activity_date,
        )?;
        let cost_basis_asset_curr = position.add_lot(activity, &ActivityType::AddHolding)?;

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
            activity_date
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
            
        state.net_contribution += cost_basis_acct_curr_for_deposit;
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

        { // Block for position borrow
            if let Some(position) = state.positions.get_mut(&activity.asset_id) {
                position_found = true;
                position_currency_opt = Some(position.currency.clone());
                if position.currency.is_empty() {
                     warn!("Position {} being removed has no currency set. Cannot calculate net deposit impact accurately.", position.id);
                }
                let (_qty_reduced, cost_basis_removed) = 
                    position.reduce_lots_fifo(activity.quantity)?;
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
                (cost_basis_removed_asset_curr_opt, position_currency_opt) {
                
                if !position_currency.is_empty() && cost_basis_removed_asset_curr != Decimal::ZERO {
                    // Convert asset cost basis removed to account currency using ACTIVITY date
                    let cost_basis_removed_acct_curr = match self.fx_service.convert_currency_for_date(
                        cost_basis_removed_asset_curr,
                        &position_currency,
                        account_currency,
                        activity_date
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
                        
                    state.net_contribution -= cost_basis_removed_acct_curr;
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
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            // Cash transfer
            let net_amount_acct = amount_acct - fee_acct;
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) += net_amount_acct;
            state.net_contribution += amount_acct; // Use pre-fee amount
        } else {
            // Asset transfer
            let activity_currency = &activity.currency;
            let activity_date = activity.activity_date.naive_utc().date();

            let position = Self::get_or_create_position_mut(
                state,
                &activity.asset_id,
                activity_currency,
                activity.activity_date,
            )?;
            let cost_basis_asset_curr = position.add_lot(activity, &ActivityType::TransferIn)?;

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
                activity_date
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
                
            state.net_contribution += cost_basis_acct_curr_for_deposit;
        }
        Ok(())
    }

     fn handle_transfer_out(
        &self,
        activity: &Activity,
        state: &mut AccountStateSnapshot,
        account_currency: &str,
        amount_acct: Decimal, // Already converted (if cash) using activity date
        fee_acct: Decimal, // Already converted using activity date
    ) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            // Cash transfer
            let net_amount_acct = amount_acct + fee_acct;
            *state
                .cash_balances
                .entry(account_currency.to_string())
                .or_insert(Decimal::ZERO) -= net_amount_acct;
            state.net_contribution -= amount_acct; // Use pre-fee amount
        } else {
            // Asset transfer
            let mut cost_basis_removed_asset_curr_opt: Option<Decimal> = None;
            let mut position_currency_opt: Option<String> = None;
            let mut position_found = false;
            let activity_date = activity.activity_date.naive_utc().date();

            { // Block for position borrow
                if let Some(position) = state.positions.get_mut(&activity.asset_id) {
                    position_found = true;
                    position_currency_opt = Some(position.currency.clone());
                     if position.currency.is_empty() {
                         warn!("Position {} being transferred out has no currency set. Cannot calculate net deposit impact accurately.", position.id);
                     }
                    let (_qty_reduced, cost_basis_removed) = 
                        position.reduce_lots_fifo(activity.quantity)?;
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
                    (cost_basis_removed_asset_curr_opt, position_currency_opt) {
                    
                    if !position_currency.is_empty() && cost_basis_removed_asset_curr != Decimal::ZERO {
                         // Convert asset cost basis removed to account currency using ACTIVITY date
                        let cost_basis_removed_acct_curr = match self.fx_service.convert_currency_for_date(
                            cost_basis_removed_asset_curr,
                            &position_currency,
                            account_currency,
                            activity_date
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
                           
                       state.net_contribution -= cost_basis_removed_acct_curr;
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

    fn handle_conversion_in( 
        &self,
        activity: &Activity, 
        state: &mut AccountStateSnapshot, 
        account_currency: &str, 
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal // Already converted using activity date
    ) -> Result<()> {
         if activity.asset_id.starts_with("$CASH") {
            let net_amount_acct = amount_acct - fee_acct;
            *state.cash_balances.entry(account_currency.to_string()).or_insert(Decimal::ZERO) += net_amount_acct;
            // Assumes ConversionIn affects net deposit like a regular deposit
            state.net_contribution += amount_acct;
        } else {
            warn!("Non-cash ConversionIn activity {} ignored by handle_conversion_in.", activity.id);
        }
        Ok(())
    }

    fn handle_conversion_out( 
        &self,
        activity: &Activity, 
        state: &mut AccountStateSnapshot, 
        account_currency: &str, 
        amount_acct: Decimal, // Already converted using activity date
        fee_acct: Decimal // Already converted using activity date
    ) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            let net_amount_acct = amount_acct + fee_acct;
            *state.cash_balances.entry(account_currency.to_string()).or_insert(Decimal::ZERO) -= net_amount_acct;
            // Assumes ConversionOut affects net deposit like a regular withdrawal
            state.net_contribution -= amount_acct;
        } else {
             warn!("Non-cash ConversionOut activity {} ignored by handle_conversion_out.", activity.id);
        }
        Ok(())
    }

    /// Gets amount from activity, handling missing values. Returns ZERO if missing.
    fn get_activity_amount(&self, activity: &Activity) -> Decimal {
        activity.amount.unwrap_or(Decimal::ZERO)
    }

    /// Helper method to get/create position. Sets Position currency based on the first activity.
    fn get_or_create_position_mut<'a>(
        state: &'a mut AccountStateSnapshot,
        asset_id: &str,
        activity_currency: &str, // Currency from the activity establishing the position
        date: DateTime<Utc>,
    ) -> std::result::Result<&'a mut Position, CalculatorError> {
        if asset_id.is_empty() || asset_id.starts_with("$CASH") {
            return Err(CalculatorError::InvalidActivity(format!(
                "Invalid asset_id for position: {}",
                asset_id
            )));
        }
        Ok(state
            .positions
            .entry(asset_id.to_string())
            .or_insert_with(|| {
                // Create new position using the currency from the first activity
                Position::new(
                    state.account_id.clone(),
                    asset_id.to_string(),
                    activity_currency.to_string(), 
                    date,
                )
            }))
    }
}
