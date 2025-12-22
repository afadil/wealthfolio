use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CumulativeReturn {
    pub date: NaiveDate,
    pub value: Decimal,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TotalReturn {
    pub rate: Decimal,
    pub amount: Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub enum ReturnMethod {
    #[default]
    TimeWeighted,
    MoneyWeighted,
    SimpleReturn,
    SymbolPriceBased,
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReturnData {
    pub date: NaiveDate,
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
    pub cumulative_twr: Decimal,
    pub gain_loss_amount: Option<Decimal>,
    pub annualized_twr: Decimal,
    pub simple_return: Decimal,
    pub annualized_simple_return: Decimal,
    pub cumulative_mwr: Decimal,
    pub annualized_mwr: Decimal,
    pub volatility: Decimal,
    pub max_drawdown: Decimal,
}

// This struct now only holds the calculated performance metrics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimplePerformanceMetrics {
    pub account_id: String,
    pub account_currency: Option<String>,
    pub base_currency: Option<String>,
    pub fx_rate_to_base: Option<Decimal>,
    pub total_value: Option<Decimal>,
    pub total_gain_loss_amount: Option<Decimal>,
    pub cumulative_return_percent: Option<Decimal>,
    pub day_gain_loss_amount: Option<Decimal>,
    pub day_return_percent_mod_dietz: Option<Decimal>,
    pub portfolio_weight: Option<Decimal>,
}
