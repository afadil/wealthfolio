use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::market_data_provider::AssetProfiler;
use crate::market_data::QuoteSummary;

use super::models::AssetProfile;
pub struct ManualProvider;

impl ManualProvider {
    pub fn new() -> Result<Self, MarketDataError> {
        Ok(ManualProvider)
    }
}

#[async_trait::async_trait]
impl AssetProfiler for ManualProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        if symbol.starts_with("$CASH-") {
            Ok(AssetProfile {
                id: Some(symbol.to_string()),
                isin: None,
                name: Some(symbol.to_string()),
                asset_type: Some("CASH".to_string()),
                asset_class: Some("CASH".to_string()),
                asset_sub_class: Some("CASH".to_string()),
                symbol: symbol.to_string(),
                data_source: DataSource::Manual.as_str().to_string(),
                currency: symbol[6..].to_string(),
                ..Default::default()
            })
        } else {
            Ok(AssetProfile {
                id: Some(symbol.to_string()),
                isin: None,
                name: Some(symbol.to_string()),
                asset_type: Some("EQUITY".to_string()),
                symbol: symbol.to_string(),
                data_source: DataSource::Manual.as_str().to_string(),
                ..Default::default()
            })
        }
    }

    async fn search_ticker(&self, _query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        Ok(vec![])
    }
}
