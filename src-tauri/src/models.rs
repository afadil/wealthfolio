use chrono::NaiveDateTime;
use diesel::prelude::*;
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
    Queryable, Identifiable, Insertable, Associations, Serialize, AsChangeset, Deserialize, Debug,
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
    pub date: chrono::NaiveDateTime,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
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

#[derive(Serialize, Debug, Deserialize)]
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
    pub is_draft: Option<String>,
    pub is_valid: Option<String>,
    pub line_number: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Performance {
    pub total_gain_percent: f64,
    pub total_gain_amount: f64,
    pub total_gain_amount_converted: f64,
    pub day_gain_percent: Option<f64>,
    pub day_gain_amount: Option<f64>,
    pub day_gain_amount_converted: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sector {
    pub name: String,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub id: String,
    pub symbol: String,
    pub symbol_name: Option<String>,
    pub holding_type: String,
    pub quantity: f64,
    pub currency: String,
    pub base_currency: String,
    pub market_price: Option<f64>,
    pub average_cost: Option<f64>,
    pub market_value: f64,
    pub book_value: f64,
    pub market_value_converted: f64,
    pub book_value_converted: f64,
    pub performance: Performance,
    pub account: Option<Account>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub sectors: Option<Vec<Sector>>,
}

// FinancialSnapshot and FinancialHistory structs with serde for serialization/deserialization
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FinancialSnapshot {
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
    pub allocation_percentage: Option<f64>,
    pub exchange_rate: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FinancialHistory {
    pub account: Account, // Define Account struct accordingly
    pub history: Vec<FinancialSnapshot>,
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
#[diesel(table_name= crate::schema::settings)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i32,
    pub theme: String,
    pub font: String,
    pub base_currency: String,
}

#[derive(Insertable, Serialize, AsChangeset, Deserialize, Debug)]
#[diesel(table_name= crate::schema::settings)]
#[serde(rename_all = "camelCase")]
pub struct NewSettings<'a> {
    pub theme: &'a str,
    pub font: &'a str,
    pub base_currency: &'a str,
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

#[derive(Debug, Serialize)]
pub struct IncomeData {
    pub date: NaiveDateTime,
    pub income_type: String,
    pub symbol: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Serialize)]
pub struct IncomeSummary {
    pub by_month: HashMap<String, f64>,
    pub by_type: HashMap<String, f64>,
    pub by_symbol: HashMap<String, f64>,
    pub total_income: f64,
    pub total_income_ytd: f64,
    pub currency: String,
}
