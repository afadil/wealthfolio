use std::{sync::RwLock, time::SystemTime};

use crate::models::{Asset, CrumbData, NewAsset, QuoteSummary};
use lazy_static::lazy_static;
use reqwest::{header, Client};
use serde_json::json;
use thiserror::Error;
use yahoo::{YQuoteItem, YahooError};
use yahoo_finance_api as yahoo;

use super::models::{AssetClass, AssetSubClass, PriceDetail, YahooResult};

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

lazy_static! {
    pub static ref YAHOO_CRUMB: RwLock<Option<CrumbData>> = RwLock::default();
}

pub struct YahooProvider {
    provider: yahoo::YahooConnector,
}

impl YahooProvider {
    pub fn new() -> Result<Self, yahoo::YahooError> {
        let provider = yahoo::YahooConnector::new()?;
        Ok(YahooProvider { provider })
    }

    // pub async fn set_crumb() -> Result<(), yahoo::YahooError> {
    pub async fn set_crumb(&self) -> Result<(), yahoo::YahooError> {
        let client = Client::new();

        // Make the first call to extract the Crumb cookie
        let response = client
            .get("https://fc.yahoo.com")
            .send()
            .await
            .map_err(|e| YahooError::FetchFailed(e.to_string()))?;

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
            .await
            .map_err(|e| YahooError::FetchFailed(e.to_string()))?;

        let crumb = request
            .text()
            .await
            .map_err(|e| YahooError::FetchFailed(e.to_string()))?;

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
        // Handle the cash asset case
        if let Some(currency) = symbol.strip_prefix("$CASH-") {
            return Ok(self.create_cash_asset(symbol, currency));
        }

        let response = self.fetch_asset_profile(symbol).await?;

        let asset_profile =
            response
                .quote_summary
                .result
                .first()
                .ok_or(YahooError::FetchFailed(
                    "No asset profile found".to_string(),
                ))?;

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

        let mut sectors = None;
        let mut countries = None;
        match asset_sub_class {
            AssetSubClass::MutualFund | AssetSubClass::Etf => {
                let mut sector_data = Vec::new();
                if let Some(top_holdings) = &asset_profile.top_holdings {
                    for sector_weighting in &top_holdings.sector_weightings {
                        for (sector, weight_value) in &sector_weighting.other {
                            if let Ok(weight) =
                                serde_json::from_value::<PriceDetail>(weight_value.clone())
                            {
                                sector_data.push(json!({ "weight": weight.raw, "name": self.parse_sector(sector) }));
                            }
                        }
                    }
                }
                sectors = serde_json::to_string(&sector_data).ok();
            }
            AssetSubClass::Stock => {
                if let Some(summary_profile) = &asset_profile.summary_profile {
                    let country = &summary_profile.country;
                    countries =
                        serde_json::to_string(&[json!({ "code": country, "weight": 1 })]).ok();

                    let sector = &summary_profile.sector;
                    sectors = serde_json::to_string(&[json!({ "name": sector, "weight": 1 })]).ok();
                }
            }
            // Handle other asset sub-classes
            _ => { /* ... */ }
        }

        let new_asset = NewAsset {
            id: symbol.to_string(),
            isin: None,
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
            comment: asset_profile
                .summary_profile
                .as_ref()
                .and_then(|sp| sp.long_business_summary.clone().or(sp.description.clone())),

            countries,
            sectors,
            categories: None,
            classes: None,
            attributes: None,
            url: asset_profile
                .summary_profile
                .as_ref()
                .and_then(|sp| sp.website.clone()),
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
        if symbol.starts_with("$CASH-") {
            return Ok(vec![]);
        }

        // Convert SystemTime to OffsetDateTime as required by get_quote_history
        let start_offset = start.into();
        let end_offset = end.into();

        let response = self
            .provider
            .get_quote_history(symbol, start_offset, end_offset)
            .await?;

        response.quotes()
    }

    pub async fn fetch_asset_profile(
        &self,
        symbol: &str,
    ) -> Result<YahooResult, yahoo::YahooError> {
        let crumb_data = YAHOO_CRUMB.read().unwrap();

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
            .header(
                "user-agent",
                "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.2; .NET CLR 1.0.3705;)",
            )
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
