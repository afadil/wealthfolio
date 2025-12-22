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
}
