use async_trait::async_trait;
use reqwest::Client;
use std::time::SystemTime;
use crate::market_data::{AssetProfiler, MarketDataError, Quote as ModelQuote, QuoteSummary};
use crate::market_data::providers::market_data_provider::MarketDataProvider;
use chrono::{DateTime, Utc, TimeZone};
use rust_decimal::Decimal;
use serde_json;
use crate::market_data::market_data_model::{AssetProfile, DataSource};
use futures::future::join_all;
use log::warn;
use reqwest::StatusCode;

// TODO: AssetProfiler trait implementation
// Symbol Search Endpoint: No dedicated symbol search endpoint was found in the documentation review (https://www.marketdata.app/docs/api).
// Asset Profile Endpoint: GET /v1/stocks/quotes/{symbol}/ could be used (provides last price, volume, bid/ask).
// It lacks descriptive name, exchange, ISIN, etc.
// Example: https://www.marketdata.app/docs/api/stocks/quotes for response structure.

const BASE_URL: &str = "https://api.marketdata.app/v1";

pub struct MarketDataAppProvider {
    client: Client,
    token: String,
}

impl MarketDataAppProvider {
    pub fn new(token: String) -> Result<Self, MarketDataError> { // Changed to sync as it doesn't do async work
        let client = Client::new();
        Ok(MarketDataAppProvider { client, token })
    }

    async fn fetch_data(&self, url: &str) -> Result<String, MarketDataError> {
        let response = self.client.get(url)
            .header("Authorization", format!("Bearer {}", self.token))
            // .header("Accept", "application/json") // Good practice, though often not strictly needed
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError(format!("Request failed: {}", e)))?;

        let status = response.status();
        let response_text = response.text().await.map_err(|e| MarketDataError::ProviderError(format!("Failed to read response text: {}", e)))?;

        if status != StatusCode::OK {
            // Try to parse error message from response body if available
            if let Ok(json_body) = serde_json::from_str::<serde_json::Value>(&response_text) {
                if let Some(api_err_msg) = json_body.get("errmsg").and_then(|v| v.as_str()) {
                    return Err(MarketDataError::ProviderError(format!(
                        "API error (status {}): {}",
                        status, api_err_msg
                    )));
                }
            }
            return Err(MarketDataError::ProviderError(format!(
                "API request failed with status {}: {}",
                status, response_text // Fallback to full text if errmsg not found
            )));
        }
        Ok(response_text)
    }
}

#[async_trait]
impl MarketDataProvider for MarketDataAppProvider {
    fn name(&self) -> &'static str {
        "MarketDataApp"
    }

    fn priority(&self) -> u8 {
        2 // Higher number means lower priority, assuming 1 is highest
    }

    async fn get_latest_quote(&self, symbol: &str, fallback_currency: String) -> Result<ModelQuote, MarketDataError> {
        // Using /stocks/quotes/{symbol}/ as per documentation review for latest price, volume etc.
        // The original code used /stocks/prices/{symbol}/, which might be different.
        // Assuming /stocks/quotes/{symbol}/ is the intended or more suitable endpoint.
        let url = format!("{}/stocks/quotes/{}/", BASE_URL, symbol);
        let response_text = self.fetch_data(&url).await?;
        
        let response_json: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| MarketDataError::DeserializationError(format!("Failed to parse latest quote JSON: {}. Response: {}", e, response_text)))?;

        if response_json.get("s").and_then(|s| s.as_str()) == Some("ok") {
            // Response fields are arrays, take the first element.
            let last_price = response_json.get("last").and_then(|v| v.as_array()?.get(0)?.as_f64()).unwrap_or(0.0);
            let volume = response_json.get("volume").and_then(|v| v.as_array()?.get(0)?.as_f64()).unwrap_or(0.0);
            let timestamp_unix = response_json.get("updated").and_then(|v| v.as_array()?.get(0)?.as_i64()).unwrap_or(0);
            
            let quote_timestamp: DateTime<Utc> = Utc.timestamp_opt(timestamp_unix, 0).single().unwrap_or_default();

            // The /stocks/quotes/ endpoint provides 'last', 'ask', 'bid', 'mid', 'volume', 'updated'.
            // It does not provide explicit open, high, low for the day's quote.
            // Using 'last' as a stand-in for ohlc as per requirement.
            let model_quote = ModelQuote {
                id: format!("{}_{}", quote_timestamp.format("%Y%m%d%H%M%S"), symbol), // More precise ID
                created_at: Utc::now(),
                data_source: DataSource::MarketDataApp,
                timestamp: quote_timestamp,
                symbol: symbol.to_string(),
                open: Decimal::from_f64_retain(last_price).unwrap_or_default(),
                high: Decimal::from_f64_retain(last_price).unwrap_or_default(),
                low: Decimal::from_f64_retain(last_price).unwrap_or_default(),
                volume: Decimal::from_f64_retain(volume).unwrap_or_default(),
                close: Decimal::from_f64_retain(last_price).unwrap_or_default(),
                adjclose: Decimal::from_f64_retain(last_price).unwrap_or_default(),
                currency: fallback_currency, // API does not specify currency for this endpoint
            };
            Ok(model_quote)
        } else {
            let error_message = response_json.get("errmsg").and_then(|v| v.as_str()).unwrap_or("No data or unknown error from MarketData.app");
            Err(MarketDataError::ProviderError(format!("Failed to get latest quote for {}: {}", symbol, error_message)))
        }
    }

    async fn get_historical_quotes(&self, symbol: &str, start: SystemTime, end: SystemTime, fallback_currency: String) -> Result<Vec<ModelQuote>, MarketDataError> {
        let start_date = DateTime::<Utc>::from(start).format("%Y-%m-%d").to_string();
        let end_date = DateTime::<Utc>::from(end).format("%Y-%m-%d").to_string();
        
        // Endpoint for historical candles: /v1/stocks/candles/{resolution}/{symbol}
        // Using 'D' for daily resolution.
        let url = format!(
            "{}/stocks/candles/D/{}?from={}&to={}", // Removed trailing slash, added {} for symbol
            BASE_URL,
            symbol, // symbol directly
            start_date,
            end_date
        );

        let response_text = self.fetch_data(&url).await?;
        let response_json: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| MarketDataError::DeserializationError(format!("Failed to parse historical quotes JSON: {}. Response: {}", e, response_text)))?;

        if response_json.get("s").and_then(|s| s.as_str()) == Some("ok") {
            // Expected fields: c, h, l, o, t, v (all arrays)
            let closes = response_json.get("c").and_then(|v| v.as_array());
            let opens = response_json.get("o").and_then(|v| v.as_array());
            let highs = response_json.get("h").and_then(|v| v.as_array());
            let lows = response_json.get("l").and_then(|v| v.as_array());
            let volumes = response_json.get("v").and_then(|v| v.as_array());
            let timestamps = response_json.get("t").and_then(|v| v.as_array());

            if !([closes, opens, highs, lows, volumes, timestamps].iter().all(|&opt_arr| opt_arr.is_some())) {
                 return Err(MarketDataError::ProviderError(format!("Historical data missing one or more fields for {}", symbol)));
            }
            
            let closes = closes.unwrap(); // Safe due to check above

            let mut quotes = Vec::new();
            for i in 0..closes.len() {
                // Safe access to other arrays assuming they are of the same length as 'closes'
                // which is typical for candle data. Add checks if necessary.
                let open = opens.unwrap().get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
                let high = highs.unwrap().get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
                let low = lows.unwrap().get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
                let volume = volumes.unwrap().get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
                let close_price = closes.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
                let timestamp_unix = timestamps.unwrap().get(i).and_then(|v| v.as_i64()).unwrap_or(0);
                
                let quote_timestamp: DateTime<Utc> = Utc.timestamp_opt(timestamp_unix, 0).single().unwrap_or_default();

                quotes.push(ModelQuote {
                    id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), symbol), // Daily ID
                    created_at: Utc::now(),
                    data_source: DataSource::MarketDataApp,
                    timestamp: quote_timestamp,
                    symbol: symbol.to_string(),
                    open: Decimal::from_f64_retain(open).unwrap_or_default(),
                    high: Decimal::from_f64_retain(high).unwrap_or_default(),
                    low: Decimal::from_f64_retain(low).unwrap_or_default(),
                    volume: Decimal::from_f64_retain(volume).unwrap_or_default(),
                    close: Decimal::from_f64_retain(close_price).unwrap_or_default(),
                    adjclose: Decimal::from_f64_retain(close_price).unwrap_or_default(), // MarketData.app candles are typically already adjusted
                    currency: fallback_currency.clone(),
                });
            }
            Ok(quotes)
        } else {
            let error_message = response_json.get("errmsg").and_then(|v| v.as_str()).unwrap_or("No data or unknown error for historical quotes from MarketData.app");
            Err(MarketDataError::ProviderError(format!("Failed to get historical quotes for {}: {}", symbol, error_message)))
        }
    }
    
    // TODO: Review BATCH_SIZE for get_historical_quotes_bulk.
    // MarketData.app rate limits: Free/Trial: 1 req/sec, Paid: 10 req/sec.
    // A BATCH_SIZE of 10 executed concurrently via join_all might exceed 1 req/sec for Free/Trial users.
    // Consider implications or make BATCH_SIZE configurable or dependent on user plan.
    async fn get_historical_quotes_bulk(&self, symbols_with_currencies: &[(String, String)], start: SystemTime, end: SystemTime) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        const BATCH_SIZE: usize = 10; // Current BATCH_SIZE
        let mut all_quotes = Vec::new();
        let mut errors: Vec<(String, String)> = Vec::new(); // Explicit type

        for chunk in symbols_with_currencies.chunks(BATCH_SIZE) {
            let futures_batch: Vec<_> = chunk.iter().map(|(symbol, currency)| { // Renamed to avoid conflict
                let symbol_clone = symbol.clone();
                let currency_clone = currency.clone();
                // Each of these is an async block
                async move {
                    self.get_historical_quotes(&symbol_clone, start, end, currency_clone.clone()).await // Pass currency_clone
                        .map(|quotes| (symbol_clone, quotes)) // Map Ok result
                        .map_err(|e| (symbol_clone, e.to_string())) // Map Err result
                }
            }).collect();

            let results = join_all(futures_batch).await; // Use imported join_all

            for result in results {
                match result {
                    Ok((_symbol, quotes)) => all_quotes.extend(quotes),
                    Err((symbol, error_msg)) => errors.push((symbol, error_msg)),
                }
            }
        }

        if !errors.is_empty() {
            warn!("Failed to fetch history for {} symbols from MarketDataApp: {:?}", errors.len(), errors);
        }

        Ok((all_quotes, errors))
    }
}


// Basic tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_market_data_app_provider_instantiation() {
        let provider = MarketDataAppProvider::new("test_token".to_string());
        assert!(provider.is_ok());
        let provider_instance = provider.unwrap();
        assert_eq!(provider_instance.name(), "MarketDataApp");
        assert_eq!(provider_instance.priority(), 2);
    }

    // TODO: Add more tests, potentially using a mock HTTP client for fetch_data,
    // and testing the parsing logic in get_latest_quote and get_historical_quotes.
    // For example:
    // - Test successful parsing of get_latest_quote with sample JSON.
    // - Test error handling in get_latest_quote (e.g. s != "ok", missing fields).
    // - Test successful parsing of get_historical_quotes.
    // - Test error handling in get_historical_quotes.
    // - Test fetch_data error conditions (network error, non-OK HTTP status).
}