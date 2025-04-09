use chrono::{DateTime, Utc};
use log::{debug, error, warn};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::default::Default;

use crate::activities::Activity;
use crate::activities::ActivityType;

use crate::utils::decimal_serde::*;

use super::{CalculatorError, Result};


pub const ROUNDING_SCALE: u32 = 8;
pub const QUANTITY_THRESHOLD: &str = "0.0000000001";

// Helper function from previous examples
pub fn is_quantity_significant(quantity: &Decimal) -> bool {
    let threshold =
        Decimal::from_str_radix(QUANTITY_THRESHOLD, 10).unwrap_or_else(|_| Decimal::new(1, 8));
    quantity.abs() >= threshold
}


#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    #[serde(with = "decimal_serde")]
    pub quantity: Decimal,
    #[serde(with = "decimal_serde")]
    pub average_cost: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_cost_basis: Decimal, //presents the total original cost incurred to acquire all the shares currently held in that specific position within that account.
    pub currency: String,
    pub inception_date: DateTime<Utc>,
    pub lots: Vec<Lot>,
}

impl Default for Position {
    fn default() -> Self {
        Position {
            id: String::new(),
            account_id: String::new(),
            asset_id: String::new(),
            quantity: Decimal::ZERO,
            average_cost: Decimal::ZERO,
            total_cost_basis: Decimal::ZERO,
            currency: String::new(),
            inception_date: Utc::now(),
            lots: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lot {
    pub id: String,
    pub position_id: String,
    pub acquisition_date: DateTime<Utc>,
    #[serde(with = "decimal_serde")]
    pub quantity: Decimal,
    #[serde(with = "decimal_serde")]
    pub cost_basis: Decimal, //Represents the total amount paid for the entire lot, including any fees or commissions
    #[serde(with = "decimal_serde")]
    pub acquisition_price: Decimal, //Represents the price per share/unit of the security at the time of purchase
    #[serde(with = "decimal_serde")]
    pub acquisition_fees: Decimal,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashHolding {
    pub id: String, // e.g., "CASH-USD-ACCT123"
    pub account_id: String,
    pub currency: String, // "USD", "EUR" - acts as asset_id for cash
    #[serde(with = "decimal_serde")]
    pub amount: Decimal,
    pub last_updated: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "holdingType", rename_all = "camelCase")]
pub enum Holding {
    // Represents anything held within an account
    Security(Position),
    Cash(CashHolding),
}

impl Position {
    // Simplified constructor
   pub fn new(account_id: String, asset_id: String, currency: String, date: DateTime<Utc>) -> Self {
        Position {
            id: format!("POS-{}-{}", asset_id, account_id), // Example ID generation
            account_id,
            asset_id,
            quantity: Decimal::ZERO,
            average_cost: Decimal::ZERO,
            total_cost_basis: Decimal::ZERO,
            currency,
            inception_date: date, // Initial inception date
            lots: Vec::new(),
        }
    }

    /// Recalculates aggregates based on current lots. Essential internal function.
    pub fn recalculate_aggregates(&mut self) {
        let total_quantity: Decimal = self.lots.iter().map(|lot| lot.quantity).sum();
        let total_cost_basis: Decimal = self.lots.iter().map(|lot| lot.cost_basis).sum();

        // Store unrounded aggregates internally
        self.quantity = total_quantity;
        self.total_cost_basis = total_cost_basis;

        if self.quantity.is_sign_positive() && is_quantity_significant(&self.quantity) {
            // Calculate average cost using unrounded values, round only the final average cost result *here*
            // OR potentially defer rounding even this until finalize_holdings
            self.average_cost =self.total_cost_basis / self.quantity;
        } else {
            // Zero, negative, or insignificant quantity
            if !self.quantity.is_zero() && !self.quantity.is_sign_negative() {
                warn!("Position {} quantity ({}) became insignificant after recalculation. Average cost zeroed.", self.id, self.quantity);
            }
            if self.quantity.is_zero() || self.quantity.is_sign_negative() {
                if !self.lots.is_empty() {
                    warn!(
                        "Position {} quantity became zero or negative ({}). Aggregates zeroed, but lots retained.",
                        self.id, self.quantity
                    );
                }
            }
            self.quantity = Decimal::ZERO;
            self.total_cost_basis = Decimal::ZERO;
            self.average_cost = Decimal::ZERO;
        }

        // Update inception date if lots exist
        if let Some(first_lot) = self.lots.iter().min_by_key(|lot| lot.acquisition_date) {
            self.inception_date = first_lot.acquisition_date;
        }
        // Else: keep original inception date or reset if needed? Decide policy.
    }

    /// Adds a new lot based on an acquisition activity.
    /// activity_id is used for the Lot ID.
    pub fn add_lot(&mut self, activity: &Activity, activity_type: &ActivityType) -> Result<()> {
        if !activity.quantity.is_sign_positive() {
            warn!(
                "Skipping add_lot for activity {} with non-positive quantity: {}",
                activity.id, activity.quantity
            );
            return Ok(());
        }
        if self.currency != activity.currency {
            // This indicates a cross-currency buy, which is complex.
            // For now, we assume the position currency matches the activity currency.
            // A more robust solution would handle the FX aspect separately, likely impacting cash.
            error!(
                "Currency mismatch: Position {} ({}) vs Activity {} ({})",
                self.id, self.currency, activity.id, activity.currency
            );
            return Err(CalculatorError::InvalidActivity(format!(
                "Currency mismatch for BUY/ADD activity {}: Position {} vs Activity {}",
                activity.id, self.currency, activity.currency
            )));
        }

        let acquisition_price = activity.unit_price;
        let quantity = activity.quantity;
        let acquisition_fees = activity.fee; // Store the fee regardless

        // Cost basis ONLY includes fees for BUY activities
        let cost_basis = if *activity_type == ActivityType::Buy {
            ((quantity * acquisition_price) + acquisition_fees).round_dp(ROUNDING_SCALE)
        } else {
            // For AddHolding, TransferIn (Asset), ConversionIn (Asset), fee affects cash only, not basis
            (quantity * acquisition_price).round_dp(ROUNDING_SCALE)
        };

        let new_lot = Lot {
            id: activity.id.clone(), // Use activity ID as Lot ID
            position_id: self.id.clone(),
            acquisition_date: activity.activity_date,
            quantity,
            cost_basis,
            acquisition_price: acquisition_price.round_dp(ROUNDING_SCALE),
            acquisition_fees: acquisition_fees.round_dp(ROUNDING_SCALE),
        };

        self.lots.push(new_lot);
        self.lots.sort_by_key(|lot| lot.acquisition_date); // Keep sorted for FIFO

        self.recalculate_aggregates();
        Ok(())
    }

    /// Reduces position quantity using FIFO lot relief.
    /// Returns (actual_quantity_reduced, cost_basis_of_sold_lots).
    pub fn reduce_lots_fifo(
        &mut self,
        quantity_to_reduce_input: Decimal,
    ) -> Result<(Decimal, Decimal)> {
        if !quantity_to_reduce_input.is_sign_positive() {
            return Err(CalculatorError::InvalidActivity(
                "Quantity to reduce must be positive".to_string(),
            ));
        }

        // Recalculate current quantity from lots before attempting reduction for accuracy
        let available_quantity: Decimal = self.lots.iter().map(|lot| lot.quantity).sum();

        if !is_quantity_significant(&available_quantity) || available_quantity <= Decimal::ZERO {
            warn!("Attempting to reduce position {} which has zero/insignificant quantity {}. Skipping reduction.", self.id, available_quantity);
            return Ok((Decimal::ZERO, Decimal::ZERO));
        }

        let mut quantity_to_reduce = quantity_to_reduce_input;
        if available_quantity < quantity_to_reduce {
            warn!(
                "Reduce quantity {} exceeds available {} for position {}. Reducing by available amount.",
                quantity_to_reduce, available_quantity, self.id
            );
            quantity_to_reduce = available_quantity;
        }

        self.lots.sort_by_key(|lot| lot.acquisition_date); // Ensure FIFO order

        let mut lot_indices_to_remove = Vec::new();
        let mut lot_updates = Vec::new(); // (index, new_quantity, new_cost_basis)
        let mut actual_quantity_reduced = Decimal::ZERO;
        let mut cost_basis_of_sold_lots = Decimal::ZERO;

        for (index, lot) in self.lots.iter().enumerate() {
            if quantity_to_reduce <= Decimal::ZERO {
                break;
            }
            if lot.quantity <= Decimal::ZERO {
                continue;
            } // Skip empty lots

            let qty_from_this_lot = std::cmp::min(lot.quantity, quantity_to_reduce);

            let cost_basis_removed = if lot.quantity.is_zero() {
                Decimal::ZERO
            } else {
                (lot.cost_basis * qty_from_this_lot / lot.quantity).round_dp(ROUNDING_SCALE)
            };

            actual_quantity_reduced += qty_from_this_lot;
            cost_basis_of_sold_lots += cost_basis_removed;
            quantity_to_reduce -= qty_from_this_lot;

            let remaining_lot_qty = lot.quantity - qty_from_this_lot;

            if remaining_lot_qty <= Decimal::ZERO || !is_quantity_significant(&remaining_lot_qty) {
                // Remove lot
                lot_indices_to_remove.push(index);
            } else {
                // Update lot
                let remaining_lot_basis =
                    (lot.cost_basis - cost_basis_removed).round_dp(ROUNDING_SCALE);
                lot_updates.push((index, remaining_lot_qty, remaining_lot_basis));
            }

            if quantity_to_reduce <= Decimal::ZERO {
                break;
            }
        }

        // Apply updates and removals (reverse order for removal)
        for (index, new_quantity, new_cost_basis) in lot_updates {
            if let Some(lot) = self.lots.get_mut(index) {
                lot.quantity = new_quantity;
                lot.cost_basis = new_cost_basis;
            } else {
                error!(
                    "Failed to get mutable lot at index {} for position {}",
                    index, self.id
                );
                // This indicates a logic error, potentially return an Internal error
            }
        }
        for index in lot_indices_to_remove.iter().rev() {
            if *index < self.lots.len() {
                self.lots.remove(*index);
            } else {
                error!(
                    "Invalid index {} for lot removal in position {}",
                    index, self.id
                );
            }
        }

        self.recalculate_aggregates();

        // Return rounded final values
        Ok((
            actual_quantity_reduced.round_dp(ROUNDING_SCALE),
            cost_basis_of_sold_lots.round_dp(ROUNDING_SCALE),
        ))
    }

    /// Applies stock split.
    pub fn apply_split(&mut self, split_ratio: Decimal, activity_id: &str) -> Result<()> {
        if !split_ratio.is_sign_positive() {
            return Err(CalculatorError::InvalidActivity(format!(
                "Split ratio must be positive, got {} for activity {}",
                split_ratio, activity_id
            )));
        }
        debug!(
            "Applying split ratio {} to position {}",
            split_ratio, self.id
        );
        for lot in self.lots.iter_mut() {
            lot.quantity = (lot.quantity * split_ratio).round_dp(ROUNDING_SCALE);
            // Price adjustment is informational, cost basis remains key
            lot.acquisition_price = (lot.acquisition_price / split_ratio).round_dp(ROUNDING_SCALE);
            // Cost basis and fees per lot remain unchanged by split
        }
        self.recalculate_aggregates();
        Ok(())
    }
}
