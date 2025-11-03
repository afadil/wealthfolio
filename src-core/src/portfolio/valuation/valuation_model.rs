use crate::constants::DECIMAL_PRECISION;
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

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

#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, Queryable, QueryableByName, Insertable,
)]
#[serde(rename_all = "camelCase")]
#[diesel(table_name = crate::schema::daily_account_valuation)]
pub struct DailyAccountValuationDb {
    pub id: String,
    pub account_id: String,
    pub valuation_date: NaiveDate,
    pub account_currency: String,
    pub base_currency: String,
    pub fx_rate_to_base: String,
    pub cash_balance: String,
    pub investment_market_value: String,
    pub total_value: String,
    pub cost_basis: String,
    pub net_contribution: String,
    pub calculated_at: String,
}

impl From<DailyAccountValuation> for DailyAccountValuationDb {
    fn from(value: DailyAccountValuation) -> Self {
        DailyAccountValuationDb {
            id: value.id,
            account_id: value.account_id,
            valuation_date: value.valuation_date,
            account_currency: value.account_currency,
            base_currency: value.base_currency,
            fx_rate_to_base: value.fx_rate_to_base.to_string(),
            cash_balance: value.cash_balance.round_dp(DECIMAL_PRECISION).to_string(),
            investment_market_value: value
                .investment_market_value
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            total_value: value.total_value.round_dp(DECIMAL_PRECISION).to_string(),
            cost_basis: value.cost_basis.round_dp(DECIMAL_PRECISION).to_string(),
            net_contribution: value
                .net_contribution
                .round_dp(DECIMAL_PRECISION)
                .to_string(),
            calculated_at: value.calculated_at.to_rfc3339(),
        }
    }
}

impl From<DailyAccountValuationDb> for DailyAccountValuation {
    fn from(value: DailyAccountValuationDb) -> Self {
        DailyAccountValuation {
            id: value.id,
            account_id: value.account_id,
            valuation_date: value.valuation_date,
            account_currency: value.account_currency,
            base_currency: value.base_currency,
            fx_rate_to_base: Decimal::from_str(&value.fx_rate_to_base).unwrap_or_default(),
            cash_balance: Decimal::from_str(&value.cash_balance).unwrap_or_default(),
            investment_market_value: Decimal::from_str(&value.investment_market_value)
                .unwrap_or_default(),
            total_value: Decimal::from_str(&value.total_value).unwrap_or_default(),
            cost_basis: Decimal::from_str(&value.cost_basis).unwrap_or_default(),
            net_contribution: Decimal::from_str(&value.net_contribution).unwrap_or_default(),
            calculated_at: DateTime::parse_from_rfc3339(&value.calculated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}
