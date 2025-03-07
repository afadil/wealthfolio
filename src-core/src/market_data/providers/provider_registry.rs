use std::sync::Arc;

use crate::market_data::providers::market_data_provider::{MarketDataProvider, AssetProfiler};
use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::DataSource;
use super::{yahoo_provider::YahooProvider, manual_provider::ManualProvider};

pub struct ProviderRegistry {
    yahoo: Arc<YahooProvider>,
    manual: Arc<ManualProvider>,
}

impl ProviderRegistry {
    pub async fn new() -> Result<Self, MarketDataError> {
        Ok(Self {
            yahoo: Arc::new(YahooProvider::new().await?),
            manual: Arc::new(ManualProvider::new()?),
        })
    }

    pub fn get_provider(&self, source: DataSource) -> Arc<dyn MarketDataProvider> {
        match source {
            DataSource::Yahoo => self.yahoo.clone(),
            DataSource::Manual => panic!("Manual provider does not support market data operations"),
        }
    }

    pub fn get_profiler(&self, source: DataSource) -> Arc<dyn AssetProfiler> {
        match source {
            DataSource::Manual => self.manual.clone(),
            DataSource::Yahoo => self.yahoo.clone(),
        }
    }

    pub fn default_provider(&self) -> Arc<dyn MarketDataProvider> {
        self.yahoo.clone()
    }
} 