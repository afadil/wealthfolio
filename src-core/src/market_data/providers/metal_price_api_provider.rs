use std::time::SystemTime;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use num_traits::FromPrimitive;
use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::{AssetProfiler, MarketDataProvider, Quote as ModelQuote, QuoteSummary, market_data_model::DataSource};
use crate::market_data::providers::models::{AssetProfile};

#[derive(Deserialize, Debug)]
struct MetalPriceApiResponse {
    success: bool,
    base: String,
    timestamp: i64,
    rates: std::collections::HashMap<String, f64>,
}

pub struct MetalPriceApiProvider {
    api_key: String,
}

impl MetalPriceApiProvider {
    pub fn new(api_key: String) -> Self {
        MetalPriceApiProvider { api_key }
    }
}

#[async_trait::async_trait]
impl AssetProfiler for MetalPriceApiProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let (name, asset_type) = match symbol {
            "XAU" => ("Gold", "Commodity"),
            "XAG" => ("Silver", "Commodity"),
            _ => return Err(MarketDataError::NotFound(symbol.to_string())),
        };

        Ok(AssetProfile {
            id: Some(symbol.to_string()),
            name: Some(name.to_string()),
            asset_type: Some(asset_type.to_string()),
            symbol: symbol.to_string(),
            data_source: "METAL_PRICE_API".to_string(),
            ..Default::default()
        })
    }

    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        let query = query.to_lowercase();
        let mut results = Vec::new();

        if "gold".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XAU".to_string(),
                long_name: "Gold".to_string(),
                short_name: "Gold".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "".to_string(),
                index: "".to_string(),
                score: 0.0,
                type_display: "".to_string(),
            });
        }

        if "silver".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XAG".to_string(),
                long_name: "Silver".to_string(),
                short_name: "Silver".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "".to_string(),
                index: "".to_string(),
                score: 0.0,
                type_display: "".to_string(),
            });
        }

        Ok(results)
    }
}

#[async_trait::async_trait]
impl MarketDataProvider for MetalPriceApiProvider {
    fn name(&self) -> &'static str {
        "METAL_PRICE_API"
    }

    fn priority(&self) -> u8 {
        4
    }

    async fn get_latest_quote(
        &self,
        symbol: &str,
        _fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        let url = format!(
            "https://api.metalpriceapi.com/v1/latest?api_key={}&base=USD&currencies=EUR,XAU,XAG",
            self.api_key
        );

        let response = reqwest::get(&url)
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?
            .json::<MetalPriceApiResponse>()
            .await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        if !response.success {
            return Err(MarketDataError::ProviderError("API request failed".to_string()));
        }

        let rate = response.rates.get(symbol).ok_or_else(|| MarketDataError::NotFound(symbol.to_string()))?;
        let price = Decimal::from_f64(1.0 / *rate).unwrap_or_default();

        let now_utc: DateTime<Utc> = Utc::now();

        Ok(ModelQuote {
            id: format!("{}_{}", now_utc.format("%Y%m%d"), symbol),
            created_at: now_utc,
            data_source: DataSource::MetalPriceApi,
            timestamp: now_utc,
            symbol: symbol.to_string(),
            close: price,
            currency: "USD".to_string(),
            open: Default::default(),
            high: Default::default(),
            low: Default::default(),
            adjclose: Default::default(),
            volume: Default::default(),
        })
    }

    async fn get_historical_quotes(
        &self,
        _symbol: &str,
        _start: SystemTime,
        _end: SystemTime,
        _fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        // The free plan of Metal Price API does not support historical data
        Ok(vec![])
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        _start: SystemTime,
        _end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        // The free plan of Metal Price API does not support historical data
        Ok((vec![], symbols_with_currencies.to_vec()))
    }
}
