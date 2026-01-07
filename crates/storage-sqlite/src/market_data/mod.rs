//! SQLite storage implementation for market data.

mod model;
mod quote_sync_state_repository;
mod repository;

pub use model::{
    MarketDataProviderSettingDB, QuoteDB, QuoteSyncStateDB, QuoteSyncStateUpdateDB,
    UpdateMarketDataProviderSettingDB,
};
pub use quote_sync_state_repository::QuoteSyncStateRepository;

// Re-export trait from core for convenience
pub use repository::MarketDataRepository;
pub use wealthfolio_core::quotes::SyncStateStore;
