//! Wealthfolio Market Data Crate
//!
//! This crate provides provider-agnostic market data fetching capabilities
//! for the Wealthfolio application.
//!
//! # Overview
//!
//! The market data crate supports:
//! - Multiple asset types: equities, crypto, FX, precious metals
//! - Multiple providers: Yahoo Finance, Alpha Vantage, etc.
//! - Provider-agnostic instrument resolution
//! - Rate limiting and circuit breaking
//!
//! # Architecture
//!
//! ```text
//! +------------------+     +------------------+
//! |   Domain Layer   | --> |  InstrumentId    |  (canonical identity)
//! +------------------+     +------------------+
//!                                  |
//!                                  v
//!                          +------------------+
//!                          |    Resolver      |  (chain of responsibility)
//!                          +------------------+
//!                                  |
//!                                  v
//!                         +-------------------+
//!                         | ProviderInstrument|  (provider-specific)
//!                         +-------------------+
//!                                  |
//!                                  v
//!                          +------------------+
//!                          |    Provider      |  (Yahoo, AlphaVantage, etc.)
//!                          +------------------+
//!                                  |
//!                                  v
//!                          +------------------+
//!                          |     Quote        |  (market data)
//!                          +------------------+
//! ```
//!
//! # Core Types
//!
//! - [`InstrumentId`] - Provider-agnostic instrument identifier
//! - [`ProviderInstrument`] - Provider-specific lookup parameters
//! - [`Quote`] - Market data quote with OHLCV data
//! - [`QuoteContext`] - Request context including overrides and preferences
//! - [`AssetProfile`] - Provider-sourced profile data (sector, industry, etc.)
//! - [`AssetKind`] - Classification of asset types
//!
//! # Type Aliases
//!
//! - [`ProviderId`] - Provider identifier (e.g., "YAHOO", "ALPHA_VANTAGE")
//! - [`Mic`] - Market Identifier Code (ISO 10383)
//! - [`Currency`] - Currency code (ISO 4217)
//! - [`ProviderSymbol`] - Provider-specific symbol string

pub mod errors;
pub mod models;
pub mod provider;
pub mod resolver;

// Re-export all public types from models
pub use models::{
    AssetKind, AssetProfile, Currency, InstrumentId, Mic, ProviderId, ProviderInstrument,
    ProviderOverrides, ProviderSymbol, Quote, QuoteContext,
};

// Re-export resolver types
pub use resolver::{
    strip_yahoo_suffix, yahoo_exchange_to_mic, AssetResolver, ExchangeMap, ExchangeSuffix,
    ResolutionSource, ResolvedInstrument, Resolver, ResolverChain, RulesResolver, SymbolResolver,
    YAHOO_EXCHANGE_SUFFIXES,
};

// Re-export provider types
pub use provider::marketdata_app::MarketDataAppProvider;
pub use provider::{MarketDataProvider, ProviderCapabilities, RateLimit};
