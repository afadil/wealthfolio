use super::market_data_provider::MarketDataProvider;
use super::yahoo_provider::YahooProvider;
use crate::providers::manual_provider;
use crate::providers::market_data_provider::MarketDataProviderType;
use crate::providers::market_data_provider::AssetProfiler;
use std::sync::Arc;

pub struct MarketDataFactory;

pub const DEFAULT_MARKET_DATA_PROVIDER: MarketDataProviderType = MarketDataProviderType::Yahoo;

impl MarketDataFactory {
    pub async fn get_public_data_provider() -> Arc<dyn MarketDataProvider> {
        Arc::new(
            YahooProvider::new()
                .await
                .expect("Failed to initialize Yahoo Market Data Provider"),
        )
    }

    pub async fn get_private_asset_profiler() -> Arc<dyn AssetProfiler> {
        Arc::new(
            manual_provider::ManualProvider::new()
                .expect("Failed to initialize Private Asset Profiler"),
        )
    }
}
