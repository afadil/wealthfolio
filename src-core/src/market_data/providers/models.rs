use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fmt};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooResult {
    pub quote_summary: QuoteSummary,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub result: Vec<QuoteSummaryResult>,
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummaryResult {
    pub price: Option<Price>,
    pub summary_profile: Option<SummaryProfile>,
    pub top_holdings: Option<TopHoldings>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub regular_market_change_percent: Option<Change>,
    pub regular_market_change: Option<Change>,
    pub regular_market_time: Option<i64>,
    pub regular_market_price: Option<PriceDetail>,
    pub regular_market_day_high: Option<PriceDetail>,
    pub regular_market_day_low: Option<PriceDetail>,
    pub regular_market_volume: Option<Volume>,
    pub average_daily_volume_10_day: Option<Volume>,
    pub average_daily_volume_3_month: Option<Volume>,
    pub regular_market_previous_close: Option<PriceDetail>,
    pub regular_market_source: Option<String>,
    pub regular_market_open: Option<PriceDetail>,
    pub strike_price: Option<PriceDetail>,
    pub open_interest: Option<PriceDetail>,
    pub exchange: Option<String>,
    pub exchange_name: Option<String>,
    pub exchange_data_delayed_by: Option<i32>,
    pub market_state: Option<String>,
    pub quote_type: String,
    pub symbol: String,
    pub underlying_symbol: Option<String>,
    pub short_name: Option<String>,
    pub long_name: Option<String>,
    pub currency: Option<String>,
    pub quote_source_name: Option<String>,
    pub currency_symbol: Option<String>,
    pub from_currency: Option<String>,
    pub to_currency: Option<String>,
    pub last_market: Option<String>,

    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub raw: Option<f64>,
    pub fmt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceDetail {
    pub raw: Option<f64>,
    pub fmt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub raw: Option<f64>,
    pub fmt: Option<String>,
    pub long_fmt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MarketCap {
    pub raw: Option<f64>,
    pub fmt: Option<String>,
    pub long_fmt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryProfile {
    pub address1: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub industry: Option<String>,
    pub industry_key: Option<String>,
    pub industry_disp: Option<String>,
    pub sector: Option<String>,
    pub sector_key: Option<String>,
    pub sector_disp: Option<String>,
    pub long_business_summary: Option<String>,
    pub full_time_employees: Option<i32>,
    pub company_officers: Option<Vec<serde_json::Value>>,
    pub max_age: Option<i32>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopHoldings {
    pub stock_position: Option<PriceDetail>,
    pub bond_position: Option<PriceDetail>,
    pub sector_weightings: Vec<TopHoldingsSectorWeighting>,
    pub cash_position: Option<PriceDetail>,
    pub other_position: Option<PriceDetail>,
    pub preferred_position: Option<PriceDetail>,
    pub convertible_position: Option<PriceDetail>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopHoldingsSectorWeighting {
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
    pub realestate: Option<PriceDetail>,
    pub consumer_cyclical: Option<PriceDetail>,
    pub basic_materials: Option<PriceDetail>,
    pub consumer_defensive: Option<PriceDetail>,
    pub technology: Option<PriceDetail>,
    pub communication_services: Option<PriceDetail>,
    pub financial_services: Option<PriceDetail>,
    pub utilities: Option<PriceDetail>,
    pub industrials: Option<PriceDetail>,
    pub energy: Option<PriceDetail>,
    pub healthcare: Option<PriceDetail>,
}

#[derive(Debug)]
pub enum AssetClass {
    Equity,
    // FixedIncome,
    // Cash,
    // RealEstate,
    Commodity,
    Alternative,
    Cryptocurrency,
}
impl fmt::Display for AssetClass {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let display_string = match self {
            AssetClass::Alternative => "Alternative",
            AssetClass::Cryptocurrency => "Cryptocurrency",
            AssetClass::Equity => "Equity",
            AssetClass::Commodity => "Commodity",
            // AssetClass::FixedIncome => "Fixed Income",
            // AssetClass::Cash => "Cash",
            // AssetClass::RealEstate => "Real Estate",
        };
        write!(f, "{}", display_string)
    }
}

#[derive(Debug)]
pub enum AssetSubClass {
    Alternative,
    Cryptocurrency,
    Stock,
    Etf,
    Commodity,
    PreciousMetal,
    MutualFund,
}
impl fmt::Display for AssetSubClass {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let display_string = match self {
            AssetSubClass::Alternative => "Alternative",
            AssetSubClass::Cryptocurrency => "Cryptocurrency",
            AssetSubClass::Stock => "Stock",
            AssetSubClass::Etf => "ETF",
            AssetSubClass::Commodity => "Commodity",
            AssetSubClass::PreciousMetal => "Precious Metal",
            AssetSubClass::MutualFund => "Mutual Fund",
        };
        write!(f, "{}", display_string)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetProfile {
    pub id: Option<String>,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub notes: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}
