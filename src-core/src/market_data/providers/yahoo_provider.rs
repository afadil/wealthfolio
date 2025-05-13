use std::{sync::RwLock, time::SystemTime};

use super::models::{AssetClass, AssetProfile, AssetSubClass, PriceDetail, YahooResult};
use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::{AssetProfiler, MarketDataProvider, Quote as ModelQuote, QuoteSummary};
use rust_decimal::Decimal;
use chrono::{DateTime, Utc, TimeZone};
use lazy_static::lazy_static;
use log::{debug, warn};
use num_traits::FromPrimitive;
use reqwest::{header, Client};
use serde_json::json;
use yahoo::{YQuoteItem, YahooError};
use yahoo_finance_api as yahoo;

#[derive(Debug, Clone)]
pub struct CrumbData {
    pub cookie: String,
    pub crumb: String,
}

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

impl From<&YQuoteItem> for AssetProfile {
    fn from(item: &YQuoteItem) -> Self {
        AssetProfile {
            id: Some(item.symbol.clone()),
            isin: None, // TODO: Implement isin
            name: Some(item.long_name.clone()),
            asset_type: Some(item.quote_type.clone()),
            symbol: item.symbol.clone(),
            data_source: DataSource::Yahoo.as_str().to_string(),
            ..Default::default()
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

    pub async fn get_symbol_profile(
        &self,
        symbol: &str,
    ) -> Result<AssetProfile, yahoo::YahooError> {
        match self.get_symbol_full_profile(symbol).await {
            Ok(asset) => Ok(asset),
            Err(err) => {
                debug!(
                    "Failed to get full profile for {}: {}, trying short profile",
                    symbol, err
                );
                // If full profile fails, try to get short profile
                match self.get_symbol_short_profile(symbol).await? {
                    Some(asset) => Ok(asset),
                    None => Err(yahoo::YahooError::EmptyDataSet),
                }
            }
        }
    }

    pub async fn get_latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, yahoo::YahooError> {
        match self.provider.get_latest_quotes(symbol, "1d").await {
            Ok(response) => {
                let yahoo_quote = response
                    .last_quote()
                    .map_err(|_| yahoo::YahooError::EmptyDataSet)?;
                let model_quote = self.yahoo_quote_to_model_quote(
                    symbol.to_string(),
                    yahoo_quote,
                    fallback_currency.clone(),
                );
                Ok(model_quote)
            }
            Err(_) => {
                // If the primary method fails, try the backup method
                self.get_latest_quote_backup(symbol).await
            }
        }
    }

    /// Fetch historic quotes between start and end date
    pub async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
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
            .map(|q| {
                self.yahoo_quote_to_model_quote(symbol.to_string(), q, fallback_currency.clone())
            })
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
        let now_utc: DateTime<Utc> = Utc::now();

        Ok(ModelQuote {
            id: format!("{}_{}", now_utc.format("%Y%m%d"), symbol),
            created_at: now_utc,
            data_source: DataSource::Yahoo,
            timestamp: now_utc,
            symbol: symbol.to_string(),
            open: Decimal::from_f64_retain(
                price
                    .regular_market_open
                    .as_ref()
                    .and_then(|p| p.raw)
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            high: Decimal::from_f64_retain(
                price
                    .regular_market_day_high
                    .as_ref()
                    .and_then(|p| p.raw)
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            low: Decimal::from_f64_retain(
                price
                    .regular_market_day_low
                    .as_ref()
                    .and_then(|p| p.raw)
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            volume: Decimal::from_f64_retain(
                price
                    .regular_market_volume
                    .as_ref()
                    .and_then(|p| p.raw)
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            close: Decimal::from_f64_retain(
                regular_market_price
                    .raw
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            adjclose: Decimal::from_f64_retain(
                regular_market_price
                    .raw
                    .unwrap_or(0.0),
            )
            .unwrap_or_default(),
            currency: price.currency.clone().unwrap_or_else(|| "USD".to_string()),
        })
    }

    fn yahoo_quote_to_model_quote(
        &self,
        symbol: String,
        yahoo_quote: yahoo::Quote,
        fallback_currency: String,
    ) -> ModelQuote {
        let quote_timestamp: DateTime<Utc> = Utc.timestamp_opt(yahoo_quote.timestamp as i64, 0).single().unwrap_or_default();
        let now_utc: DateTime<Utc> = Utc::now();

        ModelQuote {
            id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
            created_at: now_utc,
            data_source: DataSource::Yahoo,
            timestamp: quote_timestamp,
            symbol,
            open: Decimal::from_f64_retain(yahoo_quote.open).unwrap_or_default(),
            high: Decimal::from_f64_retain(yahoo_quote.high).unwrap_or_default(),
            low: Decimal::from_f64_retain(yahoo_quote.low).unwrap_or_default(),
            volume: Decimal::from_u64(yahoo_quote.volume).unwrap_or_default(),
            close: Decimal::from_f64_retain(yahoo_quote.close).unwrap_or_default(),
            adjclose: Decimal::from_f64_retain(yahoo_quote.adjclose).unwrap_or_default(),
            currency: fallback_currency,
        }
    }

    async fn get_symbol_short_profile(
        &self,
        symbol: &str,
    ) -> Result<Option<AssetProfile>, yahoo::YahooError> {
        let search_results = self.search_ticker(symbol).await?;

        for result in search_results {
            if result.symbol == symbol {
                return Ok(Some(AssetProfile {
                    id: Some(result.symbol.clone()),
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
                    data_source: DataSource::Yahoo.as_str().to_string(),
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

    async fn get_symbol_full_profile(
        &self,
        symbol: &str,
    ) -> Result<AssetProfile, yahoo::YahooError> {
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
                                sector_data.push(json!({"name": self.format_sector(sector), "weight": weight.raw }));
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
                        serde_json::to_string(&[json!({ "name": country, "weight": 1 })]).ok();

                    if let Some(sector) = &summary_profile.sector {
                        sectors = serde_json::to_string(&[
                            json!({ "name": self.format_sector(sector), "weight": 1 }),
                        ])
                        .ok();
                    }
                }
            }
            // Handle other asset sub-classes
            _ => { /* ... */ }
        }

        let new_asset = AssetProfile {
            id: Some(symbol.to_string()),
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
            data_source: DataSource::Yahoo.as_str().to_string(),
            asset_class: Some(asset_class.to_string()), // Convert enum to String
            asset_sub_class: Some(asset_sub_class.to_string()), // Convert enum to String
            notes: asset_profile
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

    async fn fetch_asset_profile(&self, symbol: &str) -> Result<YahooResult, yahoo::YahooError> {
        let crumb_data = {
            let guard = YAHOO_CRUMB.read().unwrap();
            guard
                .as_ref()
                .ok_or_else(|| {
                    YahooError::FetchFailed("Yahoo authentication crumb not initialized".into())
                })?
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
        let deserialized: YahooResult = serde_json::from_str(&response_text)
            .map_err(|err| YahooError::FetchFailed(err.to_string()))?;

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

    /// Converts an underscore-separated sector string into a properly capitalized format
    ///
    /// # Arguments
    /// * `sector` - The sector string in snake_case format (e.g., "basic_materials")
    ///
    /// # Returns
    /// A String with each word capitalized and separated by spaces (e.g., "Basic Materials")
    ///
    /// # Examples
    /// ```
    /// let sector = provider.parse_sector("consumer_defensive");
    /// assert_eq!(sector, "Consumer Defensive");
    /// ```
    fn format_sector(&self, sector: &str) -> String {
        sector
            .split('_')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().chain(chars).collect(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        // If start time is after or equal to end time, no data needs fetching.
        if start >= end {
            warn!(
                "Start time ({:?}) is after or equal to end time ({:?}). Skipping fetch.",
                DateTime::<Utc>::from(start),
                DateTime::<Utc>::from(end)
            );
            return Ok((Vec::new(), Vec::new()));
        }

        if symbols_with_currencies.is_empty() {
            return Ok((Vec::new(), Vec::new()));
        }

        // Use a more efficient batching approach
        const BATCH_SIZE: usize = 10; // Adjust based on API limits

        let mut all_quotes = Vec::new();
        let mut errors: Vec<(String, String)> = Vec::new();

        for chunk in symbols_with_currencies.chunks(BATCH_SIZE) {
            let futures: Vec<_> = chunk
                .iter()
                .map(|(symbol, currency)| {
                    let symbol_clone = symbol.clone();
                    let currency_clone = currency.clone();
                    async move {
                        match self
                            .get_historical_quotes(
                                &symbol_clone,
                                start,
                                end,
                                currency_clone.clone(),
                            )
                            .await
                        {
                            Ok(quotes) => Ok((symbol_clone, quotes)),
                            Err(e) => Err((symbol_clone, e.to_string())),
                        }
                    }
                })
                .collect();

            let results = futures::future::join_all(futures).await;

            for result in results {
                match result {
                    Ok((_, quotes)) => all_quotes.extend(quotes),
                    Err((symbol, error)) => errors.push((symbol, error)),
                }
            }
        }

        // Log errors but don't fail the entire operation
        if !errors.is_empty() {
            log::warn!(
                "Failed to fetch history for {} symbols: {:?}",
                errors.len(),
                errors
            );
        }

        Ok((all_quotes, errors))
    }
}

#[async_trait::async_trait]
impl AssetProfiler for YahooProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        self.get_symbol_profile(symbol)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }
}

#[async_trait::async_trait]
impl MarketDataProvider for YahooProvider {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        self.search_ticker(query)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }

    async fn get_latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        self.get_latest_quote(symbol, fallback_currency)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        self.get_historical_quotes(symbol, start, end, fallback_currency)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        self.get_historical_quotes_bulk(symbols_with_currencies, start, end)
            .await
    }
}
