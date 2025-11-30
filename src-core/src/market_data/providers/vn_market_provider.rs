use std::sync::Arc;
use std::time::SystemTime;

use async_trait::async_trait;
use chrono::Utc;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use tokio::sync::RwLock;

use crate::market_data::market_data_errors::MarketDataError;
use crate::market_data::{
    market_data_model::{DataSource, Quote},
    AssetProfiler, MarketDataProvider,
    providers::models::AssetProfile,
    QuoteSummary,
};
use crate::vn_market::{
    cache::VnAssetType,
    service::VnMarketService,
};

type DbPool = Pool<ConnectionManager<SqliteConnection>>;

/// Vietnamese market provider using native Rust clients
pub struct VnMarketProvider {
    service: Arc<RwLock<VnMarketService>>,
    initialized: Arc<RwLock<bool>>,
}

impl VnMarketProvider {
    /// Create a new VN Market Provider without historical cache
    pub fn new() -> Self {
        Self {
            service: Arc::new(RwLock::new(VnMarketService::new())),
            initialized: Arc::new(RwLock::new(false)),
        }
    }

    /// Create a new VN Market Provider with historical cache (DB-backed)
    pub fn with_pool(pool: DbPool) -> Self {
        Self {
            service: Arc::new(RwLock::new(VnMarketService::with_pool(pool))),
            initialized: Arc::new(RwLock::new(false)),
        }
    }

    /// Ensure service is initialized before use
    async fn ensure_initialized(&self) -> Result<(), MarketDataError> {
        let mut initialized = self.initialized.write().await;
        if !*initialized {
            let service = self.service.write().await;
            service.initialize().await
                .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;
            *initialized = true;
        }
        Ok(())
    }

    /// Search for assets by query
    async fn search_assets(&self, query: &str) -> Result<Vec<SearchAsset>, MarketDataError> {
        self.ensure_initialized().await?;
        
        let service = self.service.read().await;
        let results = service.search(query).await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        Ok(results.into_iter().map(|r| SearchAsset {
            symbol: r.symbol,
            name: r.name,
            asset_type: r.asset_type,
            exchange: r.exchange,
        }).collect())
    }

    async fn get_historical_quotes_internal(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        _fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        self.ensure_initialized().await?;

        // Convert SystemTime to NaiveDate
        let start_date = chrono::DateTime::<Utc>::from(start).date_naive();
        let end_date = chrono::DateTime::<Utc>::from(end).date_naive();

        let service = self.service.read().await;
        let historical = service.get_history(symbol, start_date, end_date).await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        Ok(historical.into_iter().map(|record| {
            Quote {
                id: format!("hist_{}_{}", symbol, record.date),
                symbol: symbol.to_string(),
                timestamp: record.date.and_time(chrono::NaiveTime::MIN).and_utc(),
                open: record.open,
                high: record.high,
                low: record.low,
                close: record.close,
                adjclose: record.close, // VN market doesn't have adjusted close
                volume: record.volume,
                currency: record.currency,
                data_source: DataSource::VnMarket,
                created_at: Utc::now(),
            }
        }).collect())
    }
}

#[async_trait]
impl MarketDataProvider for VnMarketProvider {
    fn name(&self) -> &'static str {
        "VN_MARKET"
    }

    fn priority(&self) -> u8 {
        2 // Between Yahoo (1) and Alpha Vantage (3)
    }

    async fn get_latest_quote(&self, symbol: &str, _fallback_currency: String) -> Result<Quote, MarketDataError> {
        self.ensure_initialized().await?;

        let service = self.service.read().await;
        let cached_quote = service.get_latest_quote(symbol).await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;

        Ok(Quote {
            id: format!("quote_{}", symbol),
            symbol: symbol.to_string(),
            timestamp: cached_quote.date.and_time(chrono::NaiveTime::MIN).and_utc(),
            open: cached_quote.open,
            high: cached_quote.high,
            low: cached_quote.low,
            close: cached_quote.close,
            adjclose: cached_quote.close,
            volume: cached_quote.volume,
            currency: cached_quote.currency,
            data_source: DataSource::VnMarket,
            created_at: Utc::now(),
        })
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        self.get_historical_quotes_internal(symbol, start, end, fallback_currency).await
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<Quote>, Vec<(String, String)>), MarketDataError> {
        let mut results = Vec::new();
        let mut failed_symbols = Vec::new();

        for (symbol, _currency) in symbols_with_currencies {
            match self.get_historical_quotes_internal(symbol, start, end, "VND".to_string()).await {
                Ok(historical_quotes) => {
                    results.extend(historical_quotes);
                }
                Err(e) => {
                    failed_symbols.push((symbol.clone(), _currency.clone()));
                    eprintln!("Failed to fetch historical data for {}: {}", symbol, e);
                }
            }
        }

        Ok((results, failed_symbols))
    }
}

#[async_trait]
impl AssetProfiler for VnMarketProvider {
    async fn search_ticker(&self, query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        let search_results = self.search_assets(query).await?;

        Ok(search_results.into_iter().map(|asset| {
            QuoteSummary {
                symbol: asset.symbol,
                short_name: asset.name.clone(),
                quote_type: asset_type_to_string(&asset.asset_type),
                index: "".to_string(),
                score: 100.0,
                type_display: asset_type_to_string(&asset.asset_type),
                long_name: asset.name,
                exchange: asset.exchange,
            }
        }).collect())
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let search_results = self.search_assets(symbol).await?;

        // Find exact match or first result
        let asset = search_results.iter()
            .find(|a| a.symbol == symbol)
            .cloned()
            .or_else(|| search_results.first().cloned())
            .ok_or_else(|| MarketDataError::NotFound(symbol.to_string()))?;

        Ok(AssetProfile {
            id: Some(asset.symbol.clone()),
            isin: None,
            name: Some(asset.name.clone()),
            asset_type: Some(asset_type_to_string(&asset.asset_type)),
            symbol: asset.symbol,
            symbol_mapping: None,
            asset_class: Some(asset_type_to_string(&asset.asset_type)),
            asset_sub_class: Some(asset.exchange.clone()),
            notes: None,
            countries: Some("Vietnam".to_string()),
            categories: None,
            classes: None,
            attributes: None,
            currency: "VND".to_string(),
            data_source: "VN_MARKET".to_string(),
            sectors: None,
            url: None,
        })
    }
}

/// Helper struct for search results
#[derive(Clone, Debug)]
struct SearchAsset {
    symbol: String,
    name: String,
    asset_type: VnAssetType,
    exchange: String,
}

/// Convert VnAssetType to string
fn asset_type_to_string(asset_type: &VnAssetType) -> String {
    match asset_type {
        VnAssetType::Stock => "EQUITY".to_string(),
        VnAssetType::Index => "INDEX".to_string(),
        VnAssetType::Fund => "FUND".to_string(),
        VnAssetType::Gold => "COMMODITY".to_string(),
    }
}

impl Default for VnMarketProvider {
    fn default() -> Self {
        Self::new()
    }
}
