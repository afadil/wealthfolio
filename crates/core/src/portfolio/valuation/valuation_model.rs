//! Portfolio valuation domain models.

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Domain model for daily account valuation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyAccountValuation {
    pub id: String,
    pub account_id: String,
    pub valuation_date: NaiveDate,
    pub account_currency: String,
    pub base_currency: String,
    pub fx_rate_to_base: Decimal,
    pub cash_balance: Decimal,
    pub investment_market_value: Decimal,
    pub total_value: Decimal,
    pub cost_basis: Decimal,
    pub net_contribution: Decimal,
    pub calculated_at: DateTime<Utc>,
    /// Market value of alternative (non-investment) assets in account currency.
    /// Investments tab total = total_value - alternative_market_value.
    pub alternative_market_value: Decimal,
}

/// Domain model for daily portfolio-level valuation (replaces TOTAL pseudo-account).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyPortfolioValuation {
    pub id: String,
    pub valuation_date: NaiveDate,
    pub base_currency: String,
    pub cash_balance: Decimal,
    pub investment_market_value: Decimal,
    pub alternative_market_value: Decimal,
    pub total_assets: Decimal,
    pub total_liabilities: Decimal,
    pub net_worth: Decimal,
    pub cost_basis: Decimal,
    pub net_contribution: Decimal,
    pub calculated_at: DateTime<Utc>,
}

impl DailyPortfolioValuation {
    /// Convert to DailyAccountValuation for frontend compatibility.
    /// The frontend currently expects the same shape for TOTAL and per-account data.
    pub fn to_account_valuation(&self) -> DailyAccountValuation {
        DailyAccountValuation {
            id: self.id.clone(),
            account_id: "TOTAL".to_string(),
            valuation_date: self.valuation_date,
            account_currency: self.base_currency.clone(),
            base_currency: self.base_currency.clone(),
            fx_rate_to_base: Decimal::ONE,
            cash_balance: self.cash_balance,
            investment_market_value: self.investment_market_value,
            total_value: self.total_assets,
            cost_basis: self.cost_basis,
            net_contribution: self.net_contribution,
            calculated_at: self.calculated_at,
            alternative_market_value: self.alternative_market_value,
        }
    }
}
