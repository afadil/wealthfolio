pub(crate) mod market_data_constants;
pub(crate) mod market_data_errors;
pub(crate) mod market_data_model;
pub(crate) mod market_data_repository;
pub(crate) mod market_data_service;
pub(crate) mod market_data_traits;
pub(crate) mod providers;

// Re-export the public interface
pub use market_data_constants::*;
pub use market_data_model::{Quote, QuoteSummary, QuoteRequest, DataSource, MarketDataProviderInfo, MarketDataProviderSetting};
pub use market_data_repository::MarketDataRepository;
pub use market_data_service::MarketDataService;
pub use market_data_traits::MarketDataServiceTrait;

// Re-export provider types
pub use providers::market_data_provider::{MarketDataProvider, AssetProfiler};

// Re-export error types for convenience
pub use market_data_errors::MarketDataError;
