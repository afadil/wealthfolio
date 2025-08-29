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
    #[allow(dead_code)]
    base: String,
    #[allow(dead_code)]
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
        let (name, asset_type, description, categories, attributes) = match symbol {
            "XAU" => (
                "Gold", 
                "Commodity", 
                "Gold is a precious metal and one of the most sought-after commodities in the world. It has been used as a store of value and medium of exchange for thousands of years.",
                "Precious Metals,Physical Commodities",
                "Safe Haven,Inflation Hedge,Store of Value"
            ),
            "XAG" => (
                "Silver", 
                "Commodity",
                "Silver is a precious metal with both industrial and investment applications. It is widely used in electronics, solar panels, and jewelry.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Industrial Use,Safe Haven,Inflation Hedge"
            ), 
            "XPT" => (
                "Platinum", 
                "Commodity",
                "Platinum is a rare precious metal primarily used in automotive catalysts, jewelry, and industrial applications. It is rarer than gold.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Industrial Use,Automotive Industry,Rare Metal"
            ),
            "XPD" => (
                "Palladium", 
                "Commodity",
                "Palladium is a precious metal primarily used in automotive catalytic converters and electronics. It has significant industrial demand.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Automotive Industry,Industrial Use,Electronics"
            ),
            "XRH" => (
                "Rhodium", 
                "Commodity",
                "Rhodium is one of the rarest and most expensive precious metals. It is primarily used in automotive catalytic converters.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Automotive Industry,Rare Metal,Industrial Use"
            ),
            "XRU" => (
                "Ruthenium", 
                "Commodity",
                "Ruthenium is a rare precious metal of the platinum group, used in electronics and chemical applications.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Electronics,Chemical Industry,Rare Metal"
            ),
            "XIR" => (
                "Iridium", 
                "Commodity",
                "Iridium is one of the rarest elements on Earth and is highly resistant to corrosion. It is used in specialized industrial applications.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Industrial Use,Rare Metal,Corrosion Resistant"
            ),
            "XOS" => (
                "Osmium", 
                "Commodity",
                "Osmium is the densest naturally occurring element and is used in specialized applications requiring extreme hardness.",
                "Precious Metals,Industrial Metals,Physical Commodities",
                "Industrial Use,Rare Metal,Specialized Applications"
            ),
            _ => return Err(MarketDataError::NotFound(symbol.to_string())),
        };

        Ok(AssetProfile {
            id: Some(symbol.to_string()),
            isin: None, // Precious metals typically don't have ISIN codes
            name: Some(name.to_string()),
            asset_type: Some(asset_type.to_string()),
            symbol: symbol.to_string(),
            symbol_mapping: None,
            asset_class: Some("Commodity".to_string()),
            asset_sub_class: Some("Precious Metal".to_string()),
            notes: Some(description.to_string()),
            countries: Some("Global".to_string()), // Precious metals are global commodities
            categories: Some(categories.to_string()),
            classes: Some("Physical Commodity".to_string()),
            attributes: Some(attributes.to_string()),
            currency: "USD".to_string(),
            data_source: "METAL_PRICE_API".to_string(),
            sectors: Some("Materials,Commodities".to_string()),
            url: Some(format!("https://api.metalpriceapi.com/metals/{}", symbol.to_lowercase())),
        })
    }

    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        let query = query.to_lowercase();
        let mut results = Vec::new();

        // Helper function to calculate search score
        let calculate_score = |name: &str, symbol: &str, query: &str| -> f64 {
            let name_lower = name.to_lowercase();
            let symbol_lower = symbol.to_lowercase();
            
            if query == symbol_lower { return 1.0; } // Exact symbol match
            if query == name_lower { return 0.9; }   // Exact name match
            if symbol_lower.starts_with(query) { return 0.8; } // Symbol starts with query
            if name_lower.starts_with(query) { return 0.7; }   // Name starts with query
            if symbol_lower.contains(query) { return 0.6; }    // Symbol contains query
            if name_lower.contains(query) { return 0.5; }      // Name contains query
            0.0 // No match
        };

        // Gold - check if "gold" or "xau" contains the query
        if "gold".contains(&query) || "xau".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XAU".to_string(),
                long_name: "Gold".to_string(),
                short_name: "Gold".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "Metal Price Api".to_string(),
                index: "".to_string(),
                score: calculate_score("gold", "xau", &query),
                type_display: "".to_string(),
            });
        }

        // Silver - check if "silver" or "xag" contains the query
        if "silver".contains(&query) || "xag".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XAG".to_string(),
                long_name: "Silver".to_string(),
                short_name: "Silver".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "Metal Price Api".to_string(),
                index: "".to_string(),
                score: calculate_score("silver", "xag", &query),
                type_display: "".to_string(),
            });
        }

        // Platinum - check if "platinum" or "xpt" contains the query
        if "platinum".contains(&query) || "xpt".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XPT".to_string(),
                long_name: "Platinum".to_string(),
                short_name: "Platinum".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "Metal Price Api".to_string(),
                index: "".to_string(),
                score: calculate_score("platinum", "xpt", &query),
                type_display: "".to_string(),
            });
        }

        // Palladium - check if "palladium" or "xpd" contains the query
        if "palladium".contains(&query) || "xpd".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XPD".to_string(),
                long_name: "Palladium".to_string(),
                short_name: "Palladium".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "Metal Price Api".to_string(),
                index: "".to_string(),
                score: calculate_score("palladium", "xpd", &query),
                type_display: "".to_string(),
            });
        }

        // Rhodium - check if "rhodium" or "xrh" contains the query
        if "rhodium".contains(&query) || "xrh".contains(&query) {
            results.push(QuoteSummary {
                symbol: "XRH".to_string(),
                long_name: "Rhodium".to_string(),
                short_name: "Rhodium".to_string(),
                quote_type: "Commodity".to_string(),
                exchange: "Metal Price Api".to_string(),
                index: "".to_string(),
                score: calculate_score("rhodium", "xrh", &query),
                type_display: "".to_string(),
            });
        }

        // Sort results by score (highest first)
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

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
        // Validate that this provider supports the requested symbol
        match symbol {
            "XAU" | "XAG" | "XPT" | "XPD" | "XRH" | "XRU" | "XIR" | "XOS" => {},
            _ => return Err(MarketDataError::NotFound(symbol.to_string())),
        }

        let url = format!(
            "https://api.metalpriceapi.com/v1/latest?api_key={}&base=USD&currencies={}",
            self.api_key,
            symbol
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
        
        // API returns the rate as: 1 USD = rate troy ounces of metal
        // So to get price per troy ounce in USD: price = 1 / rate
        if *rate == 0.0 {
            return Err(MarketDataError::ProviderError(format!("Invalid rate (zero) for symbol: {}", symbol)));
        }
        
        let price = Decimal::from_f64(1.0 / *rate)
            .ok_or_else(|| MarketDataError::ProviderError(format!("Failed to convert rate to decimal for symbol: {}", symbol)))?;

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
