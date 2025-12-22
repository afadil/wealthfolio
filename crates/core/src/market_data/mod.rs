//! Market data module - domain models, services, and traits.

mod market_data_constants;
mod market_data_errors;
mod market_data_model;
mod market_data_service;
mod market_data_traits;
pub(crate) mod providers;
mod quote_sync_state_model;
mod quote_sync_state_traits;

// Re-export the public interface
pub use market_data_constants::*;
pub use market_data_model::{
    DataSource, ImportValidationStatus, LatestQuotePair, MarketDataProviderInfo,
    MarketDataProviderSetting, Quote, QuoteImport, QuoteRequest, QuoteSummary,
    UpdateMarketDataProviderSetting,
};
pub use market_data_service::MarketDataService;
pub use market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};

// Re-export provider types
pub use providers::market_data_provider::{AssetProfiler, MarketDataProvider};

// Re-export error types for convenience
pub use market_data_errors::MarketDataError;

// Re-export quote sync state types
pub use quote_sync_state_model::{QuoteSyncState, QuoteSyncStateUpdate, SyncCategory, SymbolSyncPlan};
pub use quote_sync_state_traits::QuoteSyncStateRepositoryTrait;
