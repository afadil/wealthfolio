use bigdecimal::BigDecimal;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Queryable;
use diesel::Selectable;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Queryable, Identifiable, AsChangeset, Serialize, Deserialize, Debug)]
#[diesel(table_name= crate::schema::platforms)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: String,
    pub name: Option<String>,
    pub url: String,
}

#[derive(
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
#[diesel(belongs_to(Platform))]
#[diesel(table_name= crate::schema::accounts)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub platform_id: Option<String>,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::accounts)]
#[serde(rename_all = "camelCase")]
pub struct NewAccount {
    pub id: Option<String>,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    pub platform_id: Option<String>,
}
#[derive(Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::accounts)]
#[serde(rename_all = "camelCase")]
pub struct AccountUpdate {
    pub id: Option<String>,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
    pub platform_id: Option<String>,
}

#[derive(
    Queryable,
    Selectable,
    Identifiable,
    PartialEq,
    AsChangeset,
    Serialize,
    Deserialize,
    Clone,
    Debug,
    Default,
)]
#[diesel(table_name = crate::schema::assets)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub comment: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}
#[derive(Insertable, Serialize, Deserialize, Debug, Default, Clone)]
#[diesel(table_name = crate::schema::assets)]
#[serde(rename_all = "camelCase")]
pub struct NewAsset {
    pub id: String,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub comment: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub symbol: String,
    pub sectors: Option<String>,
    pub countries: Option<String>,
    pub comment: String,
    pub asset_sub_class: Option<String>,
}

#[derive(
    Queryable,
    Selectable,
    Identifiable,
    Associations,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::activities)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(Account))]
#[diesel(belongs_to(Asset))]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: chrono::NaiveDateTime,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(PartialEq, Serialize, Deserialize, AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::activities)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ActivityUpdate {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
}
#[derive(Insertable, Serialize, Deserialize, AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::activities)]
#[serde(rename_all = "camelCase")]
pub struct NewActivity {
    pub id: Option<String>,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
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
)]
#[diesel(belongs_to(Asset, foreign_key = symbol))]
#[diesel(table_name= crate::schema::quotes)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub created_at: chrono::NaiveDateTime,
    pub data_source: String,
    pub date: chrono::NaiveDateTime,
    pub symbol: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub volume: f64,
    pub close: f64,
    pub adjclose: f64,
}

//********************************** */
// Custom models
//********************************** */
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub exchange: String,
    // pub exchange_display: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
    // pub sector: String,
    // pub industry: String,
    // pub data_source: bool,
}

#[derive(Queryable, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetails {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub account_name: String,
    pub account_currency: String,
    pub asset_symbol: String,
    pub asset_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySearchResponseMeta {
    pub total_row_count: i64, // Assuming totalRowCount is a 64-bit integer
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySearchResponse {
    pub data: Vec<ActivityDetails>,
    pub meta: ActivitySearchResponseMeta,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActivityImport {
    pub id: Option<String>,
    pub date: String,
    pub symbol: String,
    pub activity_type: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub comment: Option<String>,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub symbol_name: Option<String>,
    pub error: Option<String>,
    pub is_draft: bool,
    pub is_valid: bool,
    pub line_number: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Performance {
    pub total_gain_percent: BigDecimal,
    pub total_gain_amount: BigDecimal,
    pub total_gain_amount_converted: BigDecimal,
    pub day_gain_percent: Option<BigDecimal>,
    pub day_gain_amount: Option<BigDecimal>,
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

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub id: String,
    pub symbol: String,
    pub symbol_name: Option<String>,
    pub holding_type: String,
    pub quantity: BigDecimal,
    pub currency: String,
    pub base_currency: String,
    pub market_price: Option<BigDecimal>,
    pub average_cost: Option<BigDecimal>,
    pub market_value: BigDecimal,
    pub book_value: BigDecimal,
    pub market_value_converted: BigDecimal,
    pub book_value_converted: BigDecimal,
    pub performance: Performance,
    pub account: Option<Account>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub sectors: Option<Vec<Sector>>,
    pub countries: Option<Vec<Country>>,
    pub portfolio_percent: Option<BigDecimal>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FinancialHistory {
    pub account: Account,
    pub history: Vec<PortfolioHistory>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetProfile {
    pub asset: Asset,
    pub quote_history: Vec<Quote>,
}

#[derive(Debug, Clone)]
pub struct CrumbData {
    pub cookie: String,
    pub crumb: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooAssetProfile {
    pub address1: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub country: String,
    pub phone: String,
    pub website: String,
    pub industry: String,
    pub sector: String,
    pub long_business_summary: String,
    pub full_time_employees: i64,
    pub audit_risk: i64,
    pub board_risk: i64,
    pub compensation_risk: i64,
    pub share_holder_rights_risk: i64,
    pub overall_risk: i64,
    pub governance_epoch_date: String, // Handling dates as strings for simplicity
    pub compensation_as_of_epoch_date: String,
    pub max_age: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooFinanceResponse {
    pub asset_profile: AssetProfile,
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

#[derive(
    Queryable, Insertable, Identifiable, AsChangeset, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::exchange_rates)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRate {
    pub id: String,
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub source: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::exchange_rates)]
#[serde(rename_all = "camelCase")]
pub struct NewExchangeRate {
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub source: String,
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

#[derive(
    Debug, Clone, Serialize, Deserialize, Queryable, Identifiable, AsChangeset, Insertable,
)]
#[diesel(primary_key(account_id))]
#[diesel(table_name = crate::schema::activity_import_profiles)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ImportMapping {
    pub account_id: String,
    pub field_mappings: String,
    pub activity_mappings: String,
    pub symbol_mappings: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMappingData {
    pub account_id: String,
    pub field_mappings: HashMap<String, String>,
    pub activity_mappings: HashMap<String, Vec<String>>,
    pub symbol_mappings: HashMap<String, String>,
}

impl Default for ImportMappingData {
    fn default() -> Self {
        let mut field_mappings = HashMap::new();
        field_mappings.insert("date".to_string(), "date".to_string());
        field_mappings.insert("symbol".to_string(), "symbol".to_string());
        field_mappings.insert("quantity".to_string(), "quantity".to_string());
        field_mappings.insert("activityType".to_string(), "activityType".to_string());
        field_mappings.insert("unitPrice".to_string(), "unitPrice".to_string());
        field_mappings.insert("currency".to_string(), "currency".to_string());
        field_mappings.insert("fee".to_string(), "fee".to_string());

        let mut activity_mappings = HashMap::new();
        activity_mappings.insert("BUY".to_string(), vec!["BUY".to_string()]);
        activity_mappings.insert("SELL".to_string(), vec!["SELL".to_string()]);
        activity_mappings.insert("DIVIDEND".to_string(), vec!["DIVIDEND".to_string()]);
        activity_mappings.insert("INTEREST".to_string(), vec!["INTEREST".to_string()]);
        activity_mappings.insert("DEPOSIT".to_string(), vec!["DEPOSIT".to_string()]);
        activity_mappings.insert("WITHDRAWAL".to_string(), vec!["WITHDRAWAL".to_string()]);
        activity_mappings.insert("TRANSFER_IN".to_string(), vec!["TRANSFER_IN".to_string()]);
        activity_mappings.insert("TRANSFER_OUT".to_string(), vec!["TRANSFER_OUT".to_string()]);
        activity_mappings.insert("SPLIT".to_string(), vec!["SPLIT".to_string()]);
        activity_mappings.insert(
            "CONVERSION_IN".to_string(),
            vec!["CONVERSION_IN".to_string()],
        );
        activity_mappings.insert(
            "CONVERSION_OUT".to_string(),
            vec!["CONVERSION_OUT".to_string()],
        );
        activity_mappings.insert("FEE".to_string(), vec!["FEE".to_string()]);
        activity_mappings.insert("TAX".to_string(), vec!["TAX".to_string()]);

        ImportMappingData {
            account_id: String::new(),
            field_mappings,
            activity_mappings,
            symbol_mappings: HashMap::new(),
        }
    }
}

impl ImportMapping {
    pub fn to_mapping_data(&self) -> Result<ImportMappingData, serde_json::Error> {
        let mut mapping_data = ImportMappingData::default();
        mapping_data.account_id = self.account_id.clone();
        mapping_data.field_mappings = serde_json::from_str(&self.field_mappings)?;
        mapping_data.activity_mappings = serde_json::from_str(&self.activity_mappings)?;
        mapping_data.symbol_mappings = serde_json::from_str(&self.symbol_mappings)?;
        Ok(mapping_data)
    }

    pub fn from_mapping_data(data: &ImportMappingData) -> Result<Self, serde_json::Error> {
        Ok(Self {
            account_id: data.account_id.clone(),
            field_mappings: serde_json::to_string(&data.field_mappings)?,
            activity_mappings: serde_json::to_string(&data.activity_mappings)?,
            symbol_mappings: serde_json::to_string(&data.symbol_mappings)?,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
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
