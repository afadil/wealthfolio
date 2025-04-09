// src/calculator/holdings_calculator.rs

// --- Internal Modules ---
// Reference sibling modules within the 'calculator' directory
use super::state::AccountState;
use super::activity_handlers::*; // Use the specific handler functions

use crate::activities::{Activity, ActivityType};
// --- Crate Dependencies (adjust paths as needed) ---
// Use models defined in the top-level holdings_model.rs
use crate::holdings::Holding;
// Use error types defined in the top-level errors.rs
use crate::holdings::holdings_errors::{Result, CalculatorError};

// --- External Crates ---
use std::collections::HashMap;
use chrono::Utc;
use std::str::FromStr; // For parsing ActivityType string
use log::{debug, error, warn}; // For logging progress and issues

/// Calculates the state of holdings (securities and cash) based on a series of activities.
///
/// This calculator processes activities chronologically for each account to determine
/// the final quantity, cost basis, lots, and cash balances.
#[derive(Default, Debug, Clone)]
pub struct HoldingsCalculator {} // Public struct, stateless

impl HoldingsCalculator {
    /// Creates a new instance of the HoldingsCalculator.
    pub fn new() -> Self {
        HoldingsCalculator {}
    }

    /// Calculates the final holdings state for all accounts based on the provided activities.
    ///
    /// # Arguments
    ///
    /// * `activities` - A vector of `Activity` structs. The calculator will sort these internally by date.
    ///
    /// # Returns
    ///
    /// A `Result` containing a `HashMap` where the key is the `account_id` (String)
    /// and the value is a `Vec<Holding>` representing the final calculated holdings
    /// (securities and cash) for that account. Returns a `CalculatorError` on failure.
    ///
    /// # Important
    ///
    /// Activities *must* be processed chronologically for correct results. This method
    /// sorts the input vector by `activity_date`. Ensure dates are accurate.
    pub fn calculate_holdings(
        &self,
        mut activities: Vec<Activity>, // Takes ownership to allow sorting
    ) -> Result<HashMap<String, Vec<Holding>>> // Key: account_id
    {
        debug!("Starting holdings calculation for {} activities.", activities.len());

        // 1. Sort Activities Chronologically (Crucial!)
        // Using stable sort might be slightly better if IDs are used as tie-breakers,
        // but sort_by_key is generally sufficient if dates are distinct enough.
        activities.sort_by_key(|a| a.activity_date);
        // Consider adding secondary sort key for stability if needed:
        // activities.sort_by(|a, b| a.activity_date.cmp(&b.activity_date).then_with(|| a.id.cmp(&b.id)));

        // 2. Process Activities per Account using internal state trackers
        let mut account_states: HashMap<String, AccountState> = HashMap::new();
        let mut last_activity_date = activities.last().map_or_else(Utc::now, |a| a.activity_date); // Default or date of last activity

        for activity in &activities {
            // Optionally skip draft activities
            // if activity.is_draft {
            //     info!("Skipping draft activity {}", activity.id);
            //     continue;
            // }

            // Get or create the internal state tracker for the activity's account
            let state = account_states.entry(activity.account_id.clone())
                .or_insert_with(|| AccountState::new(activity.account_id.clone()));

            // Ensure last_activity_date tracks the latest processed date
             if activity.activity_date > last_activity_date {
                 last_activity_date = activity.activity_date;
             }

            // Parse activity type string into enum - handle potential errors
             let activity_type = ActivityType::from_str(&activity.activity_type).map_err(|_| {
                error!("Unsupported activity type found in activity {}: {}", activity.id, activity.activity_type);
                CalculatorError::UnsupportedActivityType(activity.activity_type.clone())
             })?;

            // Dispatch to the correct handler function based on type
            // The '?' operator automatically propagates errors upwards
            match activity_type {
                ActivityType::Buy => handle_buy_like(activity, state, &activity_type)?,
                ActivityType::AddHolding => {
                    handle_buy_like(activity, state, &activity_type)?
                }

                ActivityType::Sell => handle_sell_like(activity, state, &activity_type)?,
                ActivityType::RemoveHolding => {
                     handle_sell_like(activity, state, &activity_type)?
                }

                ActivityType::TransferIn => {
                    // Check if it's a cash transfer (asset_id starts with $CASH) or asset transfer
                    if activity.asset_id.starts_with("$CASH") {
                        handle_cash_only(activity, state, &activity_type)? // Treat as cash deposit
                    } else {
                        handle_buy_like(activity, state, &activity_type)? // Treat as asset addition
                    }
                }
                ActivityType::TransferOut => {
                    // Check if it's a cash transfer (asset_id starts with $CASH) or asset transfer
                    if activity.asset_id.starts_with("$CASH") {
                        handle_cash_only(activity, state, &activity_type)? // Treat as cash withdrawal
                    } else {
                        handle_sell_like(activity, state, &activity_type)? // Treat as asset removal
                    }
                }

                ActivityType::ConversionIn => {
                    // Check if it's a cash conversion or asset conversion
                    if activity.asset_id.starts_with("$CASH") {
                         handle_cash_only(activity, state, &activity_type)? // Treat as cash adjustment
                    } else {
                         handle_buy_like(activity, state, &activity_type)? // Treat as asset addition
                    }
                }
                 ActivityType::ConversionOut => {
                    // Check if it's a cash conversion or asset conversion
                     if activity.asset_id.starts_with("$CASH") {
                        handle_cash_only(activity, state, &activity_type)? // Treat as cash adjustment
                     } else {
                         handle_sell_like(activity, state, &activity_type)? // Treat as asset removal
                     }
                 }

                ActivityType::Deposit | ActivityType::Interest | ActivityType::Dividend => {
                     handle_cash_only(activity, state, &activity_type)?
                }
                ActivityType::Withdrawal | ActivityType::Fee | ActivityType::Tax => {
                     handle_cash_only(activity, state, &activity_type)?
                }

                ActivityType::Split => handle_split(activity, state)?,

            };
        }

        // 3. Finalize Holdings: Convert internal AccountState maps into the desired Vec<Holding> output format
        let final_holdings = account_states.into_iter()
            .map(|(account_id, state)| {
                // Call the internal finalize method on AccountState
                let holdings_for_account = state.finalize_holdings(last_activity_date);
                (account_id, holdings_for_account)
            })
            .collect();

        debug!("Holdings calculation complete.");
        Ok(final_holdings)
    }
}

// Test module removed, now in src-core/tests/
