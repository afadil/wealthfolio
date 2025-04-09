use std::collections::HashMap;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};

use crate::holdings::{Position, CashHolding, Holding};
use crate::holdings::holdings_model::{is_quantity_significant, ROUNDING_SCALE};
use crate::holdings::holdings_errors::{Result, CalculatorError}; // Use errors if needed within methods
use log::info; 

#[derive(Debug, Default)]
pub(super) struct AccountState { // Visible only within calculator module
    pub(super) account_id: String,
    pub(super) positions: HashMap<String, Position>,
    pub(super) cash_balances: HashMap<String, Decimal>,
}

impl AccountState {
    pub(super) fn new(account_id: String) -> Self {
        AccountState { account_id, ..Default::default() }
    }

    // Helper method to get/create position
    pub(super) fn get_or_create_position_mut(
        &mut self,
        asset_id: &str,
        currency: &str,
        date: DateTime<Utc>
    ) -> Result<&mut Position> { 
         if asset_id.is_empty() {
            return Err(CalculatorError::InvalidActivity("Missing asset_id".to_string()));
         }
         // Assuming Position::new exists and is accessible
         Ok(self.positions.entry(asset_id.to_string())
             .or_insert_with(|| Position::new(
                self.account_id.clone(),
                asset_id.to_string(),
                currency.to_string(),
                date
             )))
    }

    // Helper method to update cash
    pub(super) fn update_cash(&mut self, currency: &str, change: Decimal) {
        if !change.is_zero() {
            let balance = self.cash_balances.entry(currency.to_string()).or_insert(Decimal::ZERO);
            *balance += change;
        }
    }

    /// Consumes the internal state and returns the finalized list of Holdings,
    /// filtering out insignificant quantities.
    pub(super) fn finalize_holdings(self, final_date: DateTime<Utc>) -> Vec<Holding> {
        let account_id = self.account_id; // Capture account_id before consuming self
        let mut holdings = Vec::new();

        // Add security positions (consuming self.positions)
        for (_, position) in self.positions { // `into_iter()` takes ownership
             // Final check on significance before adding to output
             if is_quantity_significant(&position.quantity) {
                 holdings.push(Holding::Security(position));
             }
        }

        // Add cash holdings (consuming self.cash_balances)
        for (currency, amount) in self.cash_balances { // `into_iter()` takes ownership
             // Final check on significance before adding to output
             if is_quantity_significant(&amount) {
                 holdings.push(Holding::Cash(CashHolding {
                     id: format!("CASH-{}-{}", currency, account_id), // Stable ID
                     account_id: account_id.clone(),
                     currency,
                     amount: amount.round_dp(ROUNDING_SCALE), // Final rounding
                     last_updated: final_date, // Use the provided date
                 }));
             } else {
                  info!("Excluding zero/insignificant cash balance for {} in account {}.", currency, account_id);
             }
        }

        // Sort holdings by asset_id
        holdings.sort_by(|a, b| {
            match (a, b) {
                (Holding::Security(pos_a), Holding::Security(pos_b)) => pos_a.asset_id.cmp(&pos_b.asset_id),
                (Holding::Cash(_), Holding::Security(_)) => std::cmp::Ordering::Greater,
                (Holding::Security(_), Holding::Cash(_)) => std::cmp::Ordering::Less,
                (Holding::Cash(cash_a), Holding::Cash(cash_b)) => cash_a.currency.cmp(&cash_b.currency),
            }
        });

        holdings
    }
}