//! Health check implementations.
//!
//! This module contains the individual health check implementations:
//! - Price staleness check
//! - FX integrity check
//! - Classification completeness check
//! - Data consistency check

pub mod classification;
pub mod data_consistency;
pub mod fx_integrity;
pub mod price_staleness;

// Re-export check implementations
pub use classification::ClassificationCheck;
pub use data_consistency::DataConsistencyCheck;
pub use fx_integrity::FxIntegrityCheck;
pub use price_staleness::PriceStalenessCheck;

// Re-export data types used by checks
pub use classification::UnclassifiedAssetInfo;
pub use data_consistency::{ConsistencyIssueInfo, ConsistencyIssueType};
pub use fx_integrity::FxPairInfo;
pub use price_staleness::AssetHoldingInfo;
