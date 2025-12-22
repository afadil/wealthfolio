pub(crate) mod market_data_constants;
pub(crate) mod market_data_errors;
pub mod market_data_model;
pub(crate) mod market_data_repository;
pub(crate) mod market_data_service;
pub(crate) mod market_data_traits;
pub(crate) mod providers;
pub mod quote_sync_state_model;
pub(crate) mod quote_sync_state_repository;

// Re-export the public interface
pub use market_data_constants::*;
pub use market_data_model::{
    DataSource, ImportValidationStatus, MarketDataProviderInfo, MarketDataProviderSetting, Quote,
    QuoteImport, QuoteRequest, QuoteSummary,
};
pub use market_data_repository::MarketDataRepository;
pub use market_data_service::MarketDataService;
pub use market_data_traits::MarketDataServiceTrait;

// Re-export provider types
pub use providers::market_data_provider::{AssetProfiler, MarketDataProvider};

// Re-export error types for convenience
pub use market_data_errors::MarketDataError;

// Re-export quote sync state types
pub use quote_sync_state_model::{QuoteSyncState, SyncCategory, SymbolSyncPlan};
pub use quote_sync_state_repository::{QuoteSyncStateRepository, QuoteSyncStateRepositoryTrait};
