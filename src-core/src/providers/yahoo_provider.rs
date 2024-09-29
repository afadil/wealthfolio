use std::{sync::RwLock, time::SystemTime};

use super::models::{AssetClass, AssetSubClass, PriceDetail, YahooResult};
use crate::models::{CrumbData, NewAsset, Quote as ModelQuote, QuoteSummary};
use crate::providers::market_data_provider::{MarketDataError, MarketDataProvider};
use chrono::{DateTime, Utc};
use lazy_static::lazy_static;
use reqwest::{header, Client};
use serde_json::json;
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
        }
    }
}

impl From<&YQuoteItem> for NewAsset {
    fn from(item: &YQuoteItem) -> Self {
        NewAsset {
            id: item.symbol.clone(),
            isin: None, // TODO: Implement isin
            name: Some(item.long_name.clone()),
            asset_type: Some(item.quote_type.clone()),
            symbol: item.symbol.clone(),
            data_source: "YAHOO".to_string(),
            ..Default::default() // Use default for the rest
        }
    }
}

lazy_static! {
    pub static ref YAHOO_CRUMB: RwLock<Option<CrumbData>> = RwLock::default();
}

pub struct YahooProvider {
    provider: yahoo::YahooConnector,
}

impl YahooProvider {
    pub async fn new() -> Result<Self, yahoo::YahooError> {
        let provider = yahoo::YahooConnector::new()?;
        let yahoo_provider = YahooProvider { provider };

        Ok(yahoo_provider)
    }

    pub async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, yahoo::YahooError> {
        let result = self.provider.search_ticker(query).await?;

        let asset_profiles = result.quotes.iter().map(QuoteSummary::from).collect();

        Ok(asset_profiles)
    }

    pub async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, yahoo::YahooError> {
        // Handle the cash asset case
        if let Some(currency) = symbol.strip_prefix("$CASH-") {
            return Ok(self.build_cash_asset(symbol, currency));
        }
        match self.get_symbol_full_profile(symbol).await {
            Ok(asset) => Ok(asset),
            Err(_) => {
                // If full profile fails, try to get short profile
                match self.get_symbol_short_profile(symbol).await? {
                    Some(asset) => Ok(asset),
                    None => Err(yahoo::YahooError::EmptyDataSet),
                }
            }
        }
    }

    pub async fn get_latest_quote(&self, symbol: &str) -> Result<ModelQuote, yahoo::YahooError> {
        match self.provider.get_latest_quotes(symbol, "1d").await {
            Ok(response) => {
                let yahoo_quote = response
                    .last_quote()
                    .map_err(|_| yahoo::YahooError::EmptyDataSet)?;
                let model_quote = self.yahoo_quote_to_model_quote(symbol.to_string(), yahoo_quote);
                Ok(model_quote)
            }
            Err(_) => {
                // If the primary method fails, try the backup method
                self.get_latest_quote_backup(symbol).await
            }
        }
    }

    /// Fetch historic quotes between start and end date
    pub async fn get_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<ModelQuote>, yahoo::YahooError> {
        if symbol.starts_with("$CASH-") {
            return Ok(vec![]);
        }

        let start_offset = start.into();
        let end_offset = end.into();

        let response = self
            .provider
            .get_quote_history(symbol, start_offset, end_offset)
            .await?;

        let quotes = response
            .quotes()?
            .into_iter()
            .map(|q| self.yahoo_quote_to_model_quote(symbol.to_string(), q))
            .collect();

        Ok(quotes)
    }

    async fn get_latest_quote_backup(&self, symbol: &str) -> Result<ModelQuote, yahoo::YahooError> {
        let asset_profile = self.fetch_asset_profile(symbol).await?;

        let price = asset_profile
            .quote_summary
            .result
            .first()
            .and_then(|result| result.price.as_ref())
            .ok_or(yahoo::YahooError::EmptyDataSet)?;

        let regular_market_price = price
            .regular_market_price
            .as_ref()
            .ok_or(yahoo::YahooError::EmptyDataSet)?;
        let date = chrono::Utc::now().naive_utc();

        Ok(ModelQuote {
            id: format!("{}_{}", date.format("%Y%m%d"), symbol),
            created_at: date,
            data_source: "YAHOO".to_string(),
            date,
            symbol: symbol.to_string(),
            open: price
                .regular_market_open
                .as_ref()
                .and_then(|p| p.raw)
                .unwrap_or(0.0),
            high: price
                .regular_market_day_high
                .as_ref()
                .and_then(|p| p.raw)
                .unwrap_or(0.0),
            low: price
                .regular_market_day_low
                .as_ref()
                .and_then(|p| p.raw)
                .unwrap_or(0.0),
            volume: price
                .regular_market_volume
                .as_ref()
                .and_then(|p| p.raw)
                .unwrap_or(0.0),
            close: regular_market_price.raw.unwrap_or(0.0),
            adjclose: regular_market_price.raw.unwrap_or(0.0),
        })
    }

    fn yahoo_quote_to_model_quote(&self, symbol: String, yahoo_quote: yahoo::Quote) -> ModelQuote {
        let date = DateTime::<Utc>::from_timestamp(yahoo_quote.timestamp as i64, 0)
            .unwrap_or_default()
            .naive_utc();

        ModelQuote {
            id: format!("{}_{}", date.format("%Y%m%d"), symbol),
            created_at: chrono::Utc::now().naive_utc(),
            data_source: "YAHOO".to_string(),
            date,
            symbol: symbol,
            open: yahoo_quote.open,
            high: yahoo_quote.high,
            low: yahoo_quote.low,
            volume: yahoo_quote.volume as f64,
            close: yahoo_quote.close,
            adjclose: yahoo_quote.adjclose,
        }
    }

    async fn get_symbol_short_profile(
        &self,
        symbol: &str,
    ) -> Result<Option<NewAsset>, yahoo::YahooError> {
        let search_results = self.search_ticker(symbol).await?;

        for result in search_results {
            if result.symbol == symbol {
                println!("Found symbol: {:?}", result);
                return Ok(Some(NewAsset {
                    id: result.symbol.clone(),
                    isin: None,
                    name: Some(self.format_name(
                        Some(&result.long_name),
                        &result.quote_type,
                        Some(&result.short_name),
                        &result.symbol,
                    )),
                    asset_type: Some(result.quote_type.clone()),
                    asset_class: Some(result.quote_type),
                    asset_sub_class: Some(result.type_display),
                    symbol: result.symbol.clone(),
                    symbol_mapping: Some(result.symbol),
                    data_source: "YAHOO".to_string(),
                    // exchange: Some(result.exchange),
                    ..Default::default()
                }));
            }
        }

        Ok(None)
    }

    async fn set_crumb(&self) -> Result<(), yahoo::YahooError> {
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

    async fn get_symbol_full_profile(&self, symbol: &str) -> Result<NewAsset, yahoo::YahooError> {
        self.set_crumb().await?;

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
            asset_profile
                .price
                .as_ref()
                .and_then(|p| p.short_name.as_deref())
                .unwrap_or(""),
        );

        let formatted_name = asset_profile.price.as_ref().map_or_else(
            || symbol.to_string(),
            |price| {
                self.format_name(
                    price.long_name.as_deref(),
                    &price.quote_type,
                    price.short_name.as_deref(),
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

    fn build_cash_asset(&self, symbol: &str, currency: &str) -> NewAsset {
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

    async fn fetch_asset_profile(&self, symbol: &str) -> Result<YahooResult, yahoo::YahooError> {
        let crumb_data = {
            let guard = YAHOO_CRUMB.read().unwrap();
            guard
                .as_ref()
                .ok_or_else(|| YahooError::FetchFailed("Crumb data not found".into()))?
                .clone()
        };

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
            _ => a_string.to_string(),
        }
    }
}

#[async_trait::async_trait]
impl MarketDataProvider for YahooProvider {
    async fn get_latest_quote(&self, symbol: &str) -> Result<ModelQuote, MarketDataError> {
        self.get_latest_quote(symbol)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
    async fn get_stock_history(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        self.get_stock_history(symbol, start, end)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        self.search_ticker(query)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
    async fn get_symbol_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError> {
        self.get_symbol_profile(symbol)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
    async fn get_exchange_rate(&self, from: &str, to: &str) -> Result<f64, MarketDataError> {
        self.get_exchange_rate(from, to)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
}
