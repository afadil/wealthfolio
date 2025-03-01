use crate::assets::Asset;
use crate::errors::Result;
use crate::portfolio::holdings_service::Portfolio;
use crate::activities::{ActivityType, Activity};
use bigdecimal::BigDecimal;
use std::str::FromStr;

pub trait Transaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()>;
}

pub struct BuyTransaction;
impl Transaction for BuyTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()> {
        let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;
        let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
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
        let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;
        let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
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
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let net_amount = &amount - &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, net_amount);
        Ok(())
    }
}

pub struct WithdrawalTransaction;
impl Transaction for WithdrawalTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let total_amount = &amount + &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -total_amount);
        Ok(())
    }
}

pub struct DividendTransaction;
impl Transaction for DividendTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let net_amount = &amount - &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, net_amount);
        Ok(())
    }
}

pub struct InterestTransaction;
impl Transaction for InterestTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let net_amount = &amount - &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, net_amount);
        Ok(())
    }
}

pub struct TransferInTransaction;
impl Transaction for TransferInTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, asset: &Asset) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
            let fee = BigDecimal::from_str(&activity.fee.to_string())?;
            let net_amount = &amount - &fee;
            portfolio.adjust_cash(&activity.account_id, &activity.currency, net_amount);
        } else {
            let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;
            let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())?;
            let holding = portfolio.get_or_create_holding(&activity.account_id, &activity.asset_id, activity, asset);
            holding.add_position(quantity, unit_price);
        }
        Ok(())
    }
}

pub struct TransferOutTransaction;
impl Transaction for TransferOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        if activity.asset_id.starts_with("$CASH") {
            let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
            let fee = BigDecimal::from_str(&activity.fee.to_string())?;
            let total_amount = &amount + &fee;
            portfolio.adjust_cash(&activity.account_id, &activity.currency, -total_amount);
        } else {
            let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;
            if let Some(holding) = portfolio.get_holding_mut(&activity.account_id, &activity.asset_id) {
                holding.reduce_position(quantity)?;

                if !Portfolio::is_quantity_significant(&holding.quantity) {
                    portfolio.remove_holding(&activity.account_id, &activity.asset_id);
                }
            }
        }
        Ok(())
    }
}

pub struct SplitTransaction;
impl Transaction for SplitTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let split_ratio = BigDecimal::from_str(&activity.unit_price.to_string())?;

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
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let net_amount = &amount - &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, net_amount);
        Ok(())
    }
}

pub struct ConversionOutTransaction;
impl Transaction for ConversionOutTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let amount = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let total_amount = &amount + &fee;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -total_amount);
        Ok(())
    }
}

pub struct FeeTransaction;
impl Transaction for FeeTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -fee);
        Ok(())
    }
}

pub struct TaxTransaction;
impl Transaction for TaxTransaction {
    fn process(&self, portfolio: &mut Portfolio, activity: &Activity, _asset: &Asset) -> Result<()> {
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        portfolio.adjust_cash(&activity.account_id, &activity.currency, -fee);
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
    }
} 