use bigdecimal::BigDecimal;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Queryable;
use diesel::Selectable;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use diesel::sql_types::Text;

use crate::accounts::Account;
use num_traits::Zero;

pub const ROUNDING_SCALE: i64 = 18;
pub const PORTFOLIO_PERCENT_SCALE: i64 = 4;

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
    pub name: String,
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
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub amount: BigDecimal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeSummary {
    pub period: String,
    pub by_month: HashMap<String, BigDecimal>,
    pub by_type: HashMap<String, BigDecimal>,
    pub by_symbol: HashMap<String, BigDecimal>,
    pub by_currency: HashMap<String, BigDecimal>,
    pub total_income: BigDecimal,
    pub currency: String,
    pub monthly_average: BigDecimal,
    pub yoy_growth: Option<BigDecimal>,
}

impl IncomeSummary {
    pub fn new(period: &str, currency: String) -> Self {
        IncomeSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_type: HashMap::new(),
            by_symbol: HashMap::new(),
            by_currency: HashMap::new(),
            total_income: BigDecimal::zero(),
            currency,
            monthly_average: BigDecimal::zero(),
            yoy_growth: None,
        }
    }

    pub fn add_income(&mut self, data: &IncomeData, converted_amount: BigDecimal) {
        *self.by_month.entry(data.date.to_string()).or_insert_with(BigDecimal::zero) += &converted_amount;
        *self.by_type.entry(data.income_type.clone()).or_insert_with(BigDecimal::zero) += &converted_amount;
        *self
            .by_symbol
            .entry(format!("[{}]-{}", data.symbol, data.symbol_name))
            .or_insert_with(BigDecimal::zero) += &converted_amount;
        *self.by_currency.entry(data.currency.clone()).or_insert_with(BigDecimal::zero) += &data.amount;
        self.total_income += &converted_amount;
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or_else(|| self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = &self.total_income / BigDecimal::from(months);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioHistory {
    pub id: String,
    pub account_id: String,
    pub date: String,
    #[serde(rename = "currency")]
    pub currency: String,
    #[serde(rename = "baseCurrency")]
    pub base_currency: String,
    #[serde(with = "bigdecimal_serde")]
    pub total_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub market_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub book_cost: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub available_cash: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub net_deposit: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub total_gain_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub total_gain_percentage: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub day_gain_percentage: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub day_gain_value: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub allocation_percentage: BigDecimal,
    #[serde(with = "bigdecimal_serde")]
    pub exchange_rate: BigDecimal,
    pub holdings: Option<String>,
    pub calculated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Queryable, QueryableByName, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::portfolio_history)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct PortfolioHistoryDB {
    #[diesel(sql_type = Text)]
    pub id: String,
    #[diesel(sql_type = Text)]
    pub account_id: String,
    #[diesel(sql_type = Text)]
    pub date: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub total_value: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub market_value: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub book_cost: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub available_cash: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub net_deposit: String,
    #[diesel(sql_type = Text)]
    pub currency: String,
    #[diesel(sql_type = Text)]
    pub base_currency: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub total_gain_value: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub total_gain_percentage: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub day_gain_percentage: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub day_gain_value: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub allocation_percentage: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub exchange_rate: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<Text>)]
    pub holdings: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub calculated_at: NaiveDateTime,
}

impl From<PortfolioHistoryDB> for PortfolioHistory {
    fn from(db: PortfolioHistoryDB) -> Self {
        Self {
            id: db.id,
            account_id: db.account_id,
            date: db.date,
            currency: db.currency,
            base_currency: db.base_currency,
            total_value: BigDecimal::from_str(&db.total_value).unwrap_or_default(),
            market_value: BigDecimal::from_str(&db.market_value).unwrap_or_default(),
            book_cost: BigDecimal::from_str(&db.book_cost).unwrap_or_default(),
            available_cash: BigDecimal::from_str(&db.available_cash).unwrap_or_default(),
            net_deposit: BigDecimal::from_str(&db.net_deposit).unwrap_or_default(),
            total_gain_value: BigDecimal::from_str(&db.total_gain_value).unwrap_or_default(),
            total_gain_percentage: BigDecimal::from_str(&db.total_gain_percentage).unwrap_or_default(),
            day_gain_percentage: BigDecimal::from_str(&db.day_gain_percentage).unwrap_or_default(),
            day_gain_value: BigDecimal::from_str(&db.day_gain_value).unwrap_or_default(),
            allocation_percentage: BigDecimal::from_str(&db.allocation_percentage).unwrap_or_default(),
            exchange_rate: BigDecimal::from_str(&db.exchange_rate).unwrap_or_default(),
            holdings: db.holdings,
            calculated_at: db.calculated_at,
        }
    }
}

impl From<PortfolioHistory> for PortfolioHistoryDB {
    fn from(domain: PortfolioHistory) -> Self {
        Self {
            id: domain.id,
            account_id: domain.account_id,
            date: domain.date,
            currency: domain.currency,
            base_currency: domain.base_currency,
            total_value: domain.total_value.with_scale(ROUNDING_SCALE).to_string(),
            market_value: domain.market_value.with_scale(ROUNDING_SCALE).to_string(),
            book_cost: domain.book_cost.with_scale(ROUNDING_SCALE).to_string(),
            available_cash: domain.available_cash.with_scale(ROUNDING_SCALE).to_string(),
            net_deposit: domain.net_deposit.with_scale(ROUNDING_SCALE).to_string(),
            total_gain_value: domain.total_gain_value.with_scale(ROUNDING_SCALE).to_string(),
            total_gain_percentage: domain.total_gain_percentage.with_scale(ROUNDING_SCALE).to_string(),
            day_gain_percentage: domain.day_gain_percentage.with_scale(ROUNDING_SCALE).to_string(),
            day_gain_value: domain.day_gain_value.with_scale(ROUNDING_SCALE).to_string(),
            allocation_percentage: domain.allocation_percentage.with_scale(PORTFOLIO_PERCENT_SCALE).to_string(),
            exchange_rate: domain.exchange_rate.with_scale(ROUNDING_SCALE).to_string(),
            holdings: domain.holdings,
            calculated_at: domain.calculated_at,
        }
    }
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
    pub account_ids: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
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
    pub account_ids: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountDeposit {
    pub amount: BigDecimal,
    pub currency: String,
    pub converted_amount: BigDecimal,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DepositsCalculation {
    pub total: BigDecimal,
    pub base_currency: String,
    pub by_account: HashMap<String, AccountDeposit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeReturn {
    pub date: String,
    pub value: BigDecimal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativeReturns {
    pub id: String,
    pub cumulative_returns: Vec<CumulativeReturn>,
    pub total_return: Option<BigDecimal>,
    pub annualized_return: Option<BigDecimal>,
}
