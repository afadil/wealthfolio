//! Market data models
//!
//! This module contains the core data types for market data operations:
//! - `types` - Type aliases for common identifiers (ProviderId, Mic, Currency, ProviderSymbol)
//! - `instrument` - Canonical instrument identity (InstrumentId) and AssetKind enum
//! - `provider_params` - Provider-specific instrument parameters (ProviderInstrument, ProviderOverrides)
//! - `quote` - Quote data structures (Quote, QuoteContext)
//! - `profile` - Asset profile data (AssetProfile)
//! - `coverage` - Provider market coverage restrictions (Coverage)
//! - `search` - Search result data (SearchResult)

mod coverage;
mod instrument;
mod profile;
mod provider_params;
mod quote;
mod search;
mod types;

pub use coverage::Coverage;
pub use instrument::{AssetKind, InstrumentId, InstrumentKind};
pub use profile::AssetProfile;
pub use provider_params::{ProviderInstrument, ProviderOverrides};
pub use quote::{Quote, QuoteContext};
pub use search::SearchResult;
pub use types::{Currency, Mic, ProviderId, ProviderSymbol};
