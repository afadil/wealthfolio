//! VCI (Vietcap) API client for stocks and indices

use chrono::{DateTime, NaiveDate, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Serialize;
use std::time::Duration;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::models::stock::{VciInterval, VciOhlcResponse, VciQuote, VciSymbol};
use crate::vn_market::utils::headers::vci_headers;

const VCI_BASE_URL: &str = "https://trading.vietcap.com.vn/api";
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// Price multiplier - VCI returns prices in 1000 VND units
const PRICE_MULTIPLIER: f64 = 1000.0;

/// VCI API client for fetching stock and index data
#[derive(Clone)]
pub struct VciClient {
    client: Client,
}

/// Request payload for OHLC chart data
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OhlcRequest {
    time_frame: String,
    symbols: Vec<String>,
    to: i64,
    count_back: i32,
}

impl VciClient {
    /// Create a new VCI client
    pub fn new() -> Self {
        let client = Client::builder()
            .default_headers(vci_headers())
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// Get all listed symbols from VCI
    pub async fn get_all_symbols(&self) -> Result<Vec<VciSymbol>, VnMarketError> {
        let url = format!("{}/price/symbols/getAll", VCI_BASE_URL);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "VCI symbols request failed: {}",
                response.status()
            )));
        }

        let symbols: Vec<VciSymbol> = response.json().await?;
        Ok(symbols)
    }

    /// Get historical OHLC data for a symbol
    pub async fn get_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VciQuote>, VnMarketError> {
        self.get_history_with_interval(symbol, start, end, VciInterval::OneDay)
            .await
    }

    /// Get historical OHLC data with custom interval
    pub async fn get_history_with_interval(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
        interval: VciInterval,
    ) -> Result<Vec<VciQuote>, VnMarketError> {
        let url = format!("{}/chart/OHLCChart/gap-chart", VCI_BASE_URL);

        // Calculate count_back based on interval
        let days = (end - start).num_days() + 1;
        let count_back = match interval {
            VciInterval::OneDay => days as i32,
            VciInterval::OneHour => (days * 7) as i32, // ~7 trading hours per day
            VciInterval::OneMinute => (days * 390) as i32, // 390 minutes per trading day
        };

        // End timestamp (end of day)
        let end_timestamp = end
            .and_hms_opt(23, 59, 59)
            .unwrap()
            .and_utc()
            .timestamp();

        let payload = OhlcRequest {
            time_frame: interval.as_api_value().to_string(),
            symbols: vec![symbol.to_string()],
            to: end_timestamp,
            count_back,
        };

        let response = self.client.post(&url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "VCI history request failed for {}: {}",
                symbol,
                response.status()
            )));
        }

        let data: Vec<VciOhlcResponse> = response.json().await?;

        if data.is_empty() || data[0].is_empty() {
            return Ok(vec![]);
        }

        let quotes = self.transform_ohlc_response(symbol, &data[0], start, end);
        Ok(quotes)
    }

    /// Transform VCI OHLC array response to VciQuote list
    fn transform_ohlc_response(
        &self,
        symbol: &str,
        data: &VciOhlcResponse,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Vec<VciQuote> {
        data.t
            .iter()
            .enumerate()
            .filter_map(|(i, &ts)| {
                let timestamp = DateTime::from_timestamp(ts, 0)?;
                let date = timestamp.date_naive();

                // Filter to requested date range
                if date < start || date > end {
                    return None;
                }

                Some(VciQuote {
                    symbol: symbol.to_string(),
                    timestamp,
                    open: Decimal::from_f64_retain(data.o[i] * PRICE_MULTIPLIER)
                        .unwrap_or_default(),
                    high: Decimal::from_f64_retain(data.h[i] * PRICE_MULTIPLIER)
                        .unwrap_or_default(),
                    low: Decimal::from_f64_retain(data.l[i] * PRICE_MULTIPLIER)
                        .unwrap_or_default(),
                    close: Decimal::from_f64_retain(data.c[i] * PRICE_MULTIPLIER)
                        .unwrap_or_default(),
                    volume: data.v[i],
                })
            })
            .collect()
    }

    /// Get latest quote for a symbol
    pub async fn get_latest_quote(&self, symbol: &str) -> Result<Option<VciQuote>, VnMarketError> {
        let today = Utc::now().date_naive();
        // Fetch last 7 days to handle weekends/holidays
        let start = today - chrono::Duration::days(7);

        let quotes = self.get_history(symbol, start, today).await?;
        Ok(quotes.into_iter().last())
    }
}

impl Default for VciClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_all_symbols() {
        let client = VciClient::new();
        let symbols = client.get_all_symbols().await.unwrap();

        assert!(!symbols.is_empty());
        assert!(symbols.iter().any(|s| s.symbol == "VNM"));
    }

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_stock_history() {
        let client = VciClient::new();
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2024, 1, 31).unwrap();

        let quotes = client.get_history("VNM", start, end).await.unwrap();

        assert!(!quotes.is_empty());
        assert!(quotes[0].close > Decimal::ZERO);
        // Prices should be in VND (thousands range for VNM)
        assert!(quotes[0].close > Decimal::new(10000, 0));
    }
}
