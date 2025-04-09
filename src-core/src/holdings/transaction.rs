use crate::errors::{Result, Error, ValidationError};
use crate::activities::{Activity, ActivityType};
use crate::assets::Asset;
use crate::holdings::{Portfolio, Position, Lot, ROUNDING_SCALE, QUANTITY_THRESHOLD};
use rust_decimal::Decimal;
use log::{error, warn};
use std::str::FromStr;

pub trait Transaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()>;
}

fn get_fee(activity: &Activity) -> Decimal {
    activity.fee
}

fn get_amount(activity: &Activity) -> Decimal {
    activity.amount.unwrap_or_else(|| {
        warn!(
            "Amount not provided for activity ID: {} (Type: {}), using zero. This might be incorrect.",
            activity.id, activity.activity_type
        );
        Decimal::ZERO
    })
}

fn get_quantity(activity: &Activity) -> Decimal {
    activity.quantity
}

fn get_unit_price(activity: &Activity) -> Decimal {
    activity.unit_price
}

fn adjust_cash_helper(
    portfolio: &mut Portfolio, 
    activity: &Activity, 
    amount_modifier: impl Fn(Decimal, Decimal) -> Decimal
) -> Result<()> {
    let fee = get_fee(activity);
    let amount = get_amount(activity);
    let adjusted_amount = amount_modifier(amount, fee);

    if activity.currency.is_empty() {
        warn!(
            "Cannot adjust cash for activity {} - currency is missing. Skipping adjustment.",
            activity.id
        );
        return Ok(());
    }
    portfolio.adjust_cash(&activity.account_id, &activity.currency, adjusted_amount);
    Ok(())
}

pub struct BuyTransaction;
impl Transaction for BuyTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()> {
        let asset = asset_opt.ok_or_else(|| Error::Validation(ValidationError::MissingField("Asset required for Buy transaction".to_string())))?;
        
        let quantity = get_quantity(activity);
        let unit_price = get_unit_price(activity);
        let fee = get_fee(activity);
        let activity_amount = (quantity * unit_price).round_dp(ROUNDING_SCALE);
        let total_cost = (activity_amount + fee).round_dp(ROUNDING_SCALE);

        portfolio.adjust_cash(&activity.account_id, &activity.currency, -total_cost);

        let holding = portfolio.get_or_create_holding(&activity.account_id, asset);

        if quantity <= Decimal::ZERO {
            warn!("Buy activity {} has non-positive quantity {}. Skipping add position.", activity.id, quantity);
            return Ok(());
        }
        if holding.holding_type.to_uppercase() == "CASH" {
             error!("Attempted to BUY into a CASH holding {} via activity {}. This indicates a data or logic error.", holding.id, activity.id);
             return Err(Error::Validation(ValidationError::InvalidInput("Cannot BUY into a CASH holding type".to_string())));
        }

        holding.add_position(quantity, unit_price, activity.activity_date.naive_utc(), &activity.id);

        Ok(())
    }
}

pub struct SellTransaction;
impl Transaction for SellTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()> {
        let quantity_to_sell = get_quantity(activity);
        let unit_price = get_unit_price(activity);
        let fee = get_fee(activity);
        let proceeds = (quantity_to_sell * unit_price).round_dp(ROUNDING_SCALE);
        let net_proceeds = (proceeds - fee).round_dp(ROUNDING_SCALE);

        portfolio.adjust_cash(&activity.account_id, &activity.currency, net_proceeds);

        let mut holding_removed = false;
        if let Some(holding) = portfolio.holdings.get_mut(&activity.account_id).and_then(|acc_h| acc_h.get_mut(&activity.asset_id)) {
            if quantity_to_sell <= Decimal::ZERO {
                warn!("Sell activity {} has non-positive quantity {}. Skipping reduce position.", activity.id, quantity_to_sell);
                return Ok(());
            }
             if holding.holding_type.to_uppercase() == "CASH" {
                 error!("Attempted to SELL from a CASH holding {} via activity {}. This indicates a data or logic error.", holding.id, activity.id);
                 return Err(Error::Validation(ValidationError::InvalidInput("Cannot SELL from a CASH holding type".to_string())));
            }

            let initial_total_quantity = holding.quantity();
            let quantity_threshold = Decimal::from_str(QUANTITY_THRESHOLD).unwrap_or_default();

            if initial_total_quantity < quantity_threshold {
                 warn!(
                    "Attempting to sell {} from holding {}/{} which already has insignificant quantity {}. Skipping reduction.",
                    quantity_to_sell, activity.account_id, activity.asset_id, initial_total_quantity
                 );
                 return Ok(());
            }

            if initial_total_quantity < quantity_to_sell {
                 error!(
                    "Sell quantity {} exceeds available significant quantity {} for holding {}/{}. Activity ID: {}. Reducing by available amount.",
                    quantity_to_sell, initial_total_quantity, activity.account_id, activity.asset_id, activity.id
                 );
                 return Err(Error::Validation(ValidationError::InsufficientQuantity{ 
                    symbol: holding.symbol.clone(), 
                    available: initial_total_quantity, 
                    needed: quantity_to_sell 
                 }));
            }

            match holding.reduce_position(quantity_to_sell) {
                Ok(reduced_amount) => {
                    info!("Reduced holding {}/{} by {} for activity {}", activity.account_id, activity.asset_id, reduced_amount, activity.id);
                    if !Holding::is_quantity_significant(&holding.quantity()) {
                        holding_removed = true;
                    }
                },
                Err(e) => {
                    error!("Failed to reduce position for holding {}/{}, activity {}: {}", activity.account_id, activity.asset_id, activity.id, e);
                    return Err(e);
                }
            }

        } else {
            warn!(
                "Sell activity {} targets non-existent or already removed holding {} for account {}. Cash adjusted, but no position to reduce.",
                activity.id, activity.asset_id, activity.account_id
            );
        }

        if holding_removed {
            portfolio.remove_holding_if_insignificant(&activity.account_id, &activity.asset_id);
        }

        Ok(())
    }
}

pub struct DepositTransaction;
impl Transaction for DepositTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct WithdrawalTransaction;
impl Transaction for WithdrawalTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| -(amount + fee))
    }
}

pub struct DividendTransaction;
impl Transaction for DividendTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct InterestTransaction;
impl Transaction for InterestTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct TransferInTransaction;
impl Transaction for TransferInTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") || asset_opt.is_none() {
            warn!("Processing TransferIn activity {} as cash deposit.", activity.id);
            adjust_cash_helper(portfolio, activity, |amount, fee| amount - fee)
        } else {
            warn!(
                "Processing non-cash TransferIn activity {} as AddHolding. Check if price/cost basis is correct.",
                activity.id
            );
            let asset = asset_opt.unwrap();
            let handler = AddHoldingTransaction;
            handler.process(portfolio, activity, Some(asset))
        }
    }
}

pub struct TransferOutTransaction;
impl Transaction for TransferOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") || asset_opt.is_none() {
            warn!("Processing TransferOut activity {} as cash withdrawal.", activity.id);
            adjust_cash_helper(portfolio, activity, |amount, fee| -(amount + fee))
        } else {
            warn!(
                "Processing non-cash TransferOut activity {} as RemoveHolding.",
                activity.id
            );
            let handler = RemoveHoldingTransaction;
            handler.process(portfolio, activity, asset_opt)
        }
    }
}

pub struct SplitTransaction;
impl Transaction for SplitTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        let split_ratio = get_amount(activity);
        if split_ratio <= Decimal::ZERO {
             warn!("Split activity {} has invalid ratio {}. Skipping.", activity.id, split_ratio);
             return Ok(());
        }

        let mut holding_removed = false;
        if let Some(holding) = portfolio.holdings.get_mut(&activity.account_id).and_then(|acc_h| acc_h.get_mut(&activity.asset_id)) {
             if holding.holding_type.to_uppercase() == "CASH" {
                 error!("Attempted Split on a CASH holding {} via activity {}. Invalid.", holding.id, activity.id);
                 return Err(Error::Validation(ValidationError::InvalidInput("Cannot Split a CASH holding type".to_string())));
             }

             warn!(
                "Applying split ratio {} to holding {}/{} from activity {}",
                 split_ratio, activity.account_id, activity.asset_id, activity.id
             );

             match holding.apply_split(split_ratio, &activity.id) {
                Ok(_) => {
                    info!("Applied split ratio {} to holding {}/{}", split_ratio, activity.account_id, activity.asset_id);
                    if !Holding::is_quantity_significant(&holding.quantity()) {
                        holding_removed = true;
                    }
                },
                 Err(e) => {
                    error!("Failed to apply split for {}/{}, activity {}: {}", activity.account_id, activity.asset_id, activity.id, e);
                    return Err(e);
                 }
             }
        } else {
            warn!(
                "Split activity {} targets non-existent or already removed holding {} for account {}. Skipping.",
                activity.id, activity.asset_id, activity.account_id
            );
        }

        if holding_removed {
            portfolio.remove_holding_if_insignificant(&activity.account_id, &activity.asset_id);
        }
        Ok(())
    }
}

pub struct ConversionInTransaction;
impl Transaction for ConversionInTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct ConversionOutTransaction;
impl Transaction for ConversionOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        adjust_cash_helper(portfolio, activity, |amount, fee| -(amount + fee))
    }
}

pub struct FeeTransaction;
impl Transaction for FeeTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        let fee = get_fee(activity);
        let amount = get_amount(activity);
        let cash_adjustment = if fee != Decimal::ZERO { -fee } else { -amount };

        if cash_adjustment == Decimal::ZERO {
            warn!("Fee activity {} has zero fee and zero amount. No cash adjustment made.", activity.id);
            return Ok(());
        }
        if fee == Decimal::ZERO && amount != Decimal::ZERO {
           warn!(
               "Fee activity {} using amount field ({}) as fee fallback.",
               activity.id, amount
           );
        }
        portfolio.adjust_cash(&activity.account_id, &activity.currency, cash_adjustment);
        Ok(())
    }
}

pub struct TaxTransaction;
impl Transaction for TaxTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        let tax_amount = get_fee(activity);
        let amount = get_amount(activity);
        let cash_adjustment = if tax_amount != Decimal::ZERO { -tax_amount } else { -amount };

        if cash_adjustment == Decimal::ZERO {
            warn!("Tax activity {} has zero fee/tax and zero amount. No cash adjustment made.", activity.id);
            return Ok(());
        }
         if tax_amount == Decimal::ZERO && amount != Decimal::ZERO {
           warn!(
               "Tax activity {} using amount field ({}) as tax fallback.",
               activity.id, amount
           );
        }
        portfolio.adjust_cash(&activity.account_id, &activity.currency, cash_adjustment);
        Ok(())
    }
}

pub struct AddHoldingTransaction;
impl Transaction for AddHoldingTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset_opt: Option<&Asset>) -> Result<()> {
         let asset = asset_opt.ok_or_else(|| Error::Validation(ValidationError::MissingField(format!("Asset required for AddHolding activity {}", activity.id))))?;

         let quantity = get_quantity(activity);
         let unit_price = get_unit_price(activity);

          let holding = portfolio.get_or_create_holding(&activity.account_id, asset);

          if quantity <= Decimal::ZERO {
              warn!("AddHolding activity {} has non-positive quantity {}. Skipping.", activity.id, quantity);
              return Ok(());
          }
          if holding.holding_type.to_uppercase() == "CASH" {
              error!("Attempted AddHolding to a CASH holding {} via activity {}. Invalid.", holding.id, activity.id);
              return Err(Error::Validation(ValidationError::InvalidInput("Cannot AddHolding to a CASH type".to_string())));
         }

        holding.add_position(quantity, unit_price, activity.activity_date.naive_utc(), &activity.id);

         Ok(())
     }
}

pub struct RemoveHoldingTransaction;
impl Transaction for RemoveHoldingTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset_opt: Option<&Asset>) -> Result<()> {
        let quantity_to_remove = get_quantity(activity);
        let mut holding_removed = false;

        if let Some(holding) = portfolio.holdings.get_mut(&activity.account_id).and_then(|acc_h| acc_h.get_mut(&activity.asset_id)) {
            if quantity_to_remove <= Decimal::ZERO {
                warn!("RemoveHolding activity {} has non-positive quantity {}. Skipping.", activity.id, quantity_to_remove);
                return Ok(());
            }
             if holding.holding_type.to_uppercase() == "CASH" {
                 error!("Attempted RemoveHolding from a CASH holding {} via activity {}. Invalid.", holding.id, activity.id);
                 return Err(Error::Validation(ValidationError::InvalidInput("Cannot RemoveHolding from a CASH type".to_string())));
            }

            let initial_total_quantity = holding.quantity();
            let quantity_threshold = Decimal::from_str(QUANTITY_THRESHOLD).unwrap_or_default();

            if initial_total_quantity < quantity_threshold {
                 warn!(
                    "Attempting RemoveHolding {} from {}/{} which already has insignificant quantity {}. Skipping.",
                    quantity_to_remove, activity.account_id, activity.asset_id, initial_total_quantity
                 );
                 return Ok(());
            }

            if initial_total_quantity < quantity_to_remove {
                 error!(
                    "RemoveHolding quantity {} exceeds available significant quantity {} for holding {}/{}. Activity ID: {}. Removing available amount instead.",
                    quantity_to_remove, initial_total_quantity, activity.account_id, activity.asset_id, activity.id
                 );
                  let mut quantity_to_reduce = initial_total_quantity;
            } else {
                  let mut quantity_to_reduce = quantity_to_remove;
            }
            let mut quantity_to_reduce = std::cmp::min(initial_total_quantity, quantity_to_remove);
             if quantity_to_reduce <= Decimal::ZERO {
                 warn!("Calculated quantity to reduce for RemoveHolding {} is zero or negative. Skipping.", activity.id);
                 return Ok(());
             }

            match holding.reduce_position(quantity_to_reduce) {
                Ok(reduced_amount) => {
                     info!("Removed holding position {}/{} by {} for activity {}", activity.account_id, activity.asset_id, reduced_amount, activity.id);
                     if !Holding::is_quantity_significant(&holding.quantity()) {
                         holding_removed = true;
                     }
                },
                 Err(e) => {
                    error!("Failed to remove holding position for {}/{}, activity {}: {}", activity.account_id, activity.asset_id, activity.id, e);
                    return Err(e);
                }
            }

         } else {
             warn!(
                 "RemoveHolding activity {} targets non-existent or already removed holding {} for account {}. No position removed.",
                 activity.id, activity.asset_id, activity.account_id
             );
         }

        if holding_removed {
            portfolio.remove_holding_if_insignificant(&activity.account_id, &activity.asset_id);
        }
         Ok(())
     }
}

pub fn get_transaction_handler(activity_type: ActivityType) -> Box<dyn Transaction> {
    match activity_type {
        ActivityType::Buy => Box::new(BuyTransaction),
        ActivityType::Sell => Box::new(SellTransaction),
        ActivityType::Dividend => Box::new(DividendTransaction),
        ActivityType::Interest => Box::new(InterestTransaction),
        ActivityType::Deposit => Box::new(DepositTransaction),
        ActivityType::Withdrawal => Box::new(WithdrawalTransaction),
        ActivityType::TransferIn => Box::new(TransferInTransaction),
        ActivityType::TransferOut => Box::new(TransferOutTransaction),
        ActivityType::ConversionIn => Box::new(ConversionInTransaction),
        ActivityType::ConversionOut => Box::new(ConversionOutTransaction),
        ActivityType::Fee => Box::new(FeeTransaction),
        ActivityType::Tax => Box::new(TaxTransaction),
        ActivityType::Split => Box::new(SplitTransaction),
        ActivityType::AddHolding => Box::new(AddHoldingTransaction),
        ActivityType::RemoveHolding => Box::new(RemoveHoldingTransaction),
    }
}