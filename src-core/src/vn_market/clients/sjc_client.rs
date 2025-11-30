//! SJC Gold API client

use chrono::{Datelike, NaiveDate};
use reqwest::Client;
use std::time::Duration;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::models::gold::{GoldQuote, SjcGoldPrice, SjcResponse};
use crate::vn_market::utils::headers::sjc_headers;

const SJC_URL: &str = "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx";
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// Minimum date for SJC historical data
const MIN_DATE: (i32, u32, u32) = (2016, 1, 2);

/// SJC Gold API client
#[derive(Clone)]
pub struct SjcClient {
    client: Client,
}

impl SjcClient {
    /// Create a new SJC client
    pub fn new() -> Self {
        let client = Client::builder()
            .default_headers(sjc_headers())
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// Get gold price for a specific date
    ///
    /// # Arguments
    /// * `date` - Date to fetch (must be >= 2016-01-02)
    pub async fn get_gold_price(&self, date: NaiveDate) -> Result<SjcGoldPrice, VnMarketError> {
        // Validate date
        let min_date = NaiveDate::from_ymd_opt(MIN_DATE.0, MIN_DATE.1, MIN_DATE.2).unwrap();
        if date < min_date {
            return Err(VnMarketError::InvalidDate(format!(
                "SJC data is only available from {}",
                min_date
            )));
        }

        // Format date as DD/MM/YYYY
        let date_str = date.format("%d/%m/%Y").to_string();
        let body = format!("method=GetSJCGoldPriceByDate&toDate={}", date_str);

        let response = self.client.post(SJC_URL).body(body).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "SJC request failed: {}",
                response.status()
            )));
        }

        let result: SjcResponse = response.json().await?;

        if !result.success || result.data.is_empty() {
            return Err(VnMarketError::NoData {
                symbol: "VN.GOLD".to_string(),
                date: date.to_string(),
            });
        }

        // Return first entry (SJC standard gold bar - typically "Vàng miếng SJC")
        Ok(result.data.into_iter().next().unwrap())
    }

    /// Get current (today's) gold price
    pub async fn get_current_price(&self) -> Result<SjcGoldPrice, VnMarketError> {
        let today = chrono::Utc::now().date_naive();
        self.get_gold_price(today).await
    }

    /// Get gold price history for a date range
    ///
    /// Note: This fetches day-by-day which can be slow for large ranges.
    /// Consider using caching for better performance.
    pub async fn get_history(
        &self,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<GoldQuote>, VnMarketError> {
        let mut results = Vec::new();
        let mut current = start;

        while current <= end {
            // Skip weekends (gold market doesn't trade)
            if current.weekday().num_days_from_monday() < 5 {
                match self.get_gold_price(current).await {
                    Ok(price) => {
                        results.push(GoldQuote::from_sjc("VN.GOLD", current, &price));
                    }
                    Err(VnMarketError::NoData { .. }) => {
                        // Skip dates with no data (holidays, etc.)
                        log::debug!("No gold data for {}", current);
                    }
                    Err(e) => {
                        // Log error but continue with other dates
                        log::warn!("Error fetching gold price for {}: {}", current, e);
                    }
                }
            }

            current = current.succ_opt().unwrap_or(current);
        }

        Ok(results)
    }

    /// Get latest available gold quote (tries recent days if today fails)
    pub async fn get_latest_quote(&self, symbol: &str) -> Result<GoldQuote, VnMarketError> {
        let today = chrono::Utc::now().date_naive();

        // Try last 7 days
        for days_back in 0..7 {
            let date = today - chrono::Duration::days(days_back);

            // Skip weekends
            if date.weekday().num_days_from_monday() >= 5 {
                continue;
            }

            match self.get_gold_price(date).await {
                Ok(price) => {
                    return Ok(GoldQuote::from_sjc(symbol, date, &price));
                }
                Err(VnMarketError::NoData { .. }) => {
                    continue;
                }
                Err(e) => {
                    log::warn!("Error fetching gold price for {}: {}", date, e);
                    continue;
                }
            }
        }

        Err(VnMarketError::NoData {
            symbol: symbol.to_string(),
            date: "recent".to_string(),
        })
    }
}

impl Default for SjcClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_gold_price() {
        let client = SjcClient::new();
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();

        let price = client.get_gold_price(date).await.unwrap();

        assert!(price.buy_value > 0.0);
        assert!(price.sell_value > 0.0);
        // Gold prices should be in millions of VND range
        assert!(price.sell_value > 50_000_000.0);
    }

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_latest_quote() {
        let client = SjcClient::new();

        let quote = client.get_latest_quote("VN.GOLD").await.unwrap();

        assert_eq!(quote.symbol, "VN.GOLD");
        assert!(quote.close > rust_decimal::Decimal::ZERO);
    }

    #[tokio::test]
    async fn test_min_date_validation() {
        let client = SjcClient::new();
        let old_date = NaiveDate::from_ymd_opt(2015, 1, 1).unwrap();

        let result = client.get_gold_price(old_date).await;

        assert!(matches!(result, Err(VnMarketError::InvalidDate(_))));
    }
}
