use std::{collections::HashMap, fmt, sync::RwLock, time::SystemTime};

use crate::models::{Asset, CrumbData, NewAsset, QuoteSummary};
use lazy_static::lazy_static;
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use yahoo::{YQuoteItem, YahooError};
use yahoo_finance_api as yahoo;

impl From<&YQuoteItem> for QuoteSummary {
    fn from(item: &YQuoteItem) -> Self {
        QuoteSummary {
            exchange: item.exchange.clone(),
            short_name: item.short_name.clone(),
            quote_type: item.quote_type.clone(),
            symbol: item.symbol.clone(),
            index: item.index.clone(),
            score: item.score,
            type_display: item.type_display.clone(),
            long_name: item.long_name.clone(),
            // sector: item.sector.clone(),
            // industry: item.industry.clone(),
            // data_source: item.data_source.clone(),
            // exchange_display: item.exchange_display.clone(),
            // data_source: "YAHOO".to_string(),
        }
    }
}

impl From<&YQuoteItem> for NewAsset {
    fn from(item: &YQuoteItem) -> Self {
        NewAsset {
            id: item.symbol.clone(), // Assuming the symbol is used as the id
            isin: None,              // Map the rest of the fields accordingly
            name: Some(item.long_name.clone()),
            asset_type: Some(item.quote_type.clone()),
            symbol: item.symbol.clone(),
            data_source: "YAHOO".to_string(),
            ..Default::default() // Use default for the rest
        }
    }
}

// impl<'a> From<&'a YQuoteItem> for NewAsset<'a> {
//     fn from(item: &'a YQuoteItem) -> Self {
//         NewAsset {
//             id: &item.symbol,
//             isin: None,
//             name: Some(&item.long_name),
//             asset_type: Some(&item.quote_type),
//             symbol: &item.symbol,
//             symbol_mapping: Some(&item.symbol),
//             asset_class: None, // Assuming YQuoteItem does not provide asset class
//             asset_sub_class: None, // Assuming YQuoteItem does not provide asset sub class
//             comment: None,     // Assuming YQuoteItem does not provide a comment
//             countries: None,   // Assuming YQuoteItem does not provide countries
//             categories: None,  // Assuming YQuoteItem does not provide categories
//             classes: None,     // Assuming YQuoteItem does not provide classes
//             attributes: None,  // Assuming YQuoteItem does not provide attributes
//             currency: "", // You need to provide a default currency or fetch it from YQuoteItem if available
//             data_source: "YAHOO",
//             sectors: None, // Assuming YQuoteItem does not provide sectors
//             url: None,     // Assuming YQuoteItem does not provide a URL
//         }
//     }
// }

impl Default for Asset {
    fn default() -> Self {
        Asset {
            id: Default::default(),
            isin: Default::default(),
            name: Default::default(),
            asset_type: Default::default(),
            symbol: Default::default(),
            symbol_mapping: Default::default(),
            asset_class: Default::default(),
            asset_sub_class: Default::default(),
            comment: Default::default(),
            countries: Default::default(),
            categories: Default::default(),
            classes: Default::default(),
            attributes: Default::default(),
            created_at: Default::default(),
            currency: Default::default(),
            data_source: Default::default(),
            updated_at: Default::default(),
            sectors: Default::default(),
            url: Default::default(),
        }
    }
}

#[derive(Debug, Error)]
pub enum MyError {
    #[error("Network request failed")]
    Network(#[from] reqwest::Error),
    #[error("Regex error occurred")]
    Regex(#[from] regex::Error),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooAssetProfile {
    pub name: String,
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
    pub asset_profile: YahooAssetProfile,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct YahooResult {
    pub quote_summary: YahooQuoteSummary,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooQuoteSummary {
    pub result: Vec<QuoteSummaryResult>,
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummaryResult {
    pub price: Option<Price>,
    //pub summary_profile: Option<SummaryProfile>,
    //pub top_holdings: Option<TopHoldings>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopHoldings {
    pub stock_position: Option<f64>,
    pub bond_position: Option<f64>,
    pub sector_weightings: Vec<TopHoldingsSectorWeighting>,
    pub cash_position: Option<f64>,
    pub other_position: Option<f64>,
    pub preferred_position: Option<f64>,
    pub convertible_position: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
    pub average_daily_volume_10_day: Option<i64>,
    pub average_daily_volume_3_month: Option<i64>,
    pub exchange: String,
    pub exchange_name: String,
    pub exchange_data_delayed_by: i64,
    pub max_age: i64,
    pub post_market_change_percent: Option<f64>,
    pub short_name: String,
    pub long_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub currency: Option<String>,
    pub currency_symbol: Option<String>,
    pub from_currency: Option<String>,
    pub to_currency: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuoteType {
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
    pub exchange: String,
    pub quote_type: String,
    pub symbol: String,
    pub underlying_symbol: String,
    pub short_name: Option<String>,
    pub long_name: Option<String>,
    pub first_trade_date_epoch_utc: Option<String>,
    pub time_zone_full_name: String,
    pub time_zone_short_name: String,
    pub uuid: String,
    pub message_board_id: Option<String>,
    pub gmt_off_set_milliseconds: i64,
    pub max_age: i64,
}
#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SummaryProfile {
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
    pub address1: Option<String>,
    pub address2: Option<String>,
    pub address3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub fax: Option<String>,
    pub website: Option<String>,
    pub industry: Option<String>,
    pub industry_disp: Option<String>,
    pub sector: Option<String>,
    pub sector_disp: Option<String>,
    pub long_business_summary: Option<String>,
    pub full_time_employees: Option<i64>,
    pub company_officers: Vec<serde_json::Value>, // or a more specific type if known
    pub max_age: i64,
    pub twitter: Option<String>,
    pub name: Option<String>,
    pub start_date: Option<String>, // String representation of Date
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopHoldingsSectorWeighting {
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
    pub realestate: Option<f64>,
    pub consumer_cyclical: Option<f64>,
    pub basic_materials: Option<f64>,
    pub consumer_defensive: Option<f64>,
    pub technology: Option<f64>,
    pub communication_services: Option<f64>,
    pub financial_services: Option<f64>,
    pub utilities: Option<f64>,
    pub industrials: Option<f64>,
    pub energy: Option<f64>,
    pub healthcare: Option<f64>,
}

#[derive(Debug)]
enum AssetClass {
    Alternative,
    Cryptocurrency,
    Equity,
    Commodity,
}
impl fmt::Display for AssetClass {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let display_string = match self {
            AssetClass::Alternative => "Alternative",
            AssetClass::Cryptocurrency => "Cryptocurrency",
            AssetClass::Equity => "Equity",
            AssetClass::Commodity => "Commodity",
        };
        write!(f, "{}", display_string)
    }
}

#[derive(Debug)]
enum AssetSubClass {
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

lazy_static! {
    pub static ref YAHOO_CRUMB: RwLock<Option<CrumbData>> = RwLock::default();
}

pub struct YahooProvider {
    provider: yahoo::YahooConnector,
}

impl YahooProvider {
    pub fn new() -> Self {
        YahooProvider {
            provider: yahoo::YahooConnector::new(),
        }
    }

    // pub async fn set_crumb() -> Result<(), yahoo::YahooError> {
    pub async fn set_crumb(&self) -> Result<(), yahoo::YahooError> {
        let client = Client::new();

        // Make the first call to extract the Crumb cookie
        let response = client.get("https://fc.yahoo.com").send().await?;

        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .and_then(|header| header.to_str().ok())
            .and_then(|s| s.split_once(';').map(|(value, _)| value))
            .ok_or_else(|| {
                YahooError::FetchFailed("Error parsing Yahoo Crumb Cookie".to_string())
            })?;
        // Replace the URL with the appropriate one for fetching the crumb
        let crumb_url = "https://query1.finance.yahoo.com/v1/test/getcrumb"; // Update this URL as needed
        let request = client
            .get(crumb_url)
            .header(header::USER_AGENT, "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36")
            .header(header::COOKIE, cookie)
            .send()
            .await?;

        let crumb = request.text().await?;

        let crumb_data = CrumbData {
            cookie: cookie.to_string(),
            crumb,
        };

        let mut yahoo_crumb = YAHOO_CRUMB.write().unwrap();
        *yahoo_crumb = Some(crumb_data);

        Ok(())
    }

    pub async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, yahoo::YahooError> {
        // Call the search_ticker method on the provider instance and await the result
        let result = self.provider.search_ticker(query).await?;

        // Map the result to Vec<QuoteSummary>
        let asset_profiles = result
            .quotes
            .iter()
            .map(|ticker_info| QuoteSummary::from(ticker_info)) // No need to dereference or clone
            .collect();

        Ok(asset_profiles)
    }

    pub async fn fetch_quote_summary(&self, symbol: &str) -> Result<NewAsset, yahoo::YahooError> {
        println!("fetch_asset_profile for symbol: {}", symbol);
        // Handle the cash asset case
        if let Some(currency) = symbol.strip_prefix("$CASH-") {
            return Ok(self.create_cash_asset(symbol, currency));
        }

        //let result = self.provider.search_ticker(symbol).await?;

        let response = self.fetch_asset_profile(symbol).await?;
        let asset_profile =
            response
                .quote_summary
                .result
                .first()
                .ok_or(YahooError::FetchFailed(
                    "No asset profile found".to_string(),
                ))?; // Better error handling

        println!("asset_profile: {:?}", asset_profile);

        let (asset_class, asset_sub_class) = self.parse_asset_class(
            asset_profile.price.as_ref().map_or("", |p| &p.quote_type),
            asset_profile.price.as_ref().map_or("", |p| &p.short_name),
        );

        let formatted_name = asset_profile.price.as_ref().map_or_else(
            || symbol.to_string(),
            |price| {
                self.format_name(
                    Some(&price.long_name),
                    &price.quote_type,
                    Some(&price.short_name),
                    &price.symbol,
                )
            },
        );

        let new_asset = NewAsset {
            id: symbol.to_string(),
            isin: None, // Extract from asset_profile if available
            name: Some(formatted_name),
            asset_type: Some(asset_class.to_string()), // Convert enum to String
            symbol: symbol.to_string(),
            symbol_mapping: Some(symbol.to_string()),
            currency: asset_profile
                .price
                .as_ref()
                .and_then(|p| p.currency.clone())
                .unwrap_or_default(),
            data_source: "Yahoo".to_string(),
            asset_class: Some(asset_class.to_string()), // Convert enum to String
            asset_sub_class: Some(asset_sub_class.to_string()), // Convert enum to String
            // comment: asset_profile
            //     .summary_profile
            //     .as_ref()
            //     .and_then(|sp| sp.long_business_summary.clone()),
            comment: None, // Extract from asset_profile if available

            countries: None,  // Logic for country extraction goes here
            categories: None, // Extract from asset_profile if available
            classes: None,    // Extract from asset_profile if available
            attributes: None, // Extract from asset_profile if available
            sectors: None,    // Logic for sector extraction goes here
            url: None,
            // url: asset_profile
            //     .summary_profile
            //     .as_ref()
            //     .and_then(|sp| sp.website.clone()),
            // Other fields...
        };

        Ok(new_asset)
    }

    fn create_cash_asset(&self, symbol: &str, currency: &str) -> NewAsset {
        NewAsset {
            id: symbol.to_string(),
            isin: None,
            name: None,
            asset_type: None,
            symbol: symbol.to_string(),
            symbol_mapping: None,
            asset_class: Some("CASH".to_string()),
            asset_sub_class: Some("CASH".to_string()),
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            currency: currency.to_string(),
            data_source: "MANUAL".to_string(),
            sectors: None,
            url: None,
        }
    }

    /// Fetch historic quotes between start and end date
    pub async fn fetch_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<yahoo::Quote>, yahoo::YahooError> {
        let provider = yahoo::YahooConnector::new();

        if symbol.starts_with("$CASH-") {
            return Ok(vec![]);
        }

        // Convert SystemTime to OffsetDateTime as required by get_quote_history
        let start_offset = start.into();
        let end_offset = end.into();

        let response = provider
            .get_quote_history(symbol, start_offset, end_offset)
            .await?;

        response.quotes()
    }

    pub async fn get_latest_quote(&self, symbol: &str) -> Result<yahoo::Quote, yahoo::YahooError> {
        let provider: yahoo::YahooConnector = yahoo::YahooConnector::new();

        if symbol.starts_with("$CASH-") {
            // Return a default Quote for $CASH- symbols
            return Ok(yahoo::Quote {
                timestamp: 0, // Adjust these values as appropriate
                open: 1.0,
                high: 1.0,
                low: 1.0,
                volume: 0,
                close: 1.0,
                adjclose: 0.0,
            });
        }

        let response = provider.get_latest_quotes(symbol, "1d").await?;
        let quote = response.last_quote().unwrap();

        Ok(quote)
    }

    pub async fn fetch_asset_profile(
        &self,
        symbol: &str,
    ) -> Result<YahooResult, yahoo::YahooError> {
        let crumb_data = YAHOO_CRUMB.read().unwrap();

        // Using `ok_or_else` for more concise error handling
        let crumb_data = crumb_data
            .as_ref()
            .ok_or_else(|| YahooError::FetchFailed("Crumb data not found".into()))?;

        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=price,summaryProfile,topHoldings&crumb={}",
            symbol,
            crumb_data.crumb
        );

        let client = Client::new();
        // Streamlining the HTTP GET request and error handling
        let response = client
            .get(&url)
            .header("COOKIE", &crumb_data.cookie)
            .header("Crumb", &crumb_data.crumb)
            .send()
            .await
            .map_err(|err| YahooError::FetchFailed(err.to_string()))?;

        // Get the response text
        let response_text = response
            .text()
            .await
            .map_err(|err| YahooError::FetchFailed(err.to_string()))?;

        // Print the raw JSON response
        println!("Raw JSON Response: {}", response_text);

        // Deserialize the JSON response into your struct
        let deserialized: YahooResult = serde_json::from_str(&response_text).map_err(|err| {
            println!("JSON Deserialization Error: {}", err);
            YahooError::FetchFailed(err.to_string())
        })?;

        Ok(deserialized)

        // println!("***** response: {:?}", response);
        // response.json::<YahooResult>().await.map_err(|err| {
        //     println!("JSON Deserialization Error: {}", err);
        //     YahooError::FetchFailed(err.to_string())
        // })
    }

    fn parse_asset_class(&self, quote_type: &str, short_name: &str) -> (AssetClass, AssetSubClass) {
        let quote_type = quote_type.to_lowercase();
        let short_name = short_name.to_lowercase();

        match quote_type.as_str() {
            "cryptocurrency" => (AssetClass::Cryptocurrency, AssetSubClass::Cryptocurrency),
            "equity" => (AssetClass::Equity, AssetSubClass::Stock),
            "etf" => (AssetClass::Equity, AssetSubClass::Etf),
            "future" => {
                let asset_sub_class = if short_name.starts_with("gold")
                    || short_name.starts_with("palladium")
                    || short_name.starts_with("platinum")
                    || short_name.starts_with("silver")
                {
                    AssetSubClass::PreciousMetal
                } else {
                    AssetSubClass::Commodity
                };
                (AssetClass::Commodity, asset_sub_class)
            }
            "mutualfund" => (AssetClass::Equity, AssetSubClass::MutualFund),
            _ => (AssetClass::Alternative, AssetSubClass::Alternative),
        }
    }

    fn format_name(
        &self,
        long_name: Option<&str>,
        quote_type: &str,
        short_name: Option<&str>,
        symbol: &str,
    ) -> String {
        let mut name = long_name.unwrap_or("").to_string();

        if !name.is_empty() {
            let replacements = [
                ("&amp;", "&"),
                ("Amundi Index Solutions - ", ""),
                ("iShares ETF (CH) - ", ""),
                ("iShares III Public Limited Company - ", ""),
                ("iShares V PLC - ", ""),
                ("iShares VI Public Limited Company - ", ""),
                ("iShares VII PLC - ", ""),
                ("Multi Units Luxembourg - ", ""),
                ("VanEck ETFs N.V. - ", ""),
                ("Vaneck Vectors Ucits Etfs Plc - ", ""),
                ("Vanguard Funds Public Limited Company - ", ""),
                ("Vanguard Index Funds - ", ""),
                ("Xtrackers (IE) Plc - ", ""),
            ];

            for (from, to) in replacements.iter() {
                name = name.replace(from, to);
            }
        }

        if quote_type == "FUTURE" && short_name.is_some() {
            name = short_name.unwrap()[..short_name.unwrap().len() - 7].to_string();
        }

        if name.is_empty() {
            return short_name.unwrap_or(symbol).to_string();
        }

        name
    }

    fn parse_sector(&self, a_string: &str) -> String {
        match a_string {
            "basic_materials" => "Basic Materials".to_string(),
            "communication_services" => "Communication Services".to_string(),
            "consumer_cyclical" => "Consumer Cyclical".to_string(),
            "consumer_defensive" => "Consumer Staples".to_string(),
            "energy" => "Energy".to_string(),
            "financial_services" => "Financial Services".to_string(),
            "healthcare" => "Healthcare".to_string(),
            "industrials" => "Industrials".to_string(),
            "realestate" => "Real Estate".to_string(),
            "technology" => "Technology".to_string(),
            "utilities" => "Utilities".to_string(),
            _ => "UNKNOWN".to_string(),
        }
    }
}
