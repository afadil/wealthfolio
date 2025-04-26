use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use rust_decimal::Decimal;
use crate::utils::decimal_serde::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CumulativeReturn {
    pub date: NaiveDate,
    #[serde(with = "decimal_serde")]
    pub value: Decimal,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TotalReturn {
    #[serde(with = "decimal_serde")]
    pub rate: Decimal,
    #[serde(with = "decimal_serde")]
    pub amount: Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReturnMethod {
    TimeWeighted,
    MoneyWeighted,
    SimpleReturn,
    SymbolPriceBased,
    NotApplicable,
}

impl Default for ReturnMethod {
    fn default() -> Self {
        ReturnMethod::TimeWeighted
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReturnData {
    pub date: NaiveDate,
    #[serde(with = "decimal_serde")]
    pub value: Decimal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMetrics {
    pub id: String,
    pub returns: Vec<ReturnData>,
    pub period_start_date: Option<NaiveDate>,
    pub period_end_date: Option<NaiveDate>,
    pub currency: String,
    #[serde(with = "decimal_serde")]
    pub cumulative_twr: Decimal,
    #[serde(with = "decimal_serde_option", skip_serializing_if = "Option::is_none")]
    pub gain_loss_amount: Option<Decimal>,
    #[serde(with = "decimal_serde")]
    pub annualized_twr: Decimal,
    #[serde(with = "decimal_serde")]
    pub simple_return: Decimal,
    #[serde(with = "decimal_serde")]
    pub annualized_simple_return: Decimal,
    #[serde(with = "decimal_serde")]
    pub cumulative_mwr: Decimal,
    #[serde(with = "decimal_serde")]
    pub annualized_mwr: Decimal,
    #[serde(with = "decimal_serde")]
    pub volatility: Decimal,
    #[serde(with = "decimal_serde")]
    pub max_drawdown: Decimal,
}


// This struct now only holds the calculated performance metrics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimplePerformanceMetrics {
    pub account_id: String,
    pub account_currency: Option<String>,
    pub base_currency: Option<String>,
    #[serde(with = "decimal_serde_option")]
    pub fx_rate_to_base: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub total_value: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub total_gain_loss_amount: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub cumulative_return_percent: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_loss_amount: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_return_percent_mod_dietz: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub portfolio_weight: Option<Decimal>,
}
