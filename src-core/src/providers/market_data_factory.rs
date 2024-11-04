use super::market_data_provider::MarketDataProvider;
use super::yahoo_provider::YahooProvider;
use crate::providers::market_data_provider::MarketDataProviderType;
use crate::providers::private_market_provider;
use std::sync::Arc;

pub struct MarketDataFactory;


pub const DEFAULT_MARKET_DATA_PROVIDER: MarketDataProviderType = MarketDataProviderType::Yahoo;

impl MarketDataFactory {
    pub async fn get_provider(data_source: MarketDataProviderType) -> Arc<dyn MarketDataProvider> {
        match data_source{
            MarketDataProviderType::Yahoo => Arc::new(
                YahooProvider::new()
                    .await
                    .expect("Failed to initialize YahooProvider"),
            ),
            MarketDataProviderType::Private => Arc::new(
                private_market_provider::PrivateMarketProvider::new()
                    .expect("Failed to initialize PrivateMarketProvider"),
            )
        }
    }
}
