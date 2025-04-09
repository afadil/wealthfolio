// Use internal state struct from the parent module's state submodule
use super::state::AccountState;
// Use public models (adjust path if your root mod.rs re-exports differently)
use crate::activities::{Activity, ActivityType};
use crate::holdings::holdings_errors::{CalculatorError, Result};
use crate::holdings::holdings_model::ROUNDING_SCALE;

use log::warn;
use rust_decimal::Decimal;

// --- Private Helper Function ---

/// Calculates the net cash change resulting from an activity.
/// Positive means cash inflow, negative means cash outflow.
fn calculate_cash_change(activity: &Activity, activity_type: &ActivityType) -> Decimal {
    // Use Decimal::ZERO for clarity
    let zero = Decimal::ZERO;

    match activity_type {
        // Activities that INCREASE cash
        ActivityType::Deposit | ActivityType::Interest | ActivityType::Dividend => {
            // Prefer 'amount' if available, otherwise calculate. Need clear data contract.
            activity.amount.unwrap_or_else(|| {
                // Dividend/Interest amount might just be in 'quantity' if unit_price is 1 or 0? Clarify source.
                // Assuming quantity*unit_price is the intended cash value if amount is missing.
                let calculated = activity.quantity * activity.unit_price;
                if calculated.is_zero() && !activity.quantity.is_zero() && !activity.amount.is_some(){
                    warn!("Activity {} ({}): 'amount' is missing and quantity*unit_price is zero. Cash change might be incorrect. Check 'quantity' field.", activity.id, activity_type.as_str());
                    activity.quantity // Fallback to quantity as cash amount? Needs business logic confirmation.
                } else if !activity.amount.is_some() {
                    warn!("Activity {} ({}): 'amount' is missing, using quantity*unit_price.", activity.id, activity_type.as_str());
                    calculated
                } else {
                    calculated // Should not happen if amount was Some, but satisfy compiler
                }

            })
        }
        ActivityType::Sell => {
            // Proceeds = (Quantity * Price) - Fee
            (activity.quantity * activity.unit_price) - activity.fee
        }

        // Activities that DECREASE cash
        ActivityType::Withdrawal | ActivityType::Tax => {
            // Amount should represent the positive value withdrawn/paid.
            -activity.amount.unwrap_or_else(|| {
                 warn!("Activity {} ({}): 'amount' is missing. Assuming 'quantity' represents cash amount.", activity.id, activity_type.as_str());
                 activity.quantity // Assume quantity IS the amount withdrawn if 'amount' is missing
             })
        }
        ActivityType::Fee => {
            // Fee amount might be in 'fee' field OR 'amount' field. Prioritize 'amount' if present? Or 'fee'?
            // Assuming 'amount' represents the fee if present, otherwise use 'fee'.
            -activity.amount.unwrap_or(activity.fee)
        }
        ActivityType::Buy => {
            // Cost = (Quantity * Price) + Fee
            -((activity.quantity * activity.unit_price) + activity.fee)
        }

        // Activities that might have associated fees but are primarily non-cash
        ActivityType::AddHolding
        | ActivityType::RemoveHolding
        | ActivityType::Split
        | ActivityType::TransferIn
        | ActivityType::TransferOut
        | ActivityType::ConversionIn
        | ActivityType::ConversionOut => {
            if activity.fee.is_sign_positive() {
                // Only the fee impacts cash directly
                -activity.fee
            } else {
                zero
            }
        }
    }
}

// --- Public (within calculator module) Handler Functions ---
// `pub(super)` makes them callable from holdings_calculator.rs and mod.rs within calculator/

/// Handles activities that only affect cash balances.
pub(super) fn handle_cash_only(
    activity: &Activity,
    state: &mut AccountState,
    activity_type: &ActivityType,
) -> Result<()> {
    // Calculate cash change based on the specific activity type
    let cash_change = match activity_type {
        ActivityType::Deposit | ActivityType::Interest | ActivityType::Dividend => {
            // Cash increases by amount, less fee
            activity.amount.unwrap_or_else(|| {
                 warn!("Activity {} ({}): 'amount' is missing. Using ZERO. Check activity data.", activity.id, activity_type.as_str());
                 Decimal::ZERO
            }) - activity.fee
        }
        // Combine TransferIn and ConversionIn for cash adjustments
        ActivityType::TransferIn | ActivityType::ConversionIn => {
             // Cash increases by amount, less fee (assuming cash transfer/conversion)
            activity.amount.unwrap_or_else(|| {
                 warn!("Cash Transfer/Conversion In Activity {} ({}): 'amount' is missing. Using ZERO. Check activity data.", activity.id, activity_type.as_str());
                 Decimal::ZERO
            }) - activity.fee
        }

        ActivityType::Withdrawal => {
             // Cash decreases by amount + fee
            -(activity.amount.unwrap_or_else(|| {
                 warn!("Activity {} ({}): 'amount' is missing. Using ZERO. Check activity data.", activity.id, activity_type.as_str());
                 Decimal::ZERO
             }) + activity.fee)
        }
         // Combine TransferOut and ConversionOut for cash adjustments
         ActivityType::TransferOut | ActivityType::ConversionOut => {
            // Cash decreases by amount + fee (assuming cash transfer/conversion)
            -(activity.amount.unwrap_or_else(|| {
                 warn!("Cash Transfer/Conversion Out Activity {} ({}): 'amount' is missing. Using ZERO. Check activity data.", activity.id, activity_type.as_str());
                 Decimal::ZERO
             }) + activity.fee)
        }

        ActivityType::Fee => {
            // Cash decreases by fee, or amount if fee is zero.
             let fee_val = activity.fee;
             if fee_val != Decimal::ZERO {
                 -fee_val
             } else {
                let amount_val = activity.amount.unwrap_or(Decimal::ZERO);
                if amount_val != Decimal::ZERO {
                    warn!("Activity {} ({}): 'fee' is zero, using 'amount' as fee value.", activity.id, activity_type.as_str());
                    -amount_val
                } else {
                    warn!("Activity {} ({}): 'fee' and 'amount' are both zero. No cash change.", activity.id, activity_type.as_str());
                    Decimal::ZERO
                }
             }
        }
        ActivityType::Tax => {
            // Cash decreases by fee (as tax amount), or amount if fee is zero.
             let tax_val = activity.fee; // Assuming 'fee' field holds tax amount for Tax type
             if tax_val != Decimal::ZERO {
                 -tax_val
             } else {
                let amount_val = activity.amount.unwrap_or(Decimal::ZERO);
                if amount_val != Decimal::ZERO {
                    warn!("Activity {} ({}): 'fee' (tax) is zero, using 'amount' as tax value.", activity.id, activity_type.as_str());
                    -amount_val
                } else {
                    warn!("Activity {} ({}): 'fee' (tax) and 'amount' are both zero. No cash change.", activity.id, activity_type.as_str());
                    Decimal::ZERO
                }
             }
        }
        // Fallback for any other unexpected type reaching here - should not happen with current dispatch
        _ => {
            warn!("Unexpected activity type {} reached handle_cash_only for activity {}. Using generic calculation (likely incorrect).", activity_type.as_str(), activity.id);
            // Use the potentially incorrect generic calculation as a last resort.
            calculate_cash_change(activity, activity_type)
        }
    };

    // Update the account's cash balance for the given currency
    state.update_cash(&activity.currency, cash_change);
    Ok(())
}

/// Handles activities that increase security holdings (Buy, AddHolding, TransferIn, ConversionIn).
pub(super) fn handle_buy_like(
    activity: &Activity,
    state: &mut AccountState,
    activity_type: &ActivityType,
) -> Result<()> {
    // 1. Handle Cash Impact (only if it's a Buy or if there are fees)
    let cash_change = calculate_cash_change(activity, activity_type);
    state.update_cash(&activity.currency, cash_change); // update_cash handles zero internally

    // 2. Handle Position Impact
    let position = state.get_or_create_position_mut(
        &activity.asset_id,
        &activity.currency, // Use activity currency for *new* positions. How to handle adding to existing position with diff currency?
        activity.activity_date,
    )?;

    // Basic currency check: Log warning if adding to existing position with different currency.
    // A robust system would need FX handling or enforce matching currencies.
    if position.currency != activity.currency && !position.lots.is_empty() {
        warn!("Activity {} currency ({}) differs from existing position {} currency ({}). Lot added with activity currency, but position aggregates remain in original currency.",
            activity.id, activity.currency, position.id, position.currency);
        // For simplicity, we add the lot but don't change position currency here.
        // Position aggregates will become mixed-currency if not handled carefully downstream.
    }

    // Add the lot to the position
    position.add_lot(activity, activity_type)?; // Pass activity_type here
    Ok(())
}

/// Handles activities that decrease security holdings (Sell, RemoveHolding, TransferOut, ConversionOut).
pub(super) fn handle_sell_like(
    activity: &Activity,
    state: &mut AccountState,
    activity_type: &ActivityType,
) -> Result<()> {
    // 1. Handle Cash Impact (only if it's a Sell or if there are fees)
    let cash_change = calculate_cash_change(activity, activity_type);
    state.update_cash(&activity.currency, cash_change);

    // 2. Handle Position Impact
    if activity.asset_id.is_empty() {
        return Err(CalculatorError::InvalidActivity(format!(
            "Missing asset_id for {} activity {}",
            activity_type.as_str(),
            activity.id
        )));
    }

    if let Some(position) = state.positions.get_mut(&activity.asset_id) {
        // Ensure activity currency matches position before proceeding? Or assume base currency conversion?
        // For now, assume currency matches or is handled externally.
        if position.currency != activity.currency {
            warn!("Activity {} currency ({}) differs from position {} currency ({}). Proceeding with reduction.",
                    activity.id, activity.currency, position.id, position.currency);
        }

        let (qty_reduced, _cost_basis_sold) = position.reduce_lots_fifo(activity.quantity)?; // Ignore cost basis sold for holding calc

        if qty_reduced.round_dp(ROUNDING_SCALE) != activity.quantity.round_dp(ROUNDING_SCALE)
            && position.quantity >= activity.quantity
        {
            // Log if we reduced less than requested, potentially due to insufficient shares after rounding or threshold checks
            warn!("Activity {} requested reduction of {} {} but only reduced {}. Check available quantity/thresholds.",
                    activity.id, activity.quantity, activity.asset_id, qty_reduced);
        }

        // Position::reduce_lots_fifo calls recalculate_aggregates internally,
        // which should handle zeroing out if quantity becomes insignificant.
        // No need to remove from map here; handled in finalization.
    } else {
        // Attempting to sell/remove from a position that doesn't exist or is already zero.
        warn!("Attempted to {} non-existent/zero position {} via activity {}. Ignoring position effect.",
                activity_type.as_str(), activity.asset_id, activity.id);
        // Return Ok(()) because the cash effect (fee/proceeds) might still be valid.
        // If this should be a hard error, return Err(...) here.
    }
    Ok(())
}

/// Handles stock split activities.
pub(super) fn handle_split(activity: &Activity, state: &mut AccountState) -> Result<()> {
    // 1. Handle Cash Impact (Fees only)
    let cash_change = calculate_cash_change(activity, &ActivityType::Split); // Use helper
    state.update_cash(&activity.currency, cash_change);

    // 2. Handle Position Impact
    if activity.asset_id.is_empty() {
        return Err(CalculatorError::InvalidActivity(format!(
            "Missing asset_id for SPLIT activity {}",
            activity.id
        )));
    }

    // Ratio is often encoded in quantity (e.g., 2 for 2:1 split, 0.5 for 1:2 reverse split)
    let split_ratio = activity.quantity;
    if !split_ratio.is_sign_positive() || split_ratio.is_zero() {
        return Err(CalculatorError::InvalidActivity(format!(
            "Invalid split ratio {} for activity {}",
            split_ratio, activity.id
        )));
    }

    if let Some(position) = state.positions.get_mut(&activity.asset_id) {
        position.apply_split(split_ratio, &activity.id)?;
    } else {
        warn!(
            "Split activity {} for non-existent/zero position {}. Ignoring position effect.",
            activity.id, activity.asset_id
        );
    }
    Ok(())
}
