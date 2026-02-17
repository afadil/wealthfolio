//! OpenFIGI provider for bond name enrichment.
//!
//! Uses the free OpenFIGI API to resolve ISIN -> issuer name + security description.
//! Covers US corporates, US Treasuries, and European bonds.
//! Profile-only provider (no pricing support).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

use crate::errors::MarketDataError;
use crate::models::{AssetProfile, Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

const PROVIDER_ID: &str = "OPENFIGI";
const API_URL: &str = "https://api.openfigi.com/v3/mapping";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct OpenFigiData {
    name: Option<String>,
    ticker: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenFigiResult {
    data: Option<Vec<OpenFigiData>>,
}

pub struct OpenFigiProvider {
    client: Client,
}

impl OpenFigiProvider {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    async fn fetch_name(&self, isin: &str) -> Result<String, MarketDataError> {
        let body = serde_json::json!([{"idType": "ID_ISIN", "idValue": isin}]);

        let resp = self
            .client
            .post(API_URL)
            .json(&body)
            .send()
            .await
            .map_err(|e| MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP request failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            return Err(MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("HTTP {}", status),
            });
        }

        let results: Vec<OpenFigiResult> =
            resp.json()
                .await
                .map_err(|e| MarketDataError::ProviderError {
                    provider: PROVIDER_ID.to_string(),
                    message: format!("JSON parse error: {}", e),
                })?;

        let data = results
            .into_iter()
            .next()
            .and_then(|r| r.data)
            .and_then(|mut d| if d.is_empty() { None } else { Some(d.remove(0)) })
            .ok_or_else(|| MarketDataError::SymbolNotFound(isin.to_string()))?;

        let name = data.name.filter(|n| !n.is_empty()).ok_or_else(|| {
            MarketDataError::ProviderError {
                provider: PROVIDER_ID.to_string(),
                message: format!("No name found for {}", isin),
            }
        })?;

        match data.ticker.filter(|t| !t.is_empty()) {
            Some(ticker) => Ok(format!("{} - {}", name, ticker)),
            None => Ok(name),
        }
    }
}

#[async_trait]
impl MarketDataProvider for OpenFigiProvider {
    fn id(&self) -> &'static str {
        PROVIDER_ID
    }

    fn priority(&self) -> u8 {
        5
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Bond],
            coverage: Coverage::global_best_effort(),
            supports_latest: false,
            supports_historical: false,
            supports_search: false,
            supports_profile: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 25,
            max_concurrency: 1,
            min_delay: Duration::from_secs(3),
        }
    }

    async fn get_latest_quote(
        &self,
        _context: &QuoteContext,
        _instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        Err(MarketDataError::NotSupported {
            operation: "get_latest_quote".to_string(),
            provider: PROVIDER_ID.to_string(),
        })
    }

    async fn get_historical_quotes(
        &self,
        _context: &QuoteContext,
        _instrument: ProviderInstrument,
        _start: DateTime<Utc>,
        _end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        Err(MarketDataError::NotSupported {
            operation: "get_historical_quotes".to_string(),
            provider: PROVIDER_ID.to_string(),
        })
    }

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let name = self.fetch_name(symbol).await?;
        Ok(AssetProfile::with_name(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_id() {
        let provider = OpenFigiProvider::new();
        assert_eq!(provider.id(), "OPENFIGI");
    }

    #[test]
    fn test_provider_priority() {
        let provider = OpenFigiProvider::new();
        assert_eq!(provider.priority(), 5);
    }

    #[test]
    fn test_capabilities() {
        let provider = OpenFigiProvider::new();
        let caps = provider.capabilities();
        assert_eq!(caps.instrument_kinds, &[InstrumentKind::Bond]);
        assert!(!caps.supports_latest);
        assert!(!caps.supports_historical);
        assert!(!caps.supports_search);
        assert!(caps.supports_profile);
    }

    #[test]
    fn test_rate_limit() {
        let provider = OpenFigiProvider::new();
        let rl = provider.rate_limit();
        assert_eq!(rl.requests_per_minute, 25);
        assert_eq!(rl.max_concurrency, 1);
        assert_eq!(rl.min_delay, Duration::from_secs(3));
    }

    #[test]
    fn test_parse_response() {
        let json = r#"[{"data":[{"figi":"BBG00GBVBK04","name":"JPMORGAN CHASE & CO","ticker":"JPM V2.069 06/01/29","securityDescription":"JPM 2.069 06/01/29"}]}]"#;
        let results: Vec<OpenFigiResult> = serde_json::from_str(json).unwrap();
        assert_eq!(results.len(), 1);
        let data = results[0].data.as_ref().unwrap();
        assert_eq!(data[0].name.as_deref(), Some("JPMORGAN CHASE & CO"));
        assert_eq!(data[0].ticker.as_deref(), Some("JPM V2.069 06/01/29"));
    }

    #[test]
    fn test_parse_empty_response() {
        let json = r#"[{"warning":"No identifier found."}]"#;
        let results: Vec<OpenFigiResult> = serde_json::from_str(json).unwrap();
        assert!(results[0].data.is_none());
    }
}
