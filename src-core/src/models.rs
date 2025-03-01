use bigdecimal::BigDecimal;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Queryable;
use diesel::Selectable;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::accounts::Account;
use crate::assets::Asset;

pub const ROUNDING_SCALE: i64 = 6;
pub const PORTFOLIO_PERCENT_SCALE: i64 = 2;

// Custom serializer/deserializer for BigDecimal (rounds on serialization)
mod bigdecimal_serde {
    use bigdecimal::BigDecimal;
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(value: &BigDecimal, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let rounded = value.round(super::ROUNDING_SCALE);
        serializer.serialize_str(&rounded.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<BigDecimal, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: String = String::deserialize(deserializer)?;
        BigDecimal::parse_bytes(s.as_bytes(), 10)
            .ok_or_else(|| D::Error::custom("Invalid BigDecimal"))
    }
}

// Custom serializer/deserializer for Option<BigDecimal>
mod bigdecimal_serde_option {
    use bigdecimal::BigDecimal;
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<BigDecimal>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(bd) => {
                let rounded = bd.round(super::ROUNDING_SCALE);
                serializer.serialize_str(&rounded.to_string())
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<BigDecimal>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: Option<String> = Option::deserialize(deserializer)?;
        match s {
            Some(s) => {
                let bd = BigDecimal::parse_bytes(s.as_bytes(), 10)
                    .ok_or_else(|| D::Error::custom("Invalid BigDecimal"))?;
                Ok(Some(bd))
            }
            None => Ok(None),
        }
    }
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    Associations,
    Serialize,
    AsChangeset,
    Deserialize,
    Debug,
    Clone,
    QueryableByName,
)]
#[diesel(belongs_to(Asset, foreign_key = symbol))]
#[diesel(table_name= crate::schema::quotes)]
#[serde(rename_all = "camelCase")]
pub struct QuoteOLD {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub created_at: chrono::NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub data_source: String,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub date: chrono::NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub open: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub high: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub low: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub volume: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub close: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub adjclose: f64,
}

//********************************** */
// Custom models
//********************************** */

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Performance {
    #[serde(with = "bigdecimal_serde")]
    pub total_gain_percent: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub total_gain_amount: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub total_gain_amount_converted: BigDecimal,
    #[serde(with = "bigdecimal_serde_option")]
    pub day_gain_percent: Option<BigDecimal>,
    #[serde(with = "bigdecimal_serde_option")]
    pub day_gain_amount: Option<BigDecimal>,
    #[serde(with = "bigdecimal_serde_option")]
    pub day_gain_amount_converted: Option<BigDecimal>,
}

impl Default for Performance {
    fn default() -> Self {
        Performance {
            total_gain_percent: BigDecimal::from(0),
            total_gain_amount: BigDecimal::from(0),
            total_gain_amount_converted: BigDecimal::from(0),
            day_gain_percent: Some(BigDecimal::from(0)),
            day_gain_amount: Some(BigDecimal::from(0)),
            day_gain_amount_converted: Some(BigDecimal::from(0)),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sector {
    pub name: String,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub code: String,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub id: String,
    pub symbol: String,
    pub symbol_name: Option<String>,
    pub holding_type: String,
    #[serde(with = "bigdecimal_serde")]
    pub quantity: BigDecimal,
    pub currency: String,
    pub base_currency: String,
    #[serde(with = "bigdecimal_serde_option")]
    pub market_price: Option<BigDecimal>,
    #[serde(with = "bigdecimal_serde_option")]
    pub average_cost: Option<BigDecimal>,
    #[serde(with = "bigdecimal_serde")]
    pub market_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub book_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub market_value_converted: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub book_value_converted: BigDecimal,
    pub performance: Performance,
    pub account: Option<Account>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub asset_data_source: Option<String>,
    pub sectors: Option<Vec<Sector>>,
    pub countries: Option<Vec<Country>>,
    #[serde(with = "bigdecimal_serde_option")]
    pub portfolio_percent: Option<BigDecimal>,
}

impl Default for Holding {
    fn default() -> Self {
        Self {
            id: String::new(),
            symbol: String::new(),
            symbol_name: None,
            holding_type: String::new(),
            quantity: BigDecimal::from(0),
            currency: String::new(),
            base_currency: String::new(),
            market_price: None,
            average_cost: None,
            market_value: BigDecimal::from(0),
            book_value: BigDecimal::from(0),
            market_value_converted: BigDecimal::from(0),
            book_value_converted: BigDecimal::from(0),
            performance: Performance::default(),
            account: None,
            asset_class: None,
            asset_sub_class: None,
            asset_data_source: None,
            sectors: None,
            countries: None,
            portfolio_percent: None,
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FinancialHistory {
    pub account: Account,
    pub history: Vec<PortfolioHistory>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

#[derive(Queryable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name= crate::schema::app_settings)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub setting_key: String,
    pub setting_value: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
    pub instance_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            font: "default".to_string(),
            base_currency: "USD".to_string(),
            instance_id: "".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
}

#[derive(
    Queryable,
    Identifiable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::goals)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::goals)]
#[serde(rename_all = "camelCase")]
pub struct NewGoal {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: bool,
}

#[derive(
    Insertable,
    Queryable,
    Identifiable,
    Associations,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(belongs_to(Goal))]
#[diesel(belongs_to(Account))]
#[diesel(table_name = crate::schema::goals_allocation)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct GoalsAllocation {
    pub id: String,
    pub goal_id: String,
    pub account_id: String,
    pub percent_allocation: i32,
}

#[derive(Debug, Serialize, QueryableByName)]
#[serde(rename_all = "camelCase")]
#[diesel(table_name = crate::schema::activities)]
pub struct IncomeData {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub date: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub income_type: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol_name: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeSummary {
    pub period: String,
    pub by_month: HashMap<String, f64>,
    pub by_type: HashMap<String, f64>,
    pub by_symbol: HashMap<String, f64>,
    pub by_currency: HashMap<String, f64>,
    pub total_income: f64,
    pub currency: String,
    pub monthly_average: f64,
    pub yoy_growth: Option<f64>,
}

impl IncomeSummary {
    pub fn new(period: &str, currency: String) -> Self {
        IncomeSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_type: HashMap::new(),
            by_symbol: HashMap::new(),
            by_currency: HashMap::new(),
            total_income: 0.0,
            currency,
            monthly_average: 0.0,
            yoy_growth: None,
        }
    }

    pub fn add_income(&mut self, data: &IncomeData, converted_amount: f64) {
        *self.by_month.entry(data.date.to_string()).or_insert(0.0) += converted_amount;
        *self.by_type.entry(data.income_type.clone()).or_insert(0.0) += converted_amount;
        *self
            .by_symbol
            .entry(format!("[{}]-{}", data.symbol, data.symbol_name))
            .or_insert(0.0) += converted_amount;
        *self.by_currency.entry(data.currency.clone()).or_insert(0.0) += data.amount;
        self.total_income += converted_amount;
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or_else(|| self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = self.total_income / (months as f64);
        }
    }
}

#[derive(Debug, Clone, Queryable, QueryableByName, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::portfolio_history)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioHistory {
    pub id: String,
    pub account_id: String,
    pub date: String,
    pub total_value: f64,
    pub market_value: f64,
    pub book_cost: f64,
    pub available_cash: f64,
    pub net_deposit: f64,
    pub currency: String,
    pub base_currency: String,
    pub total_gain_value: f64,
    pub total_gain_percentage: f64,
    pub day_gain_percentage: f64,
    pub day_gain_value: f64,
    pub allocation_percentage: f64,
    pub exchange_rate: f64,
    pub holdings: Option<String>,
    pub calculated_at: NaiveDateTime,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub id: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub entries_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub account: Account,
    pub performance: PortfolioHistory,
}


#[derive(Queryable, Insertable, Identifiable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::contribution_limits)]
#[serde(rename_all = "camelCase")]
pub struct ContributionLimit {
    pub id: String,
    pub group_name: String,
    pub contribution_year: i32,
    pub limit_amount: f64,
    pub account_ids: Option<String>, // New field to store account IDs
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::contribution_limits)]
#[serde(rename_all = "camelCase")]
pub struct NewContributionLimit {
    pub id: Option<String>,
    pub group_name: String,
    pub contribution_year: i32,
    pub limit_amount: f64,
    pub account_ids: Option<String>, // New field to store account IDs
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountDeposit {
    pub amount: f64,
    pub currency: String,
    pub converted_amount: f64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DepositsCalculation {
    pub total: f64,
    pub base_currency: String,
    pub by_account: HashMap<String, AccountDeposit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeReturn {
    pub date: String,
    pub value: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeReturns {
    pub id: String,
    pub cumulative_returns: Vec<CumulativeReturn>,
    pub total_return: f64,
    pub annualized_return: f64,
}
