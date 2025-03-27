use rust_decimal::Decimal;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Queryable;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use diesel::sql_types::Text;

use crate::accounts::Account;

pub const ROUNDING_SCALE: u32 = 18;
pub const PORTFOLIO_PERCENT_SCALE: u32 = 4;

// Custom serializer/deserializer for Decimal (rounds on serialization)
mod decimal_serde {
    use rust_decimal::Decimal;
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serializer};
    use std::str::FromStr;

    pub fn serialize<S>(value: &Decimal, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let rounded = value.round_dp(super::ROUNDING_SCALE);
        serializer.serialize_str(&rounded.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Decimal, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: String = String::deserialize(deserializer)?;
        Decimal::from_str(&s).map_err(|_| D::Error::custom("Invalid Decimal"))
    }
}

// Custom serializer/deserializer for Option<Decimal>
mod decimal_serde_option {
    use rust_decimal::Decimal;
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serializer};
    use std::str::FromStr;

    pub fn serialize<S>(value: &Option<Decimal>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(d) => {
                let rounded = d.round_dp(super::ROUNDING_SCALE);
                serializer.serialize_str(&rounded.to_string())
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Decimal>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: Option<String> = Option::deserialize(deserializer)?;
        match s {
            Some(s) => {
                let d = Decimal::from_str(&s)
                    .map_err(|_| D::Error::custom("Invalid Decimal"))?;
                Ok(Some(d))
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
    #[serde(with = "decimal_serde")]
    pub total_gain_percent: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_amount: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_amount_converted: Decimal,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_percent: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_amount: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub day_gain_amount_converted: Option<Decimal>,
}

impl Default for Performance {
    fn default() -> Self {
        Performance {
            total_gain_percent: Decimal::ZERO,
            total_gain_amount: Decimal::ZERO,
            total_gain_amount_converted: Decimal::ZERO,
            day_gain_percent: Some(Decimal::ZERO),
            day_gain_amount: Some(Decimal::ZERO),
            day_gain_amount_converted: Some(Decimal::ZERO),
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
    #[serde(with = "decimal_serde")]
    pub quantity: Decimal,
    pub currency: String,
    pub base_currency: String,
    #[serde(with = "decimal_serde_option")]
    pub market_price: Option<Decimal>,
    #[serde(with = "decimal_serde_option")]
    pub average_cost: Option<Decimal>,
    #[serde(with = "decimal_serde")]
    pub market_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub book_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub market_value_converted: Decimal,
    #[serde(with = "decimal_serde")]
    pub book_value_converted: Decimal,
    pub performance: Performance,
    pub account: Option<Account>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub asset_data_source: Option<String>,
    pub sectors: Option<Vec<Sector>>,
    pub countries: Option<Vec<Country>>,
    #[serde(with = "decimal_serde_option")]
    pub portfolio_percent: Option<Decimal>,
}

impl Default for Holding {
    fn default() -> Self {
        Self {
            id: String::new(),
            symbol: String::new(),
            symbol_name: None,
            holding_type: String::new(),
            quantity: Decimal::ZERO,
            currency: String::new(),
            base_currency: String::new(),
            market_price: None,
            average_cost: None,
            market_value: Decimal::ZERO,
            book_value: Decimal::ZERO,
            market_value_converted: Decimal::ZERO,
            book_value_converted: Decimal::ZERO,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinancialHistory {
    pub account: Account,
    pub history: Vec<HistoryRecord>,
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
     #[serde(with = "decimal_serde")]
    pub amount: Decimal,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeSummary {
    pub period: String,
    pub by_month: HashMap<String, Decimal>,
    pub by_type: HashMap<String, Decimal>,
    pub by_symbol: HashMap<String, Decimal>,     
    pub by_currency: HashMap<String, Decimal>,
    #[serde(with = "decimal_serde")]
    pub total_income: Decimal,
    pub currency: String,
    #[serde(with = "decimal_serde")]
    pub monthly_average: Decimal,
    #[serde(with = "decimal_serde_option")]
    pub yoy_growth: Option<Decimal>,
}

impl IncomeSummary {
    pub fn new(period: &str, currency: String) -> Self {
        IncomeSummary {
            period: period.to_string(),
            by_month: HashMap::new(),
            by_type: HashMap::new(),
            by_symbol: HashMap::new(),
            by_currency: HashMap::new(),
            total_income: Decimal::ZERO,
            currency,
            monthly_average: Decimal::ZERO,
            yoy_growth: None,
        }
    }

    pub fn add_income(&mut self, data: &IncomeData, converted_amount: Decimal) {
        *self.by_month.entry(data.date.to_string()).or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self.by_type.entry(data.income_type.clone()).or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self
            .by_symbol
            .entry(format!("[{}]-{}", data.symbol, data.symbol_name))
            .or_insert_with(|| Decimal::ZERO) += &converted_amount;
        *self.by_currency.entry(data.currency.clone()).or_insert_with(|| Decimal::ZERO) += &data.amount;
        self.total_income += &converted_amount;
    }

    pub fn calculate_monthly_average(&mut self, num_months: Option<u32>) {
        let months = num_months.unwrap_or_else(|| self.by_month.len() as u32);
        if months > 0 {
            self.monthly_average = &self.total_income / Decimal::new(months as i64, 0);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub account_id: String,
    pub date: String,
    #[serde(rename = "currency")]
    pub currency: String,
    #[serde(rename = "baseCurrency")]
    pub base_currency: String,
    #[serde(with = "decimal_serde")]
    pub total_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub market_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub book_cost: Decimal,
    #[serde(with = "decimal_serde")]
    pub available_cash: Decimal,
    #[serde(with = "decimal_serde")]
    pub net_deposit: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub total_gain_percentage: Decimal,
    #[serde(with = "decimal_serde")]
    pub day_gain_percentage: Decimal,
    #[serde(with = "decimal_serde")]
    pub day_gain_value: Decimal,
    #[serde(with = "decimal_serde")]
    pub allocation_percentage: Decimal,
    #[serde(with = "decimal_serde")]
    pub exchange_rate: Decimal,
    pub holdings: Option<String>,
    pub calculated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Queryable, QueryableByName, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::portfolio_history)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecordDB {
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

impl From<HistoryRecordDB> for HistoryRecord {
    fn from(db: HistoryRecordDB) -> Self {
        Self {
            id: db.id,
            account_id: db.account_id,
            date: db.date,
            currency: db.currency,
            base_currency: db.base_currency,
            total_value: Decimal::from_str(&db.total_value).unwrap_or_default(),
            market_value: Decimal::from_str(&db.market_value).unwrap_or_default(),
            book_cost: Decimal::from_str(&db.book_cost).unwrap_or_default(),
            available_cash: Decimal::from_str(&db.available_cash).unwrap_or_default(),
            net_deposit: Decimal::from_str(&db.net_deposit).unwrap_or_default(),
            total_gain_value: Decimal::from_str(&db.total_gain_value).unwrap_or_default(),
            total_gain_percentage: Decimal::from_str(&db.total_gain_percentage).unwrap_or_default(),
            day_gain_percentage: Decimal::from_str(&db.day_gain_percentage).unwrap_or_default(),
            day_gain_value: Decimal::from_str(&db.day_gain_value).unwrap_or_default(),
            allocation_percentage: Decimal::from_str(&db.allocation_percentage).unwrap_or_default(),
            exchange_rate: Decimal::from_str(&db.exchange_rate).unwrap_or_default(),
            holdings: db.holdings,
            calculated_at: db.calculated_at,
        }
    }
}

impl From<HistoryRecord> for HistoryRecordDB {
    fn from(domain: HistoryRecord) -> Self {
        Self {
            id: domain.id,
            account_id: domain.account_id,
            date: domain.date,
            currency: domain.currency,
            base_currency: domain.base_currency,
            total_value: domain.total_value.round_dp(ROUNDING_SCALE).to_string(),
            market_value: domain.market_value.round_dp(ROUNDING_SCALE).to_string(),
            book_cost: domain.book_cost.round_dp(ROUNDING_SCALE).to_string(),
            available_cash: domain.available_cash.round_dp(ROUNDING_SCALE).to_string(),
            net_deposit: domain.net_deposit.round_dp(ROUNDING_SCALE).to_string(),
            total_gain_value: domain.total_gain_value.round_dp(ROUNDING_SCALE).to_string(),
            total_gain_percentage: domain.total_gain_percentage.round_dp(ROUNDING_SCALE).to_string(),
            day_gain_percentage: domain.day_gain_percentage.round_dp(ROUNDING_SCALE).to_string(),
            day_gain_value: domain.day_gain_value.round_dp(ROUNDING_SCALE).to_string(),
            allocation_percentage: domain.allocation_percentage.round_dp(PORTFOLIO_PERCENT_SCALE).to_string(),
            exchange_rate: domain.exchange_rate.round_dp(ROUNDING_SCALE).to_string(),
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
    pub performance: HistoryRecord,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
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
