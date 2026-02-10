use chrono::{DateTime, Utc};
use log::{debug, error, warn};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::default::Default;

use crate::activities::Activity;

use crate::constants::QUANTITY_THRESHOLD;

use crate::errors::{CalculatorError, Result};

// Helper function from previous examples
pub fn is_quantity_significant(quantity: &Decimal) -> bool {
    let threshold =
        Decimal::from_str_radix(QUANTITY_THRESHOLD, 10).unwrap_or_else(|_| Decimal::new(1, 8));
    quantity.abs() >= threshold
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub quantity: Decimal,
    /// Average cost per unit in the asset's currency.
    pub average_cost: Decimal,
    /// Total cost basis of all lots in the asset's currency.
    pub total_cost_basis: Decimal,
    /// The currency of the asset and the cost basis values (e.g., "USD", "EUR"). Set by the first acquisition activity.
    pub currency: String,
    pub inception_date: DateTime<Utc>,
    #[serde(default)]
    pub lots: VecDeque<Lot>,
    pub created_at: DateTime<Utc>,
    pub last_updated: DateTime<Utc>,
    /// Flag indicating if this position is an alternative asset (Property, Vehicle, Collectible, etc.).
    /// Alternative assets are excluded from TWR/IRR performance calculations.
    #[serde(default)]
    pub is_alternative: bool,
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
            currency: String::new(), // Initialized as empty, set by first lot
            inception_date: Utc::now(),
            lots: VecDeque::new(),
            created_at: Utc::now(),
            last_updated: Utc::now(),
            is_alternative: false,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lot {
    pub id: String,
    pub position_id: String,
    pub acquisition_date: DateTime<Utc>,
    pub quantity: Decimal,
    /// Represents the total amount paid for the entire lot in the Position's currency, including any fees or commissions if applicable (e.g., for Buy).
    pub cost_basis: Decimal,
    /// Represents the price per share/unit in the Position's currency at the time of purchase.
    pub acquisition_price: Decimal,
    /// Represents fees paid in the Position's currency associated with the acquisition.
    pub acquisition_fees: Decimal,
    /// FX rate used to convert from activity currency to position currency.
    /// Stored for audit trail when cross-currency purchases occur.
    /// None when activity currency matches position currency.
    pub fx_rate_to_position: Option<Decimal>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashHolding {
    pub id: String, // e.g., "CASH-USD-ACCT123"
    pub account_id: String,
    pub currency: String, // "USD", "EUR" - acts as asset_id for cash
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
    pub fn new(
        account_id: String,
        asset_id: String,
        asset_currency: String,
        date: DateTime<Utc>,
    ) -> Self {
        Position {
            id: format!("POS-{}-{}", asset_id, account_id), // Example ID generation
            account_id,
            asset_id,
            quantity: Decimal::ZERO,
            average_cost: Decimal::ZERO,
            total_cost_basis: Decimal::ZERO,
            currency: asset_currency,
            inception_date: date,
            lots: VecDeque::new(),
            created_at: date,
            last_updated: date,
            is_alternative: false,
        }
    }

    // Constructor with alternative asset flag
    pub fn new_with_alternative_flag(
        account_id: String,
        asset_id: String,
        asset_currency: String,
        date: DateTime<Utc>,
        is_alternative: bool,
    ) -> Self {
        Position {
            id: format!("POS-{}-{}", asset_id, account_id),
            account_id,
            asset_id,
            quantity: Decimal::ZERO,
            average_cost: Decimal::ZERO,
            total_cost_basis: Decimal::ZERO,
            currency: asset_currency,
            inception_date: date,
            lots: VecDeque::new(),
            created_at: date,
            last_updated: date,
            is_alternative,
        }
    }

    /// Recalculates aggregates based on current lots. Operates in the Position's currency.
    pub fn recalculate_aggregates(&mut self) {
        // Sum quantities and cost basis (in asset currency) from lots
        let total_quantity: Decimal = self.lots.iter().map(|lot| lot.quantity).sum();
        let total_cost_basis: Decimal = self.lots.iter().map(|lot| lot.cost_basis).sum();

        // Store unrounded aggregates internally
        self.quantity = total_quantity;
        self.total_cost_basis = total_cost_basis; // Already in asset currency

        if self.quantity.is_sign_positive() && is_quantity_significant(&self.quantity) {
            // Calculate average cost (in asset currency) using unrounded values
            self.average_cost = self.total_cost_basis / self.quantity;
        } else {
            // Zero, negative, or insignificant quantity
            if !self.quantity.is_zero() && !self.quantity.is_sign_negative() {
                warn!("Position {} quantity ({}) became insignificant after recalculation. Average cost zeroed.", self.id, self.quantity);
            }
            if (self.quantity.is_zero() || self.quantity.is_sign_negative())
                && !self.lots.is_empty()
            {
                warn!(
                    "Position {} quantity became zero or negative ({}). Aggregates zeroed, but lots retained.",
                    self.id, self.quantity
                );
            }
            self.quantity = Decimal::ZERO;
            self.total_cost_basis = Decimal::ZERO;
            self.average_cost = Decimal::ZERO;
        }

        // Update inception date if lots exist
        if let Some(first_lot) = self.lots.iter().min_by_key(|lot| lot.acquisition_date) {
            self.inception_date = first_lot.acquisition_date;
        }
        // Update last updated time
        self.last_updated = Utc::now();
    }

    /// Adds a new lot based on an acquisition activity.
    /// Costs are stored in the Position's currency (which must match activity currency).
    /// activity_id is used for the Lot ID.
    /// Returns the cost basis of the added lot in the position's currency.
    pub fn add_lot(&mut self, activity: &Activity) -> Result<Decimal> {
        let qty = activity.qty();
        if !qty.is_sign_positive() {
            warn!(
                "Skipping add_lot for activity {} with non-positive quantity: {}",
                activity.id, qty
            );
            // Return zero cost basis if skipped
            return Ok(Decimal::ZERO);
        }

        // --- Currency Check ---
        if self.currency.is_empty() {
            // First lot addition, set the position's currency
            debug!(
                "Setting position {} currency to {} based on first activity {}",
                self.id, activity.currency, activity.id
            );
            self.currency = activity.currency.clone();
        } else if self.currency != activity.currency {
            error!(
                "Currency mismatch for position {} ({}): Activity {} has currency {}. Requires currency conversion activity first.",
                self.id, self.currency, activity.id, activity.currency
            );
            return Err(CalculatorError::CurrencyMismatch {
                position_id: self.id.clone(),
                position_currency: self.currency.clone(),
                activity_id: activity.id.clone(),
                activity_currency: activity.currency.clone(),
            }
            .into());
        }

        // --- Cost Calculation (in Position/Activity Currency) ---
        let acquisition_price = activity.price();
        let quantity = activity.qty();
        let acquisition_fees = activity.fee_amt(); // Store the fee in activity currency

        // Cost basis ONLY includes fees for BUY activities
        let cost_basis = quantity * acquisition_price + acquisition_fees;

        let new_lot = Lot {
            id: activity.id.clone(), // Use activity ID as Lot ID
            position_id: self.id.clone(),
            acquisition_date: activity.activity_date,
            quantity,
            cost_basis,                // Store unrounded in position currency
            acquisition_price,         // Store unrounded in position currency
            acquisition_fees,          // Store unrounded in position currency
            fx_rate_to_position: None, // No currency conversion in this method
        };

        self.lots.push_back(new_lot);
        // Convert to Vec, sort, convert back to VecDeque
        let mut vec_lots: Vec<_> = self.lots.drain(..).collect();
        vec_lots.sort_by_key(|lot| lot.acquisition_date);
        self.lots = vec_lots.into();

        self.recalculate_aggregates();
        // Return the calculated cost basis (in position currency)
        Ok(cost_basis)
    }

    /// Adds a new lot from pre-converted values (avoids Activity clone).
    /// This is the preferred method when the caller has already converted
    /// unit_price and fee to the position's currency.
    ///
    /// # Arguments
    /// * `lot_id` - Unique identifier for the lot (typically activity ID)
    /// * `quantity` - Number of units to add (must be positive)
    /// * `unit_price` - Price per unit, already in position currency
    /// * `fee` - Transaction fee, already in position currency
    /// * `acquisition_date` - When the position was acquired
    /// * `fx_rate_used` - FX rate used for conversion (None if same currency)
    ///
    /// # Returns
    /// The cost basis of the added lot in the position's currency.
    pub fn add_lot_values(
        &mut self,
        lot_id: String,
        quantity: Decimal,
        unit_price: Decimal,
        fee: Decimal,
        acquisition_date: DateTime<Utc>,
        fx_rate_used: Option<Decimal>,
    ) -> Result<Decimal> {
        if !quantity.is_sign_positive() {
            warn!(
                "Skipping add_lot_values for lot {} with non-positive quantity: {}",
                lot_id, quantity
            );
            return Ok(Decimal::ZERO);
        }

        // Set currency if this is the first lot
        if self.currency.is_empty() {
            debug!(
                "Position {} has empty currency on first add_lot_values. This should have been set by caller.",
                self.id
            );
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

    /// Reduces position quantity using FIFO lot relief.
    /// Returns (actual_quantity_reduced, cost_basis_of_sold_lots_in_asset_currency).
    pub fn reduce_lots_fifo(
        &mut self,
        quantity_to_reduce_input: Decimal,
    ) -> Result<(Decimal, Decimal)> {
        if !quantity_to_reduce_input.is_sign_positive() {
            return Err(CalculatorError::InvalidActivity(
                "Quantity to reduce must be positive".to_string(),
            )
            .into());
        }

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

        // Convert to Vec, sort, operate, convert back later
        let mut vec_lots: Vec<_> = self.lots.drain(..).collect();
        vec_lots.sort_by_key(|lot| lot.acquisition_date); // Ensure FIFO order

        let mut lot_indices_to_remove = Vec::new();
        let mut lot_updates = Vec::new(); // (index, new_quantity, new_cost_basis)
        let mut actual_quantity_reduced = Decimal::ZERO;
        // Cost basis sum will be in the Position's currency
        let mut cost_basis_of_sold_lots_asset_currency = Decimal::ZERO;

        // Iterate over the sorted Vec
        for (index, lot) in vec_lots.iter().enumerate() {
            if quantity_to_reduce <= Decimal::ZERO {
                break;
            }
            if lot.quantity <= Decimal::ZERO {
                continue; // Skip empty or negative lots (shouldn't happen with proper add/split)
            }

            let qty_from_this_lot = std::cmp::min(lot.quantity, quantity_to_reduce);

            // Calculate cost basis removed (in asset currency) proportionally
            let cost_basis_removed = if lot.quantity.is_zero() {
                Decimal::ZERO
            } else {
                // Proportional cost basis removal (asset currency)
                lot.cost_basis * qty_from_this_lot / lot.quantity
            };

            actual_quantity_reduced += qty_from_this_lot;
            cost_basis_of_sold_lots_asset_currency += cost_basis_removed;
            quantity_to_reduce -= qty_from_this_lot;

            let remaining_lot_qty = lot.quantity - qty_from_this_lot;

            if remaining_lot_qty <= Decimal::ZERO || !is_quantity_significant(&remaining_lot_qty) {
                lot_indices_to_remove.push(index);
            } else {
                // Calculate remaining cost basis (asset currency)
                let remaining_lot_basis = lot.cost_basis - cost_basis_removed;
                lot_updates.push((index, remaining_lot_qty, remaining_lot_basis));
            }
        }

        // Apply updates to the Vec
        for (index, new_quantity, new_cost_basis) in lot_updates {
            if let Some(lot) = vec_lots.get_mut(index) {
                lot.quantity = new_quantity;
                lot.cost_basis = new_cost_basis; // Update with asset currency value
            } else {
                error!(
                    "Failed to get mutable lot at index {} for position {} during update",
                    index, self.id
                );
            }
        }

        // Remove marked lots from the Vec efficiently
        let mut i = 0;
        vec_lots.retain(|_| {
            let keep = !lot_indices_to_remove.contains(&i);
            i += 1;
            keep
        });

        // Convert the final Vec back to VecDeque and assign to self.lots
        self.lots = vec_lots.into();

        self.recalculate_aggregates();

        Ok((
            actual_quantity_reduced, // Keep original precision from calculation
            cost_basis_of_sold_lots_asset_currency, // Return cost basis in asset currency
        ))
    }

    /// Applies stock split.
    pub fn apply_split(&mut self, split_ratio: Decimal, activity_id: &str) -> Result<()> {
        if !split_ratio.is_sign_positive() {
            return Err(CalculatorError::InvalidActivity(format!(
                "Split ratio must be positive, got {} for activity {}",
                split_ratio, activity_id
            ))
            .into());
        }
        debug!(
            "Applying split ratio {} to position {}",
            split_ratio, self.id
        );
        for lot in self.lots.iter_mut() {
            lot.quantity *= split_ratio;
            // Price adjustment is informational, cost basis remains key
            // Ensure division by zero is handled if split_ratio could be zero (though checked earlier)
            if !split_ratio.is_zero() {
                lot.acquisition_price /= split_ratio;
            } else {
                warn!("Split ratio is zero for activity {}. Cannot adjust acquisition price for lot {}.", activity_id, lot.id);
                lot.acquisition_price = Decimal::ZERO; // Or some other indicator
            }
            // Cost basis and fees per lot remain unchanged by split
        }
        self.recalculate_aggregates();
        Ok(())
    }
}
