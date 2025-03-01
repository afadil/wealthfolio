use crate::assets::NewAsset;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::market_data_provider::AssetProfiler;
use crate::market_data::market_data_errors::MarketDataError;
pub struct ManualProvider;

impl ManualProvider {
    pub fn new() -> Result<Self, MarketDataError> {
        Ok(ManualProvider)
    }
}

#[async_trait::async_trait]
impl AssetProfiler for ManualProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<NewAsset, MarketDataError> {
        Ok(NewAsset {
            id: Some(symbol.to_string()),
            isin: None,
            name: Some(symbol.to_string()),
            asset_type: Some("Equity".to_string()),
            symbol: symbol.to_string(),
            data_source: DataSource::Manual.as_str().to_string(),
            ..Default::default()
        })
    }
}