use crate::errors::{Result};
use crate::{Activity, ActivityType};
use crate::assets::Asset;
use crate::portfolio::holdings_service::Portfolio;
use bigdecimal::BigDecimal;
use log::warn;

pub trait Transaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()>;
}

// Helper functions to reduce code duplication
fn get_fee(activity: &Activity) -> BigDecimal {
    activity.fee.clone()
}

fn get_amount(activity: &Activity) -> BigDecimal {
    match &activity.amount {
        Some(amt) => amt.clone(),
        None => {
            warn!("Amount not provided for cash activity ID: {}, using zero", activity.id);
            BigDecimal::from(0)
        }
    }
}

fn get_quantity(activity: &Activity) -> BigDecimal {
    activity.quantity.clone()
}

fn get_unit_price(activity: &Activity) -> BigDecimal {
    activity.unit_price.clone()
}

fn adjust_cash_with_amount(portfolio: &mut Portfolio, activity: &Activity, amount_modifier: impl Fn(BigDecimal, BigDecimal) -> BigDecimal) -> Result<()> {
    let fee = get_fee(activity);
    let amount = get_amount(activity);
    let adjusted_amount = amount_modifier(amount, fee);
    
    portfolio.adjust_cash(&activity.account_id, &activity.currency, adjusted_amount);
    Ok(())
}

pub struct BuyTransaction;
impl Transaction for BuyTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()> {
        let quantity = get_quantity(activity);
        let unit_price = get_unit_price(activity);
        let fee = get_fee(activity);
        let activity_amount = &quantity * &unit_price;
        let buy_cost = &activity_amount + &fee;

        portfolio.adjust_cash(&activity.account_id, &activity.currency, -buy_cost);
        let holding = portfolio.get_or_create_holding(&activity.account_id, &activity.asset_id, activity, asset);
        holding.add_position(quantity, unit_price);

        Ok(())
    }
}

pub struct SellTransaction;
impl Transaction for SellTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let quantity = get_quantity(activity);
        let unit_price = get_unit_price(activity);
        let fee = get_fee(activity);
        let activity_amount = &quantity * &unit_price;
        let sell_profit = &activity_amount - &fee;

        portfolio.adjust_cash(&activity.account_id, &activity.currency, sell_profit);

        if let Some(holding) = portfolio.get_holding_mut(&activity.account_id, &activity.asset_id) {
            holding.reduce_position(quantity)?;

            if !Portfolio::is_quantity_significant(&holding.quantity) {
                portfolio.remove_holding(&activity.account_id, &activity.asset_id);
            }
        }

        Ok(())
    }
}

pub struct DepositTransaction;
impl Transaction for DepositTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct WithdrawalTransaction;
impl Transaction for WithdrawalTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| -(amount + fee))
    }
}

pub struct DividendTransaction;
impl Transaction for DividendTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct InterestTransaction;
impl Transaction for InterestTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct TransferInTransaction;
impl Transaction for TransferInTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            adjust_cash_with_amount(portfolio, activity, |amount, fee| amount - fee)
        } else {
            // For backward compatibility, handle non-cash transfers as AddHolding
            warn!("Using TransferIn for non-cash asset. Consider using ADD_HOLDING instead for asset ID: {}", activity.asset_id);
            let handler = AddHoldingTransaction;
            handler.process(portfolio, activity, _asset)
        }
    }
}

pub struct TransferOutTransaction;
impl Transaction for TransferOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            adjust_cash_with_amount(portfolio, activity, |amount, fee| -(amount + fee))
        } else {
            // For backward compatibility, handle non-cash transfers as RemoveHolding
            warn!("Using TransferOut for non-cash asset. Consider using REMOVE_HOLDING instead for asset ID: {}", activity.asset_id);
            let handler = RemoveHoldingTransaction;
            handler.process(portfolio, activity, _asset)
        }
    }
}

pub struct SplitTransaction;
impl Transaction for SplitTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let split_ratio = get_amount(activity);

        if let Some(holding) = portfolio.get_holding_mut(&activity.account_id, &activity.asset_id) {
            holding.quantity = &holding.quantity * &split_ratio;
            if let Some(avg_cost) = holding.average_cost.as_mut() {
                *avg_cost = avg_cost.clone() / &split_ratio;
            }
        }
        Ok(())
    }
}

pub struct ConversionInTransaction;
impl Transaction for ConversionInTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| amount - fee)
    }
}

pub struct ConversionOutTransaction;
impl Transaction for ConversionOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        adjust_cash_with_amount(portfolio, activity, |amount, fee| -(amount + fee))
    }
}

pub struct FeeTransaction;
impl Transaction for FeeTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let fee = get_fee(activity);
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -fee);
        Ok(())
    }
}

pub struct TaxTransaction;
impl Transaction for TaxTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let fee = get_fee(activity);
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -fee);
        Ok(())
    }
}

pub struct AddHoldingTransaction;
impl Transaction for AddHoldingTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()> {
        let quantity = get_quantity(activity);
        let unit_price = get_unit_price(activity);
        let holding = portfolio.get_or_create_holding(&activity.account_id, &activity.asset_id, activity, asset);
        holding.add_position(quantity, unit_price);
        Ok(())
    }
}

pub struct RemoveHoldingTransaction;
impl Transaction for RemoveHoldingTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        if let Some(holding) = portfolio.get_holding_mut(&activity.account_id, &activity.asset_id) {
            let quantity = get_quantity(activity);
            holding.reduce_position(quantity)?;

            if !Portfolio::is_quantity_significant(&holding.quantity) {
                portfolio.remove_holding(&activity.account_id, &activity.asset_id);
            }
            Ok(())
        } else {
            Ok(())
        }
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