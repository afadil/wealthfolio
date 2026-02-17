//! Boerse Frankfurt (Deutsche Boerse) provider for bond market data.
//!
//! Fetches bond price history from the Deutsche Boerse live API (XFRA exchange).
//! Prices are quoted as percentage-of-par and converted to decimal fractions
//! (e.g., 97.025 -> 0.97025).
//!
//! No API key required. Authentication uses a salt scraped from the frontend JS bundle
//! to compute per-request headers (`x-security`, `x-client-traceid`).

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use md5::{Digest, Md5};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::warn;

use crate::errors::MarketDataError;
use crate::models::{AssetProfile, Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

const PROVIDER_ID: &str = "BOERSE_FRANKFURT";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const BASE_URL: &str = "https://api.live.deutsche-boerse.com/v1/data/price_history";
const INSTRUMENT_INFO_URL: &str =
    "https://api.live.deutsche-boerse.com/v1/data/instrument_information";
const MAIN_JS_URL: &str = "https://live.deutsche-boerse.com";

/// A single data point from the BF price history response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PricePoint {
    date: String,
    #[serde(default)]
    open: Option<f64>,
    close: Option<f64>,
    #[serde(default)]
    high: Option<f64>,
    #[serde(default)]
    low: Option<f64>,
    #[serde(default)]
    turnover_pieces: Option<f64>,
}

/// Top-level BF price history response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PriceHistoryResponse {
    #[allow(dead_code)]
    isin: Option<String>,
    data: Vec<PricePoint>,
    #[allow(dead_code)]
    total_count: Option<u32>,
    #[allow(dead_code)]
    traded_in_percent: Option<bool>,
}

/// Response from the instrument_information endpoint.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstrumentInfoResponse {
    instrument_name: Option<InstrumentName>,
}

/// Nested name object within instrument_information response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstrumentName {
    original_value: Option<String>,
}

/// Boerse Frankfurt provider for bond market data.
pub struct BoerseFrankfurtProvider {
    client: Client,
    salt: Arc<RwLock<Option<String>>>,
}

impl BoerseFrankfurtProvider {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            salt: Arc::new(RwLock::new(None)),
        }
    }

    /// Get the salt, scraping from the frontend JS if not cached.
    async fn get_salt(&self) -> Result<String, MarketDataError> {
        // Check cache first
        {
            let cached = self.salt.read().await;
            if let Some(ref s) = *cached {
                return Ok(s.clone());
            }
        }

        // Scrape salt from main page
        let salt = self.scrape_salt().await?;

        // Cache it
        {
            let mut w = self.salt.write().await;
            *w = Some(salt.clone());
        }

        Ok(salt)
    }

    /// Scrape the salt from the Deutsche Boerse frontend JS bundle.
    async fn scrape_salt(&self) -> Result<String, MarketDataError> {
        // First fetch the main page to find the JS bundle URL
        let html = self
            .client
            .get(MAIN_JS_URL)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to fetch main page: {}", e),
            })?
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to read main page: {}", e),
            })?;

        // Find main.*.js bundle URL
        let js_url = extract_main_js_url(&html).ok_or_else(|| MarketDataError::ProviderError {
            provider: PROVIDER_ID.to_string(),
            message: "Could not find main JS bundle URL".to_string(),
        })?;

        let full_js_url = if js_url.starts_with("http") {
            js_url
        } else {
            format!("{}/{}", MAIN_JS_URL, js_url.trim_start_matches('/'))
        };

        // Fetch the JS bundle
        let js_body = self
            .client
            .get(&full_js_url)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to fetch JS bundle: {}", e),
            })?
            .text()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("Failed to read JS bundle: {}", e),
            })?;

        // Extract salt from JS: salt:"<hex>"
        extract_salt_from_js(&js_body).ok_or_else(|| MarketDataError::ProviderError {
            provider: PROVIDER_ID.to_string(),
            message: "Could not extract salt from JS bundle".to_string(),
        })
    }

    /// Build the authentication headers for a request.
    fn build_headers(timestamp: &str, full_url: &str, salt: &str) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();

        // client-date: full ISO timestamp
        headers.insert("client-date", timestamp.parse().unwrap());

        // x-security: MD5 of timestamp truncated to minute (YYYYMMDDHHmm)
        let minute_str = timestamp
            .replace("-", "")
            .replace(":", "")
            .replace("T", "")
            .chars()
            .take(12) // YYYYMMDDHHmm
            .collect::<String>();
        let security = format!("{:x}", Md5::digest(minute_str.as_bytes()));
        headers.insert("x-security", security.parse().unwrap());

        // x-client-traceid: MD5 of "{timestamp}{url}{salt}"
        let trace_input = format!("{}{}{}", timestamp, full_url, salt);
        let trace_id = format!("{:x}", Md5::digest(trace_input.as_bytes()));
        headers.insert("x-client-traceid", trace_id.parse().unwrap());

        // Origin/Referer
        headers.insert(
            "origin",
            "https://live.deutsche-boerse.com".parse().unwrap(),
        );
        headers.insert(
            "referer",
            "https://live.deutsche-boerse.com/".parse().unwrap(),
        );

        headers
    }

    /// Fetch the instrument name for a bond ISIN.
    async fn fetch_instrument_name(&self, isin: &str) -> Result<String, MarketDataError> {
        let salt = self.get_salt().await?;

        let url = format!("{}?isin={}&mic=XFRA", INSTRUMENT_INFO_URL, isin);

        let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let headers = Self::build_headers(&timestamp, &url, &salt);

        let resp = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP request failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            if status.as_u16() == 401 || status.as_u16() == 403 {
                let mut w = self.salt.write().await;
                *w = None;
            }
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP {}", status),
            });
        }

        let body: InstrumentInfoResponse =
            resp.json()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: format!("JSON parse error: {}", e),
                })?;

        body.instrument_name
            .and_then(|n| n.original_value)
            .filter(|n| !n.is_empty())
            .ok_or_else(|| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("No instrument name found for {}", isin),
            })
    }

    /// Fetch price history for a bond ISIN.
    async fn fetch_price_history(
        &self,
        isin: &str,
        min_date: &str,
        max_date: &str,
        currency_hint: Option<&str>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let salt = self.get_salt().await?;

        let url = format!(
            "{}?isin={}&mic=XFRA&minDate={}&maxDate={}",
            BASE_URL, isin, min_date, max_date
        );

        let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let headers = Self::build_headers(&timestamp, &url, &salt);

        let resp = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP request failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            // If 403/401, the salt may be stale — invalidate cache
            if status.as_u16() == 401 || status.as_u16() == 403 {
                let mut w = self.salt.write().await;
                *w = None;
            }
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP {}", status),
            });
        }

        let body: PriceHistoryResponse =
            resp.json()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: format!("JSON parse error: {}", e),
                })?;

        if body.data.is_empty() {
            return Err(MarketDataError::SymbolNotFound(isin.to_string()));
        }

        // Use the asset's quote_ccy from context, or default to EUR for XFRA
        let currency = currency_hint.unwrap_or("EUR").to_string();

        let mut quotes = Vec::with_capacity(body.data.len());
        for point in &body.data {
            let date = NaiveDate::parse_from_str(&point.date, "%Y-%m-%d").map_err(|e| {
                MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: format!("Date parse error: {}", e),
                }
            })?;

            let close_pct = match point.close {
                Some(c) => c,
                None => continue,
            };

            // Prices are %-of-par: 97.025 means 97.025% → 0.97025
            let close = Decimal::try_from(close_pct / 100.0).map_err(|_| {
                MarketDataError::ValidationFailed {
                    message: format!("Failed to convert close {} to decimal", close_pct),
                }
            })?;

            let open = point.open.and_then(|v| Decimal::try_from(v / 100.0).ok());
            let high = point.high.and_then(|v| Decimal::try_from(v / 100.0).ok());
            let low = point.low.and_then(|v| Decimal::try_from(v / 100.0).ok());
            let volume = point
                .turnover_pieces
                .and_then(|v| Decimal::try_from(v).ok());

            let timestamp = DateTime::<Utc>::from_naive_utc_and_offset(
                date.and_hms_opt(16, 0, 0).unwrap(),
                Utc,
            );

            quotes.push(Quote {
                timestamp,
                open,
                high,
                low,
                close,
                volume,
                currency: currency.clone(),
                source: PROVIDER_ID.to_string(),
            });
        }

        Ok(quotes)
    }
}

/// Extract the main.*.js bundle URL from the HTML page.
fn extract_main_js_url(html: &str) -> Option<String> {
    // Look for script src containing "main." and ".js"
    for part in html.split("src=\"") {
        if let Some(end) = part.find('"') {
            let url = &part[..end];
            if url.contains("main.") && url.contains(".js") {
                return Some(url.to_string());
            }
        }
    }
    None
}

/// Extract the salt value from the JS bundle content.
fn extract_salt_from_js(js: &str) -> Option<String> {
    // Look for salt:"<hex>" pattern
    let patterns = ["salt:\"", "salt: \""];
    for pat in patterns {
        if let Some(idx) = js.find(pat) {
            let after = &js[idx + pat.len()..];
            if let Some(end) = after.find('"') {
                let salt = &after[..end];
                if !salt.is_empty() && salt.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Some(salt.to_string());
                }
            }
        }
    }
    None
}

#[async_trait]
impl MarketDataProvider for BoerseFrankfurtProvider {
    fn id(&self) -> &'static str {
        PROVIDER_ID
    }

    fn priority(&self) -> u8 {
        15
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Bond],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: false,
            supports_profile: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 30,
            max_concurrency: 2,
            min_delay: Duration::from_secs(2),
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let isin = match &instrument {
            ProviderInstrument::BondIsin { isin } => isin.to_string(),
            _ => {
                return Err(MarketDataError::UnsupportedAssetType(format!(
                    "{:?}",
                    instrument
                )))
            }
        };

        let currency_hint = context.currency_hint.as_deref();

        // Fetch last 10 days to account for weekends/holidays
        let end = Utc::now().format("%Y-%m-%d").to_string();
        let start = (Utc::now() - chrono::Duration::days(10))
            .format("%Y-%m-%d")
            .to_string();

        let quotes = self
            .fetch_price_history(&isin, &start, &end, currency_hint)
            .await?;

        quotes.into_iter().last().ok_or_else(|| {
            warn!("BF: no quotes returned for {}", isin);
            MarketDataError::SymbolNotFound(isin)
        })
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let isin = match &instrument {
            ProviderInstrument::BondIsin { isin } => isin.to_string(),
            _ => {
                return Err(MarketDataError::UnsupportedAssetType(format!(
                    "{:?}",
                    instrument
                )))
            }
        };

        let currency_hint = context.currency_hint.as_deref();
        let min_date = start.format("%Y-%m-%d").to_string();
        let max_date = end.format("%Y-%m-%d").to_string();

        self.fetch_price_history(&isin, &min_date, &max_date, currency_hint)
            .await
    }

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let name = self.fetch_instrument_name(symbol).await?;
        Ok(AssetProfile::with_name(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_id() {
        let provider = BoerseFrankfurtProvider::new();
        assert_eq!(provider.id(), "BOERSE_FRANKFURT");
    }

    #[test]
    fn test_provider_priority() {
        let provider = BoerseFrankfurtProvider::new();
        assert_eq!(provider.priority(), 15);
    }

    #[test]
    fn test_capabilities() {
        let provider = BoerseFrankfurtProvider::new();
        let caps = provider.capabilities();
        assert_eq!(caps.instrument_kinds, &[InstrumentKind::Bond]);
        assert!(caps.supports_latest);
        assert!(caps.supports_historical);
        assert!(!caps.supports_search);
        assert!(caps.supports_profile);
    }

    #[test]
    fn test_rate_limit() {
        let provider = BoerseFrankfurtProvider::new();
        let rl = provider.rate_limit();
        assert_eq!(rl.requests_per_minute, 30);
        assert_eq!(rl.max_concurrency, 2);
        assert_eq!(rl.min_delay, Duration::from_secs(2));
    }

    #[test]
    fn test_build_headers() {
        let timestamp = "2026-02-16T06:09:48.000Z";
        let url = "https://api.live.deutsche-boerse.com/v1/data/price_history?isin=XS2530331413&mic=XFRA&minDate=2026-02-06&maxDate=2026-02-16";
        let salt = "af5a8d16eb5dc49f8a72b26fd9185475c7a";

        let headers = BoerseFrankfurtProvider::build_headers(timestamp, url, salt);

        assert_eq!(headers.get("client-date").unwrap(), timestamp);
        assert!(headers.get("x-security").is_some());
        assert!(headers.get("x-client-traceid").is_some());
        assert_eq!(
            headers.get("origin").unwrap(),
            "https://live.deutsche-boerse.com"
        );
        assert_eq!(
            headers.get("referer").unwrap(),
            "https://live.deutsche-boerse.com/"
        );

        // x-security should be MD5 of "202602160609"
        let expected_security = format!("{:x}", Md5::digest("202602160609".as_bytes()));
        assert_eq!(
            headers.get("x-security").unwrap().to_str().unwrap(),
            expected_security
        );
    }

    #[test]
    fn test_extract_main_js_url() {
        let html = r#"<script src="main.abc123.js"></script>"#;
        assert_eq!(
            extract_main_js_url(html),
            Some("main.abc123.js".to_string())
        );

        let html = r#"<script src="/assets/main.def456.js"></script>"#;
        assert_eq!(
            extract_main_js_url(html),
            Some("/assets/main.def456.js".to_string())
        );

        let html = r#"<script src="vendor.js"></script>"#;
        assert_eq!(extract_main_js_url(html), None);
    }

    #[test]
    fn test_extract_salt_from_js() {
        let js = r#"something,salt:"af5a8d16eb5dc49f8a72b26fd9185475c7a",other"#;
        assert_eq!(
            extract_salt_from_js(js),
            Some("af5a8d16eb5dc49f8a72b26fd9185475c7a".to_string())
        );

        let js = r#"no salt here"#;
        assert_eq!(extract_salt_from_js(js), None);
    }

    #[test]
    fn test_parse_price_history_response() {
        let json = r#"{
            "isin": "XS2530331413",
            "data": [
                {"date": "2026-02-13", "open": 97.07, "close": 97.06, "high": 97.135, "low": 97.04, "turnoverPieces": 10000, "turnoverEuro": 9713.5}
            ],
            "totalCount": 1,
            "tradedInPercent": true
        }"#;

        let resp: PriceHistoryResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.data.len(), 1);
        assert_eq!(resp.data[0].date, "2026-02-13");
        assert_eq!(resp.data[0].close, Some(97.06));
        assert_eq!(resp.data[0].turnover_pieces, Some(10000.0));
    }

    #[test]
    fn test_percent_of_par_conversion() {
        // 97.025% of par → 0.97025
        let pct = 97.025_f64;
        let decimal = Decimal::try_from(pct / 100.0).unwrap();
        assert_eq!(decimal.to_string(), "0.97025");

        // 100% → 1.0
        let pct = 100.0_f64;
        let decimal = Decimal::try_from(pct / 100.0).unwrap();
        assert_eq!(decimal.to_string(), "1");
    }
}
