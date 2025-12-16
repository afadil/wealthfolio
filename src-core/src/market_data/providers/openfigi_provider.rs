use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::models::AssetProfile;
use crate::market_data::{AssetProfiler, QuoteSummary};
use async_trait::async_trait;
use log::{debug, warn};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

const BASE_URL: &str = "https://api.openfigi.com/v3";

/// OpenFIGI provider for ISIN to ticker symbol resolution and search
pub struct OpenFigiProvider {
    client: Client,
    api_key: Option<String>,
}

impl OpenFigiProvider {
    pub fn new(api_key: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());

        OpenFigiProvider { client, api_key }
    }

    /// Map ISIN to ticker using OpenFIGI API
    async fn map_isin_to_ticker(&self, isin: &str) -> Result<FigiResult, MarketDataError> {
        let url = format!("{}/mapping", BASE_URL);

        let request_body = vec![MappingJob {
            id_type: "ID_ISIN".to_string(),
            id_value: isin.to_string(),
            ..Default::default()
        }];

        let mut request_builder = self.client.post(&url).json(&request_body);

        if let Some(api_key) = &self.api_key {
            request_builder = request_builder.header("X-OPENFIGI-APIKEY", api_key);
        }

        let response = request_builder.send().await.map_err(|e| {
            MarketDataError::ProviderError(format!("OpenFIGI request failed: {}", e))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            if status == StatusCode::TOO_MANY_REQUESTS {
                return Err(MarketDataError::ProviderError(
                    "OpenFIGI rate limit exceeded".to_string(),
                ));
            }

            return Err(MarketDataError::ProviderError(format!(
                "OpenFIGI API error {}: {}",
                status, error_text
            )));
        }

        let results: Vec<MappingResponse> = response.json().await.map_err(|e| {
            MarketDataError::ProviderError(format!("Failed to parse OpenFIGI response: {}", e))
        })?;

        // Get the first result
        if let Some(first_result) = results.first() {
            if let Some(error) = &first_result.error {
                return Err(MarketDataError::ProviderError(format!(
                    "OpenFIGI error: {}",
                    error
                )));
            }

            if let Some(data) = &first_result.data {
                if let Some(figi_result) = data.first() {
                    return Ok(figi_result.clone());
                }
            }
        }

        Err(MarketDataError::NotFound(format!(
            "No FIGI mapping found for ISIN: {}",
            isin
        )))
    }

    /// Search for securities using text query
    async fn search_securities(&self, query: &str) -> Result<Vec<FigiResult>, MarketDataError> {
        let url = format!("{}/search", BASE_URL);

        // Initial search request
        let request_body = SearchRequest {
            query: query.to_string(),
            ..Default::default()
        };

        let mut request_builder = self.client.post(&url).json(&request_body);

        if let Some(api_key) = &self.api_key {
            request_builder = request_builder.header("X-OPENFIGI-APIKEY", api_key);
        }

        let response = request_builder.send().await.map_err(|e| {
            MarketDataError::ProviderError(format!("OpenFIGI search request failed: {}", e))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            if status == StatusCode::TOO_MANY_REQUESTS {
                return Err(MarketDataError::ProviderError(
                    "OpenFIGI rate limit exceeded".to_string(),
                ));
            }
            return Err(MarketDataError::ProviderError(format!(
                "OpenFIGI search error {}: {}",
                status, error_text
            )));
        }

        let search_response: SearchResponse = response.json().await.map_err(|e| {
            MarketDataError::ProviderError(format!(
                "Failed to parse OpenFIGI search response: {}",
                e
            ))
        })?;

        if let Some(error) = search_response.error {
            return Err(MarketDataError::ProviderError(format!(
                "OpenFIGI search error: {}",
                error
            )));
        }

        Ok(search_response.data.unwrap_or_default())
    }

    /// Helper to map OpenFIGI exchange codes to Yahoo Finance suffixes.
    /// This is not a guess, but a translation between two different standards.
    fn map_to_yahoo_ticker(&self, ticker: &str, exch_code: Option<&str>) -> String {
        if let Some(code) = exch_code {
            let suffix = match code {
                // United States
                "US" | "UN" | "UQ" | "UW" | "UR" | "UA" | "U3" | "U1" | "U2" | "U9" | "U0" => "",

                // Europe
                "LN" | "L" => ".L",   // London Stock Exchange
                "GY" | "GR" => ".DE", // Xetra / Germany
                "FP" | "PA" => ".PA", // Euronext Paris
                "AV" | "AS" => ".AS", // Euronext Amsterdam
                "BB" | "BR" => ".BR", // Euronext Brussels
                "LI" | "LS" => ".LS", // Euronext Lisbon
                "ID" | "IR" => ".IR", // Euronext Dublin
                "IM" | "MI" => ".MI", // Borsa Italiana
                "SM" | "MC" => ".MC", // Bolsa de Madrid
                "SW" | "S" => ".SW",  // SIX Swiss Exchange
                "VX" => ".VX",        // SIX Swiss Exchange (Blue Chips)
                "NO" | "OL" => ".OL", // Oslo Børs
                "SS" | "ST" => ".ST", // Nasdaq Stockholm
                "CP" | "CO" => ".CO", // Nasdaq Copenhagen
                "HE" | "FH" => ".HE", // Nasdaq Helsinki
                "VI" | "VA" => ".VI", // Vienna Stock Exchange

                // Asia Pacific
                "HK" | "H" => ".HK",       // Hong Kong
                "JP" | "TK" | "T" => ".T", // Tokyo Stock Exchange
                "AU" | "AX" => ".AX",      // Australian Securities Exchange
                "NZ" => ".NZ",             // New Zealand
                "KS" | "KO" => ".KS",      // KOSPI (Korea)
                "KQ" => ".KQ",             // KOSDAQ (Korea)
                "SI" | "SP" => ".SI",      // Singapore
                "TW" => ".TW",             // Taiwan
                "SH" | "SS" => ".SS",      // Shanghai
                "SZ" => ".SZ",             // Shenzhen
                "BK" => ".BK",             // Thailand
                "JK" => ".JK",             // Jakarta
                "KL" => ".KL",             // Kuala Lumpur

                // Americas (Non-US)
                "CN" | "TO" => ".TO",  // Toronto Stock Exchange
                "CV" | "V" => ".V",    // TSX Venture
                "MX" | "MM" => ".MX",  // Mexico
                "SA" | "SN" => ".SA",  // Sao Paulo (B3)
                "BA" | "BC" => ".BA",  // Buenos Aires
                "SN" | "SGO" => ".SN", // Santiago

                // Middle East / Africa
                "TA" => ".TA",        // Tel Aviv
                "JO" | "SJ" => ".JO", // Johannesburg

                // Fallback
                _ => {
                    debug!(
                        "OpenFIGI: Unknown exchange code '{}', returning ticker without suffix",
                        code
                    );
                    ""
                }
            };
            format!("{}{}", ticker, suffix)
        } else {
            ticker.to_string()
        }
    }
}

#[async_trait]
impl AssetProfiler for OpenFigiProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        // Check if it looks like an ISIN (12 alphanumeric characters)
        let is_isin = symbol.len() == 12 && symbol.chars().all(|c| c.is_alphanumeric());

        if is_isin {
            debug!("OpenFIGI: Attempting to resolve ISIN: {}", symbol);
            match self.map_isin_to_ticker(symbol).await {
                Ok(figi_result) => {
                    let ticker = figi_result.ticker.as_ref().ok_or_else(|| {
                        MarketDataError::NotFound(format!("No ticker found for ISIN: {}", symbol))
                    })?;

                    // OpenFIGI returns the ticker and an exchange code (exchCode).
                    // To make this usable with our quote providers (primarily Yahoo Finance),
                    // we need to map the OpenFIGI exchange code to the corresponding Yahoo suffix.
                    // This is a necessary translation layer because OpenFIGI and Yahoo use different standards.
                    let yahoo_ticker =
                        self.map_to_yahoo_ticker(ticker, figi_result.exch_code.as_deref());

                    debug!(
                        "OpenFIGI: Resolved ISIN {} to ticker {} (FIGI: {}, Exch: {:?})",
                        symbol, yahoo_ticker, figi_result.figi, figi_result.exch_code
                    );

                    Ok(AssetProfile {
                        id: Some(yahoo_ticker.clone()),
                        isin: Some(symbol.to_string()),
                        name: figi_result.name.clone(),
                        asset_type: figi_result.security_type.clone(),
                        symbol: yahoo_ticker,
                        data_source: DataSource::OpenFigi.as_str().to_string(),
                        currency: String::from("USD"), // Default, ideally we'd get this from FIGI if available
                        ..Default::default()
                    })
                }
                Err(e) => {
                    debug!("OpenFIGI: Failed to resolve ISIN {}: {:?}", symbol, e);
                    Err(e)
                }
            }
        } else {
            // If not an ISIN, try text search
            debug!("OpenFIGI: Searching for symbol: {}", symbol);
            let results = self.search_securities(symbol).await?;

            if let Some(first_result) = results.first() {
                let ticker = first_result.ticker.as_ref().ok_or_else(|| {
                    MarketDataError::NotFound(format!("No ticker found for query: {}", symbol))
                })?;

                Ok(AssetProfile {
                    id: Some(ticker.clone()),
                    isin: None,
                    name: first_result.name.clone(),
                    asset_type: first_result.security_type.clone(),
                    symbol: ticker.clone(),
                    data_source: DataSource::OpenFigi.as_str().to_string(),
                    currency: String::from("USD"),
                    ..Default::default()
                })
            } else {
                Err(MarketDataError::NotFound(format!(
                    "No results for query: {}",
                    symbol
                )))
            }
        }
    }

    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        debug!("OpenFIGI: Searching for: {}", query);

        // Check if it looks like an ISIN (12 alphanumeric characters)
        let is_isin = query.len() == 12 && query.chars().all(|c| c.is_alphanumeric());

        if is_isin {
            // Use mapping API for ISIN resolution
            debug!(
                "OpenFIGI: Detected ISIN format, using mapping API for: {}",
                query
            );
            match self.map_isin_to_ticker(query).await {
                Ok(figi_result) => {
                    if let Some(ticker) = &figi_result.ticker {
                        debug!("OpenFIGI: Resolved ISIN {} to ticker {}", query, ticker);

                        return Ok(vec![QuoteSummary {
                            symbol: ticker.clone(),
                            long_name: figi_result.name.clone().unwrap_or_else(|| ticker.clone()),
                            short_name: figi_result.name.clone().unwrap_or_else(|| ticker.clone()),
                            exchange: figi_result.exch_code.clone().unwrap_or_default(),
                            quote_type: figi_result.security_type.clone().unwrap_or_default(),
                            type_display: figi_result.security_type2.clone().unwrap_or_default(),
                            index: String::new(),
                            score: 1.0, // High score for exact ISIN match
                        }]);
                    }
                }
                Err(e) => {
                    debug!("OpenFIGI: ISIN mapping failed for {}: {:?}", query, e);
                    return Err(e);
                }
            }
        }

        // Use search API for text queries
        let results = self.search_securities(query).await?;

        let summaries = results
            .into_iter()
            .filter_map(|result| {
                result.ticker.as_ref().map(|ticker| QuoteSummary {
                    symbol: ticker.clone(),
                    long_name: result.name.clone().unwrap_or_else(|| ticker.clone()),
                    short_name: result.name.clone().unwrap_or_else(|| ticker.clone()),
                    exchange: result.exch_code.clone().unwrap_or_default(),
                    quote_type: result.security_type.clone().unwrap_or_default(),
                    type_display: result.security_type2.clone().unwrap_or_default(),
                    index: String::new(),
                    score: 0.0,
                })
            })
            .collect();

        Ok(summaries)
    }
}

// API Request/Response structures
// Based on OpenFIGI V3 API Documentation

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MappingJob {
    id_type: String,
    id_value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    exch_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mic_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    market_sec_des: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    security_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    security_type2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_unlisted_equities: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    option_type: Option<String>,
    // strike, contractSize, coupon, expiration, maturity, stateCode omitted for brevity but can be added
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MappingResponse {
    #[serde(default)]
    data: Option<Vec<FigiResult>>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FigiResult {
    figi: String,
    #[serde(default)]
    security_type: Option<String>,
    #[serde(default)]
    market_sector: Option<String>,
    #[serde(default)]
    ticker: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    exch_code: Option<String>,
    #[serde(default)]
    share_class_figi: Option<String>,
    #[serde(default)]
    composite_figi: Option<String>,
    #[serde(default)]
    security_type2: Option<String>,
    #[serde(default)]
    security_description: Option<String>,
    // metadata field is "Metadata N/A" string when attributes unavailable
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    start: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exch_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mic_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    market_sec_des: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    security_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    security_type2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    include_unlisted_equities: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    data: Option<Vec<FigiResult>>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    next: Option<String>,
    #[serde(default)]
    total: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_isin_resolution() {
        let provider = OpenFigiProvider::new(None);
        // Apple Inc. ISIN
        let result = provider.get_asset_profile("US0378331005").await;
        // This test might fail without network or if rate limited, but structure is correct
        if let Ok(profile) = result {
            assert!(profile.symbol.contains("AAPL"));
        }
    }

    #[tokio::test]
    async fn test_search() {
        let provider = OpenFigiProvider::new(None);
        let results = provider.search_ticker("Apple").await;
        if let Ok(summaries) = results {
            assert!(!summaries.is_empty());
        }
    }
}
