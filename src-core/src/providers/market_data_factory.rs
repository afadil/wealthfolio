use super::market_data_provider::MarketDataProvider;
use super::yahoo_provider::YahooProvider;
use std::sync::Arc;

pub struct MarketDataFactory;

pub const DEFAULT_PROVIDER: &str = "YAHOO";

impl MarketDataFactory {
    pub async fn get_provider(data_source: Option<&str>) -> Arc<dyn MarketDataProvider> {
        match data_source.unwrap_or(DEFAULT_PROVIDER) {
            "YAHOO" => Arc::new(
                YahooProvider::new()
                    .await
                    .expect("Failed to initialize YahooProvider"),
            ),
            _ => panic!("Unsupported data source"),
        }
    }
}
