use async_trait::async_trait;
use reqwest::Client;
use std::time::SystemTime;
use crate::market_data::{MarketDataError, Quote as ModelQuote};
use crate::market_data::providers::market_data_provider::MarketDataProvider;
use chrono::{DateTime, Utc, TimeZone};
use rust_decimal::Decimal;
use serde_json;
use crate::market_data::market_data_model::DataSource;
use futures;

const BASE_URL: &str = "https://api.marketdata.app/v1";

pub struct MarketDataAppProvider {
    client: Client,
    token: String,
}

impl MarketDataAppProvider {
    pub async fn new(token: String) -> Result<Self, MarketDataError> {
        let client = Client::new();
        Ok(MarketDataAppProvider { client, token })
    }

    async fn fetch_data(&self, url: &str) -> Result<String, MarketDataError> {
        let response = self.client.get(url)
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;
        let text = response.text().await.map_err(|e| MarketDataError::ProviderError(e.to_string()))?;
        Ok(text)
    }
}

#[async_trait]
impl MarketDataProvider for MarketDataAppProvider {
    fn name(&self) -> &'static str {
        "MARKETDATA_APP"
    }

    fn priority(&self) -> u8 {
        2
    }

    async fn get_latest_quote(&self, symbol: &str, fallback_currency: String) -> Result<ModelQuote, MarketDataError> {
        let url = format!("{}/stocks/prices/{}/", BASE_URL, symbol);
        let response_text = self.fetch_data(&url).await?;
        let response_json: serde_json::Value = serde_json::from_str(&response_text).map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        if response_json["s"] == "ok" {
            let mid_price = response_json["mid"].as_array().and_then(|arr| arr.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let timestamp = response_json["updated"].as_array().and_then(|arr| arr.get(0)).and_then(|v| v.as_i64()).unwrap_or(0);
            let quote_timestamp: DateTime<Utc> = Utc.timestamp_opt(timestamp, 0).single().unwrap_or_default();

            let model_quote = ModelQuote {
                id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
                created_at: Utc::now(),
                data_source: DataSource::MarketDataApp,
                timestamp: quote_timestamp,
                symbol: symbol.to_string(),
                open: Decimal::from_f64_retain(mid_price).unwrap_or_default(),
                high: Decimal::from_f64_retain(mid_price).unwrap_or_default(),
                low: Decimal::from_f64_retain(mid_price).unwrap_or_default(),
                volume: Decimal::from_f64_retain(0.0).unwrap_or_default(),
                close: Decimal::from_f64_retain(mid_price).unwrap_or_default(),
                adjclose: Decimal::from_f64_retain(mid_price).unwrap_or_default(),
                currency: fallback_currency,
            };
            Ok(model_quote)
        } else {
            Err(MarketDataError::ProviderError("No data found".to_string()))
        }
    }

    async fn get_historical_quotes(&self, symbol: &str, start: SystemTime, end: SystemTime, fallback_currency: String) -> Result<Vec<ModelQuote>, MarketDataError> {
        let start_date = DateTime::<Utc>::from(start).format("%Y-%m-%d").to_string();
        let end_date = DateTime::<Utc>::from(end).format("%Y-%m-%d").to_string();
        let url = format!(
            "{}/stocks/candles/D/{symbol}?from={start_date}&to={end_date}",
            BASE_URL,
            symbol = symbol,
            start_date = start_date,
            end_date = end_date
        );

        let response_text = self.fetch_data(&url).await?;
        let response_json: serde_json::Value = serde_json::from_str(&response_text).map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        if response_json["s"] == "ok" {
            let quotes = response_json["c"].as_array().unwrap_or(&vec![])
                .iter()
                .enumerate()
                .map(|(i, close)| {
                    let open = response_json["o"][i].as_f64().unwrap_or(0.0);
                    let high = response_json["h"][i].as_f64().unwrap_or(0.0);
                    let low = response_json["l"][i].as_f64().unwrap_or(0.0);
                    let volume = response_json["v"][i].as_f64().unwrap_or(0.0);
                    let timestamp = response_json["t"][i].as_i64().unwrap_or(0);
                    let quote_timestamp: DateTime<Utc> = Utc.timestamp_opt(timestamp, 0).single().unwrap_or_default();

                    ModelQuote {
                        id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol),
                        created_at: Utc::now(),
                        data_source: DataSource::MarketDataApp,
                        timestamp: quote_timestamp,
                        symbol: symbol.to_string(),
                        open: Decimal::from_f64_retain(open).unwrap_or_default(),
                        high: Decimal::from_f64_retain(high).unwrap_or_default(),
                        low: Decimal::from_f64_retain(low).unwrap_or_default(),
                        volume: Decimal::from_f64_retain(volume).unwrap_or_default(),
                        close: Decimal::from_f64_retain(close.as_f64().unwrap_or(0.0)).unwrap_or_default(),
                        adjclose: Decimal::from_f64_retain(close.as_f64().unwrap_or(0.0)).unwrap_or_default(),
                        currency: fallback_currency.clone(),
                    }
                })
                .collect();
            log::info!("NEW Fetched quotes for {}",  symbol);
            Ok(quotes)
        } else {
            Err(MarketDataError::ProviderError("No data found".to_string()))
        }
    }

    async fn get_historical_quotes_bulk(&self, symbols_with_currencies: &[(String, String)], start: SystemTime, end: SystemTime) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        const BATCH_SIZE: usize = 10;
        let mut all_quotes = Vec::new();
        let mut errors = Vec::new();

        for chunk in symbols_with_currencies.chunks(BATCH_SIZE) {
            let futures: Vec<_> = chunk.iter().map(|(symbol, currency)| {
                let symbol_clone = symbol.clone();
                let currency_clone = currency.clone();
                async move {
                    match self.get_historical_quotes(&symbol_clone, start, end, currency_clone).await {
                        Ok(quotes) => Ok((symbol_clone, quotes)),
                        Err(e) => Err((symbol_clone, e.to_string())),
                    }
                }
            }).collect();

            let results = futures::future::join_all(futures).await;

            for result in results {
                match result {
                    Ok((_, quotes)) => all_quotes.extend(quotes),
                    Err((symbol, error)) => errors.push((symbol, error)),
                }
            }
        }

        if !errors.is_empty() {
            log::warn!("Failed to fetch history for {} symbols: {:?}", errors.len(), errors);
        }

        log::info!("NEW Fetched quotes for {}",  all_quotes.len());
        Ok((all_quotes, errors))
    }
}