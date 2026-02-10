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
    /// Period gain in dollars (SOTA: change in unrealized P&L for HOLDINGS mode)
    pub period_gain: Decimal,
    /// Period return percentage (SOTA formula for HOLDINGS mode)
    pub period_return: Decimal,
    /// Time-weighted return (None for HOLDINGS mode - requires cash flow tracking)
    pub cumulative_twr: Option<Decimal>,
    /// Legacy field for backward compatibility
    pub gain_loss_amount: Option<Decimal>,
    /// Annualized TWR (None for HOLDINGS mode)
    pub annualized_twr: Option<Decimal>,
    pub simple_return: Decimal,
    pub annualized_simple_return: Decimal,
    /// Money-weighted return (None for HOLDINGS mode - requires cash flow tracking)
    pub cumulative_mwr: Option<Decimal>,
    /// Annualized MWR (None for HOLDINGS mode)
    pub annualized_mwr: Option<Decimal>,
    pub volatility: Decimal,
    pub max_drawdown: Decimal,
    /// Indicates if this is a HOLDINGS mode account (no cash flow tracking)
    #[serde(default)]
    pub is_holdings_mode: bool,
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
