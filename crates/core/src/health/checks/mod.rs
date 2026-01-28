//! Health check implementations.
//!
//! This module contains the individual health check implementations:
//! - Price staleness check
//! - Quote sync error check
//! - FX integrity check
//! - Classification completeness check
//! - Data consistency check
//! - Account configuration check

pub mod account_configuration;
pub mod classification;
pub mod data_consistency;
pub mod fx_integrity;
pub mod price_staleness;
pub mod quote_sync;

// Re-export check implementations
pub use account_configuration::AccountConfigurationCheck;
pub use classification::ClassificationCheck;
pub use data_consistency::DataConsistencyCheck;
pub use fx_integrity::FxIntegrityCheck;
pub use price_staleness::PriceStalenessCheck;
pub use quote_sync::QuoteSyncCheck;

// Re-export data types used by checks
pub use account_configuration::UnconfiguredAccountInfo;
pub use classification::{LegacyMigrationInfo, UnclassifiedAssetInfo};
pub use data_consistency::{ConsistencyIssueInfo, ConsistencyIssueType};
pub use fx_integrity::FxPairInfo;
pub use price_staleness::AssetHoldingInfo;
pub use quote_sync::QuoteSyncErrorInfo;

// Re-export data gathering functions
pub use classification::gather_legacy_migration_status;
pub use quote_sync::gather_quote_sync_errors;
