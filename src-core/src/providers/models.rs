// use std::{collections::HashMap, fmt};

// use serde::{Deserialize, Serialize};
// #[derive(Serialize, Deserialize, Debug)]
// #[serde(rename_all = "camelCase")]
// pub struct YahooAssetProfile {
//     pub name: String,
//     pub address1: String,
//     pub city: String,
//     pub state: String,
//     pub zip: String,
//     pub country: String,
//     pub phone: String,
//     pub website: String,
//     pub industry: String,
//     pub sector: String,
//     pub long_business_summary: String,
//     pub full_time_employees: i64,
//     pub audit_risk: i64,
//     pub board_risk: i64,
//     pub compensation_risk: i64,
//     pub share_holder_rights_risk: i64,
//     pub overall_risk: i64,
//     pub governance_epoch_date: String, // Handling dates as strings for simplicity
//     pub compensation_as_of_epoch_date: String,
//     pub max_age: i64,
// }

// #[derive(Debug, Serialize, Deserialize)]
// #[serde(rename_all = "camelCase")]
// pub struct YahooFinanceResponse {
//     pub asset_profile: YahooAssetProfile,
// }

// #[derive(Serialize, Deserialize)]
// #[serde(rename_all = "camelCase", deny_unknown_fields)]
// pub struct YahooResult {
//     pub quote_summary: YahooQuoteSummary,
// }

// #[derive(Serialize, Deserialize)]
// #[serde(rename_all = "camelCase")]
// pub struct YahooQuoteSummary {
//     pub result: Vec<QuoteSummaryResult>,
//     pub error: Option<serde_json::Value>,
// }

// #[derive(Debug, Serialize, Deserialize, Default)]
// #[serde(rename_all = "camelCase")]
// pub struct QuoteSummaryResult {
//     pub price: Option<Price>,
//     //pub summary_profile: Option<SummaryProfile>,
//     //pub top_holdings: Option<TopHoldings>,
// }

// #[derive(Debug, Serialize, Deserialize, Default)]
// #[serde(rename_all = "camelCase")]
// pub struct Price {
//     #[serde(flatten)]
//     pub other: HashMap<String, serde_json::Value>,
//     pub average_daily_volume_10_day: Option<i64>,
//     pub average_daily_volume_3_month: Option<i64>,
//     pub exchange: String,
//     pub exchange_name: String,
//     pub exchange_data_delayed_by: i64,
//     pub max_age: i64,
//     pub post_market_change_percent: Option<f64>,
//     pub short_name: String,
//     pub long_name: String,
//     pub quote_type: String,
//     pub symbol: String,
//     pub currency: Option<String>,
//     pub currency_symbol: Option<String>,
//     pub from_currency: Option<String>,
//     pub to_currency: Option<String>,
// }

// #[derive(Debug, Serialize, Deserialize, Default)]
// #[serde(rename_all = "camelCase")]
// pub struct QuoteType {
//     #[serde(flatten)]
//     pub other: HashMap<String, serde_json::Value>,
//     pub exchange: String,
//     pub quote_type: String,
//     pub symbol: String,
//     pub underlying_symbol: String,
//     pub short_name: Option<String>,
//     pub long_name: Option<String>,
//     pub first_trade_date_epoch_utc: Option<String>,
//     pub time_zone_full_name: String,
//     pub time_zone_short_name: String,
//     pub uuid: String,
//     pub message_board_id: Option<String>,
//     pub gmt_off_set_milliseconds: i64,
//     pub max_age: i64,
// }
// #[derive(Debug, Serialize, Deserialize, Default)]
// #[serde(rename_all = "camelCase")]
// pub struct SummaryProfile {
//     #[serde(flatten)]
//     pub other: HashMap<String, serde_json::Value>,
//     pub address1: Option<String>,
//     pub address2: Option<String>,
//     pub address3: Option<String>,
//     pub city: Option<String>,
//     pub state: Option<String>,
//     pub zip: Option<String>,
//     pub country: Option<String>,
//     pub phone: Option<String>,
//     pub fax: Option<String>,
//     pub website: Option<String>,
//     pub industry: Option<String>,
//     pub industry_disp: Option<String>,
//     pub sector: Option<String>,
//     pub sector_disp: Option<String>,
//     pub long_business_summary: Option<String>,
//     pub full_time_employees: Option<i64>,
//     pub company_officers: Vec<serde_json::Value>, // or a more specific type if known
//     pub max_age: i64,
//     pub twitter: Option<String>,
//     pub name: Option<String>,
//     pub start_date: Option<String>, // String representation of Date
//     pub description: Option<String>,
// }

// #[derive(Debug)]
// pub enum AssetClass {
//     Alternative,
//     Cryptocurrency,
//     Equity,
//     Commodity,
// }
// impl fmt::Display for AssetClass {
//     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
//         let display_string = match self {
//             AssetClass::Alternative => "Alternative",
//             AssetClass::Cryptocurrency => "Cryptocurrency",
//             AssetClass::Equity => "Equity",
//             AssetClass::Commodity => "Commodity",
//         };
//         write!(f, "{}", display_string)
//     }
// }

// #[derive(Debug)]
// pub enum AssetSubClass {
//     Alternative,
//     Cryptocurrency,
//     Stock,
//     Etf,
//     Commodity,
//     PreciousMetal,
//     MutualFund,
// }
// impl fmt::Display for AssetSubClass {
//     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
//         let display_string = match self {
//             AssetSubClass::Alternative => "Alternative",
//             AssetSubClass::Cryptocurrency => "Cryptocurrency",
//             AssetSubClass::Stock => "Stock",
//             AssetSubClass::Etf => "ETF",
//             AssetSubClass::Commodity => "Commodity",
//             AssetSubClass::PreciousMetal => "Precious Metal",
//             AssetSubClass::MutualFund => "Mutual Fund",
//         };
//         write!(f, "{}", display_string)
//     }
// }

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
    pub market_state: String,
    pub quote_type: String,
    pub symbol: String,
    pub underlying_symbol: Option<String>,
    pub short_name: String,
    pub long_name: String,
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
