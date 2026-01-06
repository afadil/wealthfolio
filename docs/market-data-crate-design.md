# Market Data Crate Design

> A standalone, multi-provider market data crate for Wealthfolio

## Overview

This document describes the design of `wealthfolio-market-data`, a new crate that provides:

- **Canonical instrument representation** independent of any provider
- **Symbol resolution** from canonical → provider-specific formats
- **Multi-provider orchestration** with fallback, rate limiting, and circuit breaking
- **Time-aware quote handling** for proper FX/crypto/equity alignment
- **Data validation gates** to prevent garbage data from poisoning the system

## Goals

1. **Provider agnostic domain model** - Core business logic never sees `.L` vs `.LON`
2. **Easy provider addition** - New providers implement a simple trait, no suffix logic
3. **Reliability** - Circuit breakers, rate limiting, retries with backoff
4. **Correctness** - Time semantics, OHLC validation, staleness detection
5. **Testability** - Providers are stateless HTTP wrappers, easily mocked

## Non-Goals

1. Real-time streaming (future consideration)
2. Options/derivatives (future consideration)
3. Fundamental data beyond basic profiles

---

## Crate Structure

```
crates/
└── market-data/
    ├── Cargo.toml
    └── src/
        ├── lib.rs
        │
        ├── models/
        │   ├── mod.rs
        │   ├── instrument.rs      # InstrumentId, canonical representation
        │   ├── provider_params.rs # ProviderInstrument, provider-specific
        │   ├── quote.rs           # Quote with time semantics
        │   ├── profile.rs         # AssetProfile, InstrumentCandidate
        │   └── types.rs           # Mic, Currency, ProviderId, ProviderSymbol
        │
        ├── errors/
        │   ├── mod.rs
        │   └── retry.rs           # RetryClass, error classification
        │
        ├── resolver/
        │   ├── mod.rs
        │   ├── traits.rs          # Resolver, SymbolResolver traits
        │   ├── chain.rs           # ResolverChain composite
        │   ├── db_resolver.rs     # Database-backed (instrument master)
        │   ├── rules_resolver.rs  # Deterministic MIC→suffix rules
        │   ├── discovery.rs       # Provider search-based discovery
        │   └── exchange_map.rs    # MIC → provider suffix mappings
        │
        ├── provider/
        │   ├── mod.rs
        │   ├── traits.rs          # MarketDataProvider, AssetProfiler traits
        │   ├── capabilities.rs    # ProviderCapabilities, RateLimit
        │   │
        │   ├── yahoo/
        │   │   ├── mod.rs
        │   │   └── client.rs
        │   │
        │   ├── alpha_vantage/
        │   │   ├── mod.rs
        │   │   ├── client.rs
        │   │   └── endpoints.rs   # time_series, fx, crypto
        │   │
        │   ├── marketdata_app/
        │   │   └── ...
        │   │
        │   └── metal_price_api/
        │       └── ...
        │
        ├── registry/
        │   ├── mod.rs
        │   ├── registry.rs        # ProviderRegistry orchestration
        │   ├── rate_limiter.rs    # Token bucket rate limiting
        │   ├── circuit_breaker.rs # Per-provider circuit breaker
        │   └── validator.rs       # Data validation gates
        │
        └── time/
            ├── mod.rs
            ├── session.rs         # SessionType, trading hours
            └── bar_time.rs        # BarTimeMeaning, normalization

```

### Database Tables (in storage-sqlite)

The instrument master tables will live in the existing SQLite database:

```
instruments              # Canonical instrument identity
provider_mappings        # Provider-specific symbol mappings
instrument_aliases       # ISIN, FIGI, CUSIP lookups
```

---

## Core Models

### 1. Type Aliases

```rust
// models/types.rs

use std::borrow::Cow;
use std::sync::Arc;

/// Provider identifier - mostly static constants
pub type ProviderId = Cow<'static, str>;

/// Market Identifier Code (ISO 10383) - mostly static
pub type Mic = Cow<'static, str>;

/// Currency code (ISO 4217) - mostly static
pub type Currency = Cow<'static, str>;

/// Provider-specific symbol discovered at runtime
pub type ProviderSymbol = Arc<str>;
```

### 2. Canonical Instrument Representation

```rust
// models/instrument.rs

use super::types::{Mic, Currency};
use std::sync::Arc;

/// Canonical instrument identifier, independent of any provider.
/// This is what the domain layer works with.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub enum InstrumentId {
    /// Exchange-traded equity/ETF/fund
    Equity {
        /// Canonical ticker without exchange suffix (e.g., "TSCO", "ASML")
        ticker: Arc<str>,
        /// ISO 10383 Market Identifier Code (e.g., "XLON", "XAMS")
        mic: Option<Mic>,
    },

    /// Cryptocurrency pair
    Crypto {
        /// Base asset (e.g., "BTC", "ETH")
        base: Arc<str>,
        /// Quote currency (e.g., "USD", "EUR")
        quote: Currency,
    },

    /// Foreign exchange pair
    Fx {
        /// Base currency (e.g., "EUR")
        base: Currency,
        /// Quote currency (e.g., "USD")
        quote: Currency,
    },

    /// Precious metal
    Metal {
        /// Metal code (e.g., "XAU", "XAG")
        code: Arc<str>,
        /// Quote currency
        quote: Currency,
    },

    /// Index (non-tradeable, for reference)
    Index {
        /// Index symbol (e.g., "SPX", "FTSE")
        symbol: Arc<str>,
        /// Provider hint for index
        provider_hint: Option<ProviderId>,
    },
}

/// Asset classification for routing and capabilities
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum AssetKind {
    Equity,
    Crypto,
    Fx,
    Metal,
    Index,
    // Future: Bond, Option, Future, Fund
}

impl InstrumentId {
    pub fn kind(&self) -> AssetKind {
        match self {
            Self::Equity { .. } => AssetKind::Equity,
            Self::Crypto { .. } => AssetKind::Crypto,
            Self::Fx { .. } => AssetKind::Fx,
            Self::Metal { .. } => AssetKind::Metal,
            Self::Index { .. } => AssetKind::Index,
        }
    }

    /// Returns a display-friendly canonical symbol
    pub fn canonical_symbol(&self) -> String {
        match self {
            Self::Equity { ticker, mic } => {
                match mic {
                    Some(m) => format!("{}:{}", m, ticker),
                    None => ticker.to_string(),
                }
            }
            Self::Crypto { base, quote } => format!("{}/{}", base, quote),
            Self::Fx { base, quote } => format!("{}/{}", base, quote),
            Self::Metal { code, quote } => format!("{}/{}", code, quote),
            Self::Index { symbol, .. } => symbol.to_string(),
        }
    }
}
```

### 3. Provider-Specific Parameters

```rust
// models/provider_params.rs

use super::types::{Currency, ProviderSymbol};

/// Provider-specific instrument parameters.
/// This is what the resolver produces and providers consume.
/// Providers pattern-match on this - no suffix parsing needed.
#[derive(Clone, Debug)]
pub enum ProviderInstrument {
    /// Equity symbol with provider-specific suffix
    /// Yahoo: "TSCO.L", AlphaVantage: "TSCO.LON"
    EquitySymbol {
        symbol: ProviderSymbol,
    },

    /// Crypto pair for providers that separate base/quote
    /// AlphaVantage: symbol="BTC", market="USD"
    CryptoPair {
        symbol: ProviderSymbol,
        market: Currency,
    },

    /// Combined crypto symbol for providers that use single string
    /// Yahoo: "BTC-USD"
    CryptoSymbol {
        symbol: ProviderSymbol,
    },

    /// FX pair with from/to
    /// AlphaVantage: from_symbol="EUR", to_symbol="USD"
    FxPair {
        from_symbol: Currency,
        to_symbol: Currency,
    },

    /// Combined FX symbol
    /// Yahoo: "EURUSD=X"
    FxSymbol {
        symbol: ProviderSymbol,
    },

    /// Metal symbol
    /// MetalPriceAPI: "XAU"
    MetalSymbol {
        symbol: ProviderSymbol,
        quote: Currency,
    },
}
```

### 4. Quote Context

```rust
// models/quote.rs (context part)

use super::instrument::{InstrumentId, AssetKind};
use super::types::Currency;

/// Request context passed through the system.
/// Contains the canonical instrument plus any hints.
#[derive(Clone, Debug)]
pub struct QuoteContext {
    /// The canonical instrument
    pub instrument: InstrumentId,

    /// Derived asset kind (for convenience)
    pub kind: AssetKind,

    /// Currency hint for equities (from user or previous fetch)
    pub currency_hint: Option<Currency>,

    /// Request ID for tracing/logging
    pub request_id: Option<String>,
}

impl QuoteContext {
    pub fn new(instrument: InstrumentId) -> Self {
        let kind = instrument.kind();
        Self {
            instrument,
            kind,
            currency_hint: None,
            request_id: None,
        }
    }

    pub fn with_currency_hint(mut self, currency: Currency) -> Self {
        self.currency_hint = Some(currency);
        self
    }
}
```

---

## Time Semantics

### Session Types

```rust
// time/session.rs

use crate::models::types::Mic;
use std::borrow::Cow;

/// Trading session type - critical for timestamp interpretation
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionType {
    /// 24/7 trading (crypto, FX)
    Continuous24x7,

    /// Exchange-based session with defined hours
    ExchangeSession {
        /// Market identifier code
        mic: Mic,
        /// IANA timezone (e.g., "America/New_York", "Europe/London")
        timezone: Cow<'static, str>,
        /// Typical close time in local timezone (e.g., "16:00")
        close_time: Cow<'static, str>,
    },
}

impl SessionType {
    pub fn is_continuous(&self) -> bool {
        matches!(self, Self::Continuous24x7)
    }

    // Common session types as constants
    pub const CRYPTO: Self = Self::Continuous24x7;
    pub const FX: Self = Self::Continuous24x7;

    pub fn nyse() -> Self {
        Self::ExchangeSession {
            mic: Cow::Borrowed("XNYS"),
            timezone: Cow::Borrowed("America/New_York"),
            close_time: Cow::Borrowed("16:00"),
        }
    }

    pub fn lse() -> Self {
        Self::ExchangeSession {
            mic: Cow::Borrowed("XLON"),
            timezone: Cow::Borrowed("Europe/London"),
            close_time: Cow::Borrowed("16:30"),
        }
    }

    // ... other exchanges
}
```

### Bar Timestamp Meaning

```rust
// time/bar_time.rs

/// What does the timestamp on a bar actually represent?
/// Different providers use different conventions.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BarTimeMeaning {
    /// Timestamp is bar end time in UTC
    EndTimeUtc,

    /// Timestamp is bar start time in UTC
    StartTimeUtc,

    /// Timestamp is exchange close time (local, needs timezone)
    ExchangeClose,

    /// Provider uses midnight UTC regardless of session
    ProviderMidnightUtc,

    /// Unknown - needs investigation
    Unknown,
}

/// Bar interval/timeframe
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum BarInterval {
    Daily,
    Weekly,
    Monthly,
    // Future: Minute1, Minute5, Hour1, etc.
}
```

### Enhanced Quote Model

```rust
// models/quote.rs

use crate::time::{SessionType, BarTimeMeaning, BarInterval};
use crate::models::types::{Currency, ProviderId};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

/// A price quote with full metadata
#[derive(Clone, Debug)]
pub struct Quote {
    // === Identity ===
    /// Unique quote ID (for storage)
    pub id: String,

    /// Canonical symbol for storage/lookup
    pub symbol: String,

    // === Price Data ===
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Option<Decimal>,

    /// Adjusted close (split/dividend adjusted)
    pub adj_close: Option<Decimal>,

    // === Currency ===
    pub currency: Currency,

    // === Time Semantics ===
    /// The timestamp as provided
    pub timestamp: DateTime<Utc>,

    /// What the timestamp means
    pub timestamp_meaning: BarTimeMeaning,

    /// Bar interval
    pub interval: BarInterval,

    /// Session type for this instrument
    pub session_type: SessionType,

    // === Provenance ===
    /// Which provider supplied this quote
    pub provider: ProviderId,

    /// When we fetched this quote
    pub fetched_at: DateTime<Utc>,

    // === Quality ===
    /// Data quality flags
    pub quality: QuoteQuality,
}

/// Data quality indicators
#[derive(Clone, Debug, Default)]
pub struct QuoteQuality {
    /// Quote is older than expected for this session type
    pub stale: bool,

    /// OHLC values have anomalies
    pub suspect_ohlc: bool,

    /// Large price move that might be a split/error
    pub large_move: bool,

    /// Provider returned partial data
    pub partial: bool,
}

impl Quote {
    /// Normalize timestamp to bar-end UTC convention
    pub fn normalized_timestamp(&self) -> DateTime<Utc> {
        match self.timestamp_meaning {
            BarTimeMeaning::EndTimeUtc => self.timestamp,
            BarTimeMeaning::StartTimeUtc => {
                // Add bar interval duration
                match self.interval {
                    BarInterval::Daily => self.timestamp + chrono::Duration::days(1),
                    BarInterval::Weekly => self.timestamp + chrono::Duration::weeks(1),
                    BarInterval::Monthly => {
                        // Approximate - proper impl needs calendar math
                        self.timestamp + chrono::Duration::days(30)
                    }
                }
            }
            BarTimeMeaning::ExchangeClose |
            BarTimeMeaning::ProviderMidnightUtc |
            BarTimeMeaning::Unknown => {
                // Best effort - may need session timezone info
                self.timestamp
            }
        }
    }
}
```

---

## Error Handling

### Retry Classification

```rust
// errors/retry.rs

/// Classification for retry policy decisions.
/// Registry uses this to decide: retry same provider, try next, or fail.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetryClass {
    /// Never retry - bad symbol, validation error, unsupported
    Never,

    /// Retry same provider with exponential backoff - 429, timeout, 5xx
    WithBackoff,

    /// Try next provider - this provider can't handle it but others might
    NextProvider,

    /// Retry after circuit breaker reset
    CircuitOpen,
}

impl RetryClass {
    pub fn is_retryable(&self) -> bool {
        !matches!(self, Self::Never)
    }

    pub fn should_try_next_provider(&self) -> bool {
        matches!(self, Self::NextProvider | Self::CircuitOpen)
    }
}
```

### Error Types

```rust
// errors/mod.rs

use super::retry::RetryClass;
use crate::models::types::ProviderId;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MarketDataError {
    // === Symbol/Instrument Errors (Never retry) ===
    #[error("Symbol not found: {0}")]
    SymbolNotFound(String),

    #[error("Unsupported asset type: {0}")]
    UnsupportedAssetType(String),

    #[error("Invalid symbol format: {0}")]
    InvalidSymbol(String),

    #[error("No data available for date range")]
    NoDataForRange,

    // === Provider Errors (May retry) ===
    #[error("Provider rate limited: {provider}")]
    RateLimited { provider: ProviderId },

    #[error("Provider timeout: {provider}")]
    Timeout { provider: ProviderId },

    #[error("Provider error: {provider} - {message}")]
    ProviderError { provider: ProviderId, message: String },

    #[error("Provider unavailable: {provider}")]
    ProviderUnavailable { provider: ProviderId },

    // === Circuit Breaker ===
    #[error("Circuit open for provider: {provider}")]
    CircuitOpen { provider: ProviderId },

    // === Resolution Errors ===
    #[error("Cannot resolve symbol for provider: {provider}")]
    ResolutionFailed { provider: ProviderId },

    // === Validation Errors ===
    #[error("Data validation failed: {message}")]
    ValidationFailed { message: String },

    // === System Errors ===
    #[error("No providers available for asset type")]
    NoProvidersAvailable,

    #[error("All providers failed")]
    AllProvidersFailed,

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl MarketDataError {
    /// Classify error for retry policy
    pub fn retry_class(&self) -> RetryClass {
        match self {
            // Never retry these
            Self::SymbolNotFound(_) |
            Self::UnsupportedAssetType(_) |
            Self::InvalidSymbol(_) |
            Self::NoDataForRange |
            Self::ValidationFailed { .. } |
            Self::ConfigError(_) => RetryClass::Never,

            // Retry with backoff
            Self::RateLimited { .. } |
            Self::Timeout { .. } => RetryClass::WithBackoff,

            // Try next provider
            Self::ProviderError { .. } |
            Self::ProviderUnavailable { .. } |
            Self::ResolutionFailed { .. } => RetryClass::NextProvider,

            // Circuit breaker
            Self::CircuitOpen { .. } => RetryClass::CircuitOpen,

            // Terminal
            Self::NoProvidersAvailable |
            Self::AllProvidersFailed |
            Self::Internal(_) => RetryClass::Never,
        }
    }
}

/// Bulk operation failure with context
#[derive(Debug)]
pub struct BulkFailure {
    pub context: QuoteContext,
    pub error: MarketDataError,
}

impl BulkFailure {
    pub fn retry_class(&self) -> RetryClass {
        self.error.retry_class()
    }
}
```

---

## Symbol Resolver

### Architecture: Resolver Chain

The resolver uses a **chain of responsibility** pattern with three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                      ResolverChain                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Instrument Master (DB-backed)                          │   │
│  │    - Explicit mappings with confidence scores             │   │
│  │    - Time-aware (valid_from/valid_to for renames)         │   │
│  │    - Provider independence: switch primaries trivially    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │ miss                                 │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 2. Deterministic Rules (config/code)                      │   │
│  │    - MIC → suffix mappings                                │   │
│  │    - Exchange code rules                                  │   │
│  │    - Fast fallback for known exchanges                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │ miss                                 │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 3. Discovery (provider search endpoints)                  │   │
│  │    - Proposes mappings, doesn't auto-bless                │   │
│  │    - Writes back to DB as "candidate" with provenance     │   │
│  │    - Only used if confidence threshold met                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Why this hybrid:**
- **DB** gives provider independence - switching primary provider is trivial
- **Rules** are fast fallback, cover known exchanges without preloading
- **Discovery** onboards new instruments without manual work, keeps correctness under control

### Instrument Master Schema

```sql
-- Core instrument identity (canonical)
CREATE TABLE instruments (
    id              TEXT PRIMARY KEY,           -- UUID or deterministic ID
    kind            TEXT NOT NULL,              -- 'equity', 'crypto', 'fx', 'metal', 'index'

    -- Equity fields
    ticker          TEXT,                       -- "TSCO", "ASML"
    mic             TEXT,                       -- "XLON", "XAMS" (ISO 10383)

    -- Crypto/FX fields
    base_asset      TEXT,                       -- "BTC", "EUR"
    quote_asset     TEXT,                       -- "USD"

    -- Common
    currency_hint   TEXT,                       -- Default currency for quotes
    name            TEXT,                       -- Display name

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK (
        (kind = 'equity' AND ticker IS NOT NULL) OR
        (kind IN ('crypto', 'fx') AND base_asset IS NOT NULL AND quote_asset IS NOT NULL) OR
        (kind = 'metal' AND base_asset IS NOT NULL) OR
        (kind = 'index' AND ticker IS NOT NULL)
    )
);

CREATE INDEX idx_instruments_equity ON instruments(ticker, mic) WHERE kind = 'equity';
CREATE INDEX idx_instruments_pair ON instruments(base_asset, quote_asset) WHERE kind IN ('crypto', 'fx');

-- Provider-specific mappings
CREATE TABLE provider_mappings (
    id              TEXT PRIMARY KEY,
    instrument_id   TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    provider_id     TEXT NOT NULL,              -- "YAHOO", "ALPHA_VANTAGE", etc.

    -- Provider-specific representation (JSON for flexibility)
    -- Examples:
    -- {"type": "equity_symbol", "symbol": "TSCO.L"}
    -- {"type": "crypto_pair", "symbol": "BTC", "market": "USD"}
    -- {"type": "fx_pair", "from": "EUR", "to": "USD"}
    provider_instrument JSON NOT NULL,

    -- Quality/provenance
    confidence      REAL DEFAULT 1.0,           -- 0.0-1.0, lower = needs verification
    source          TEXT NOT NULL,              -- "manual", "rule", "discovery", "import"
    last_verified   DATETIME,

    -- Time-aware for renames/relistings
    valid_from      DATE,                       -- NULL = always valid
    valid_to        DATE,                       -- NULL = still valid

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(instrument_id, provider_id, valid_from)
);

CREATE INDEX idx_mappings_lookup ON provider_mappings(instrument_id, provider_id, valid_to);
CREATE INDEX idx_mappings_provider ON provider_mappings(provider_id);

-- Optional: External identifiers (ISIN, FIGI, CUSIP, etc.)
CREATE TABLE instrument_aliases (
    id              TEXT PRIMARY KEY,
    instrument_id   TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    alias_type      TEXT NOT NULL,              -- "isin", "figi", "cusip", "sedol", "provider_id"
    alias_value     TEXT NOT NULL,

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(alias_type, alias_value)
);

CREATE INDEX idx_aliases_lookup ON instrument_aliases(alias_type, alias_value);
CREATE INDEX idx_aliases_instrument ON instrument_aliases(instrument_id);
```

### Trait Definition

```rust
// resolver/traits.rs

use crate::errors::MarketDataError;
use crate::models::{QuoteContext, ProviderInstrument, ProviderId, Currency, InstrumentId};
use crate::time::SessionType;
use async_trait::async_trait;

/// Resolution result with provenance
#[derive(Clone, Debug)]
pub struct ResolvedInstrument {
    pub instrument: ProviderInstrument,
    pub confidence: f32,
    pub source: ResolutionSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResolutionSource {
    /// From instrument master DB
    Database,
    /// From deterministic rules
    Rules,
    /// From provider discovery (candidate)
    Discovery,
}

/// Individual resolver in the chain
#[async_trait]
pub trait Resolver: Send + Sync {
    /// Attempt to resolve. Returns None if this resolver can't handle it.
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>>;

    /// Get currency for instrument (optional)
    fn get_currency(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Currency> {
        None
    }
}

/// Main resolver interface used by registry
#[async_trait]
pub trait SymbolResolver: Send + Sync {
    /// Resolve a canonical instrument to provider-specific params.
    /// Tries each resolver in chain until one succeeds.
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Result<ResolvedInstrument, MarketDataError>;

    /// Get the quote currency for an instrument at a provider
    fn get_currency(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Currency>;

    /// Get session type for an instrument
    fn get_session_type(&self, context: &QuoteContext) -> SessionType;

    /// Record a discovered mapping (from provider search)
    async fn record_candidate(
        &self,
        instrument: &InstrumentId,
        provider: &ProviderId,
        provider_instrument: &ProviderInstrument,
        confidence: f32,
    ) -> Result<(), MarketDataError>;
}
```

### Exchange Suffix Mappings

```rust
// resolver/exchange_map.rs

use crate::models::types::{Mic, ProviderId};
use std::borrow::Cow;
use std::collections::HashMap;

/// Provider-specific suffix for an exchange
#[derive(Clone, Debug)]
pub struct ExchangeSuffix {
    pub suffix: Cow<'static, str>,
    pub currency: Cow<'static, str>,
}

/// Mapping from MIC to provider-specific suffixes
pub struct ExchangeMap {
    /// MIC -> (ProviderId -> ExchangeSuffix)
    mappings: HashMap<Mic, HashMap<ProviderId, ExchangeSuffix>>,
}

impl ExchangeMap {
    pub fn new() -> Self {
        let mut map = Self {
            mappings: HashMap::new(),
        };
        map.load_defaults();
        map
    }

    fn load_defaults(&mut self) {
        // London Stock Exchange
        self.add_exchange("XLON", &[
            ("YAHOO", ".L", "GBP"),
            ("ALPHA_VANTAGE", ".LON", "GBP"),
        ]);

        // Toronto Stock Exchange
        self.add_exchange("XTSE", &[
            ("YAHOO", ".TO", "CAD"),
            ("ALPHA_VANTAGE", ".TRT", "CAD"),
        ]);

        // TSX Venture
        self.add_exchange("XTSX", &[
            ("YAHOO", ".V", "CAD"),
            ("ALPHA_VANTAGE", ".TRV", "CAD"),
        ]);

        // XETRA (Germany)
        self.add_exchange("XETR", &[
            ("YAHOO", ".DE", "EUR"),
            ("ALPHA_VANTAGE", ".DEX", "EUR"),
        ]);

        // Frankfurt
        self.add_exchange("XFRA", &[
            ("YAHOO", ".F", "EUR"),
            ("ALPHA_VANTAGE", ".FRK", "EUR"),
        ]);

        // Euronext Amsterdam
        self.add_exchange("XAMS", &[
            ("YAHOO", ".AS", "EUR"),
            ("ALPHA_VANTAGE", "", "EUR"),  // No suffix needed
        ]);

        // Euronext Paris
        self.add_exchange("XPAR", &[
            ("YAHOO", ".PA", "EUR"),
            ("ALPHA_VANTAGE", ".PAR", "EUR"),
        ]);

        // Euronext Brussels
        self.add_exchange("XBRU", &[
            ("YAHOO", ".BR", "EUR"),
            ("ALPHA_VANTAGE", ".BRU", "EUR"),
        ]);

        // Milan / Borsa Italiana
        self.add_exchange("XMIL", &[
            ("YAHOO", ".MI", "EUR"),
            ("ALPHA_VANTAGE", ".MIL", "EUR"),
        ]);

        // Madrid
        self.add_exchange("XMAD", &[
            ("YAHOO", ".MC", "EUR"),
            ("ALPHA_VANTAGE", ".MCE", "EUR"),
        ]);

        // Swiss Exchange
        self.add_exchange("XSWX", &[
            ("YAHOO", ".SW", "CHF"),
            ("ALPHA_VANTAGE", ".SWX", "CHF"),
        ]);

        // Shanghai
        self.add_exchange("XSHG", &[
            ("YAHOO", ".SS", "CNY"),
            ("ALPHA_VANTAGE", ".SHH", "CNY"),
        ]);

        // Shenzhen
        self.add_exchange("XSHE", &[
            ("YAHOO", ".SZ", "CNY"),
            ("ALPHA_VANTAGE", ".SHZ", "CNY"),
        ]);

        // Hong Kong
        self.add_exchange("XHKG", &[
            ("YAHOO", ".HK", "HKD"),
            ("ALPHA_VANTAGE", ".HKG", "HKD"),
        ]);

        // Tokyo
        self.add_exchange("XTKS", &[
            ("YAHOO", ".T", "JPY"),
            ("ALPHA_VANTAGE", ".TYO", "JPY"),
        ]);

        // Australia
        self.add_exchange("XASX", &[
            ("YAHOO", ".AX", "AUD"),
            ("ALPHA_VANTAGE", ".AX", "AUD"),
        ]);

        // Bombay
        self.add_exchange("XBOM", &[
            ("YAHOO", ".BO", "INR"),
            ("ALPHA_VANTAGE", ".BSE", "INR"),
        ]);

        // NSE India
        self.add_exchange("XNSE", &[
            ("YAHOO", ".NS", "INR"),
            ("ALPHA_VANTAGE", ".NSE", "INR"),
        ]);

        // NYSE/NASDAQ - no suffix (US default)
        self.add_exchange("XNYS", &[
            ("YAHOO", "", "USD"),
            ("ALPHA_VANTAGE", "", "USD"),
            ("MARKETDATA_APP", "", "USD"),
        ]);

        self.add_exchange("XNAS", &[
            ("YAHOO", "", "USD"),
            ("ALPHA_VANTAGE", "", "USD"),
            ("MARKETDATA_APP", "", "USD"),
        ]);
    }

    fn add_exchange(&mut self, mic: &'static str, providers: &[(&'static str, &'static str, &'static str)]) {
        let mut provider_map = HashMap::new();
        for (provider, suffix, currency) in providers {
            provider_map.insert(
                Cow::Borrowed(*provider),
                ExchangeSuffix {
                    suffix: Cow::Borrowed(*suffix),
                    currency: Cow::Borrowed(*currency),
                },
            );
        }
        self.mappings.insert(Cow::Borrowed(mic), provider_map);
    }

    pub fn get_suffix(&self, mic: &Mic, provider: &ProviderId) -> Option<&ExchangeSuffix> {
        self.mappings.get(mic)?.get(provider)
    }

    pub fn get_currency(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.get_suffix(mic, provider).map(|s| s.currency.as_ref())
    }
}
```

### Resolver Chain Implementation

```rust
// resolver/chain.rs

use super::traits::{Resolver, SymbolResolver, ResolvedInstrument, ResolutionSource};
use crate::errors::MarketDataError;
use crate::models::*;
use crate::time::SessionType;
use async_trait::async_trait;
use std::sync::Arc;

/// Composite resolver that chains multiple resolvers.
/// Tries each in order until one succeeds.
pub struct ResolverChain {
    resolvers: Vec<Arc<dyn Resolver>>,
    /// Minimum confidence to accept discovery results
    discovery_threshold: f32,
}

impl ResolverChain {
    pub fn new() -> Self {
        Self {
            resolvers: Vec::new(),
            discovery_threshold: 0.8,
        }
    }

    /// Add a resolver to the chain (order matters - first added = highest priority)
    pub fn add_resolver(mut self, resolver: Arc<dyn Resolver>) -> Self {
        self.resolvers.push(resolver);
        self
    }

    /// Set minimum confidence for discovery results
    pub fn with_discovery_threshold(mut self, threshold: f32) -> Self {
        self.discovery_threshold = threshold;
        self
    }

    /// Build with standard chain: DB -> Rules -> Discovery
    pub fn standard(
        db_resolver: Arc<dyn Resolver>,
        rules_resolver: Arc<dyn Resolver>,
        discovery_resolver: Option<Arc<dyn Resolver>>,
    ) -> Self {
        let mut chain = Self::new()
            .add_resolver(db_resolver)
            .add_resolver(rules_resolver);

        if let Some(discovery) = discovery_resolver {
            chain = chain.add_resolver(discovery);
        }

        chain
    }
}

#[async_trait]
impl SymbolResolver for ResolverChain {
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Result<ResolvedInstrument, MarketDataError> {
        for resolver in &self.resolvers {
            match resolver.resolve(provider, context).await {
                Some(Ok(resolved)) => {
                    // Check confidence threshold for discovery results
                    if resolved.source == ResolutionSource::Discovery
                        && resolved.confidence < self.discovery_threshold
                    {
                        log::debug!(
                            "Discovery result below threshold ({} < {}), skipping",
                            resolved.confidence,
                            self.discovery_threshold
                        );
                        continue;
                    }
                    return Ok(resolved);
                }
                Some(Err(e)) => {
                    // Resolver explicitly failed - propagate error
                    return Err(e);
                }
                None => {
                    // Resolver can't handle this - try next
                    continue;
                }
            }
        }

        Err(MarketDataError::ResolutionFailed {
            provider: provider.clone(),
        })
    }

    fn get_currency(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Currency> {
        for resolver in &self.resolvers {
            if let Some(currency) = resolver.get_currency(provider, context) {
                return Some(currency);
            }
        }
        None
    }

    fn get_session_type(&self, context: &QuoteContext) -> SessionType {
        // Session type is instrument-dependent, not provider-dependent
        // Derive from instrument kind and MIC
        match &context.instrument {
            InstrumentId::Crypto { .. } | InstrumentId::Fx { .. } => SessionType::Continuous24x7,
            InstrumentId::Equity { mic, .. } => {
                match mic.as_ref().map(|m| m.as_ref()) {
                    Some("XNYS") | Some("XNAS") => SessionType::nyse(),
                    Some("XLON") => SessionType::lse(),
                    _ => SessionType::Continuous24x7,
                }
            }
            _ => SessionType::Continuous24x7,
        }
    }

    async fn record_candidate(
        &self,
        instrument: &InstrumentId,
        provider: &ProviderId,
        provider_instrument: &ProviderInstrument,
        confidence: f32,
    ) -> Result<(), MarketDataError> {
        // Delegate to first resolver that supports recording (typically DB resolver)
        // This is a simplification - in practice you'd have a dedicated writer
        Ok(())
    }
}
```

### Database Resolver (Instrument Master)

```rust
// resolver/db_resolver.rs

use super::traits::{Resolver, ResolvedInstrument, ResolutionSource};
use crate::errors::MarketDataError;
use crate::models::*;
use async_trait::async_trait;
use std::sync::Arc;

/// Repository trait for instrument master (implemented in storage crate)
#[async_trait]
pub trait InstrumentRepository: Send + Sync {
    /// Find provider mapping for instrument
    async fn find_mapping(
        &self,
        instrument: &InstrumentId,
        provider: &ProviderId,
    ) -> Result<Option<ProviderMapping>, MarketDataError>;

    /// Save a candidate mapping from discovery
    async fn save_candidate(
        &self,
        instrument: &InstrumentId,
        provider: &ProviderId,
        provider_instrument: &ProviderInstrument,
        confidence: f32,
        source: &str,
    ) -> Result<(), MarketDataError>;
}

/// Mapping record from database
#[derive(Clone, Debug)]
pub struct ProviderMapping {
    pub provider_instrument: ProviderInstrument,
    pub confidence: f32,
    pub source: String,
}

/// Resolver backed by instrument master database
pub struct DatabaseResolver {
    repository: Arc<dyn InstrumentRepository>,
}

impl DatabaseResolver {
    pub fn new(repository: Arc<dyn InstrumentRepository>) -> Self {
        Self { repository }
    }
}

#[async_trait]
impl Resolver for DatabaseResolver {
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>> {
        match self.repository.find_mapping(&context.instrument, provider).await {
            Ok(Some(mapping)) => Some(Ok(ResolvedInstrument {
                instrument: mapping.provider_instrument,
                confidence: mapping.confidence,
                source: ResolutionSource::Database,
            })),
            Ok(None) => None, // Not found - try next resolver
            Err(e) => Some(Err(e)), // DB error - propagate
        }
    }
}
```

### Rules Resolver (Deterministic Mappings)

```rust
// resolver/rules_resolver.rs

use super::exchange_map::ExchangeMap;
use super::traits::{Resolver, ResolvedInstrument, ResolutionSource};
use crate::errors::MarketDataError;
use crate::models::*;
use async_trait::async_trait;
use std::sync::Arc;

/// Resolver using deterministic rules (MIC->suffix mappings, etc.)
/// Fast fallback when DB has no mapping.
pub struct RulesResolver {
    exchange_map: ExchangeMap,
}

impl RulesResolver {
    pub fn new() -> Self {
        Self {
            exchange_map: ExchangeMap::new(),
        }
    }
}

#[async_trait]
impl Resolver for RulesResolver {
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>> {
        let instrument = match &context.instrument {
            InstrumentId::Equity { ticker, mic } => {
                let symbol = if let Some(mic) = mic {
                    if let Some(suffix) = self.exchange_map.get_suffix(mic, provider) {
                        Arc::from(format!("{}{}", ticker, suffix.suffix))
                    } else {
                        // Unknown exchange in rules - can't resolve
                        return None;
                    }
                } else {
                    // No MIC - assume US/no suffix
                    ticker.clone()
                };
                ProviderInstrument::EquitySymbol { symbol: symbol.into() }
            }

            InstrumentId::Crypto { base, quote } => {
                match provider.as_ref() {
                    "YAHOO" => {
                        let symbol = Arc::from(format!("{}-{}", base, quote));
                        ProviderInstrument::CryptoSymbol { symbol: symbol.into() }
                    }
                    "ALPHA_VANTAGE" => {
                        ProviderInstrument::CryptoPair {
                            symbol: base.clone().into(),
                            market: quote.clone(),
                        }
                    }
                    _ => {
                        let symbol = Arc::from(format!("{}{}", base, quote));
                        ProviderInstrument::CryptoSymbol { symbol: symbol.into() }
                    }
                }
            }

            InstrumentId::Fx { base, quote } => {
                match provider.as_ref() {
                    "YAHOO" => {
                        let symbol = Arc::from(format!("{}{}=X", base, quote));
                        ProviderInstrument::FxSymbol { symbol: symbol.into() }
                    }
                    "ALPHA_VANTAGE" => {
                        ProviderInstrument::FxPair {
                            from_symbol: base.clone(),
                            to_symbol: quote.clone(),
                        }
                    }
                    _ => return None,
                }
            }

            InstrumentId::Metal { code, quote } => {
                match provider.as_ref() {
                    "METAL_PRICE_API" => {
                        ProviderInstrument::MetalSymbol {
                            symbol: code.clone().into(),
                            quote: quote.clone(),
                        }
                    }
                    "YAHOO" => {
                        let symbol = match code.as_ref() {
                            "XAU" => "GC=F",
                            "XAG" => "SI=F",
                            "XPT" => "PL=F",
                            "XPD" => "PA=F",
                            _ => return None,
                        };
                        ProviderInstrument::EquitySymbol {
                            symbol: Arc::from(symbol).into(),
                        }
                    }
                    _ => return None,
                }
            }

            InstrumentId::Index { symbol, .. } => {
                match provider.as_ref() {
                    "YAHOO" => {
                        let formatted = if symbol.starts_with('^') {
                            symbol.clone()
                        } else {
                            Arc::from(format!("^{}", symbol))
                        };
                        ProviderInstrument::EquitySymbol { symbol: formatted.into() }
                    }
                    _ => ProviderInstrument::EquitySymbol {
                        symbol: symbol.clone().into(),
                    },
                }
            }
        };

        Some(Ok(ResolvedInstrument {
            instrument,
            confidence: 1.0, // Rules are deterministic
            source: ResolutionSource::Rules,
        }))
    }

    fn get_currency(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Currency> {
        match &context.instrument {
            InstrumentId::Equity { mic, .. } => {
                mic.as_ref()
                    .and_then(|m| self.exchange_map.get_currency(m, provider))
                    .map(|c| Cow::Owned(c.to_string()))
            }
            InstrumentId::Crypto { quote, .. } => Some(quote.clone()),
            InstrumentId::Fx { quote, .. } => Some(quote.clone()),
            InstrumentId::Metal { quote, .. } => Some(quote.clone()),
            InstrumentId::Index { .. } => None,
        }
    }
}
```

### Discovery Resolver

```rust
// resolver/discovery_resolver.rs

use super::traits::{Resolver, ResolvedInstrument, ResolutionSource};
use crate::errors::MarketDataError;
use crate::models::*;
use crate::provider::traits::AssetProfiler;
use async_trait::async_trait;
use std::sync::Arc;

/// Resolver that uses provider search endpoints to discover mappings.
/// Results are candidates - written back to DB for verification.
pub struct DiscoveryResolver {
    profilers: Vec<Arc<dyn AssetProfiler>>,
    /// Callback to record discovered mappings
    on_discovery: Option<Box<dyn Fn(&InstrumentId, &ProviderId, &ProviderInstrument, f32) + Send + Sync>>,
}

impl DiscoveryResolver {
    pub fn new(profilers: Vec<Arc<dyn AssetProfiler>>) -> Self {
        Self {
            profilers,
            on_discovery: None,
        }
    }

    pub fn with_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn(&InstrumentId, &ProviderId, &ProviderInstrument, f32) + Send + Sync + 'static,
    {
        self.on_discovery = Some(Box::new(callback));
        self
    }
}

#[async_trait]
impl Resolver for DiscoveryResolver {
    async fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>> {
        // Only attempt discovery for equities with known ticker
        let ticker = match &context.instrument {
            InstrumentId::Equity { ticker, .. } => ticker.as_ref(),
            _ => return None, // Don't attempt discovery for other types
        };

        // Try to find matching profiler for this provider
        // (In practice, you'd have a mapping from provider_id to profiler)
        for profiler in &self.profilers {
            match profiler.search(ticker).await {
                Ok(candidates) => {
                    // Find best match
                    if let Some(best) = candidates.into_iter()
                        .filter(|c| c.confidence > 0.7)
                        .max_by(|a, b| a.confidence.partial_cmp(&b.confidence).unwrap())
                    {
                        // Convert candidate to provider instrument
                        // This is simplified - real impl would check provider_hints
                        let provider_instrument = match &best.instrument {
                            InstrumentId::Equity { ticker, mic } => {
                                // Use the discovered symbol format
                                ProviderInstrument::EquitySymbol {
                                    symbol: ticker.clone().into(),
                                }
                            }
                            _ => continue,
                        };

                        // Record the discovery
                        if let Some(ref callback) = self.on_discovery {
                            callback(&context.instrument, provider, &provider_instrument, best.confidence);
                        }

                        return Some(Ok(ResolvedInstrument {
                            instrument: provider_instrument,
                            confidence: best.confidence,
                            source: ResolutionSource::Discovery,
                        }));
                    }
                }
                Err(_) => continue,
            }
        }

        None
    }
}
```

---

## Provider Traits

### Capabilities Declaration

```rust
// provider/capabilities.rs

use crate::models::AssetKind;
use std::time::Duration;

/// What a provider can do
#[derive(Clone, Debug)]
pub struct ProviderCapabilities {
    /// Asset types this provider supports
    pub asset_kinds: &'static [AssetKind],

    /// Whether bulk fetching is supported
    pub supports_bulk: bool,

    /// Whether historical data is available
    pub supports_historical: bool,

    /// Whether asset search is available
    pub supports_search: bool,

    /// Whether asset profiles are available
    pub supports_profiles: bool,
}

/// Rate limiting configuration
#[derive(Clone, Debug)]
pub struct RateLimit {
    /// Max requests per minute
    pub requests_per_minute: u32,

    /// Max concurrent requests
    pub max_concurrency: usize,

    /// Burst capacity (for token bucket)
    pub burst: u32,

    /// Minimum delay between requests (for polite scraping)
    pub min_delay: Duration,
}

impl RateLimit {
    /// Permissive default (for providers with no stated limits)
    pub fn permissive() -> Self {
        Self {
            requests_per_minute: 600,
            max_concurrency: 10,
            burst: 20,
            min_delay: Duration::from_millis(50),
        }
    }

    /// AlphaVantage free tier
    pub fn alpha_vantage_free() -> Self {
        Self {
            requests_per_minute: 5,
            max_concurrency: 1,
            burst: 1,
            min_delay: Duration::from_secs(12),
        }
    }

    /// Yahoo (unofficial, conservative)
    pub fn yahoo() -> Self {
        Self {
            requests_per_minute: 100,
            max_concurrency: 2,
            burst: 5,
            min_delay: Duration::from_millis(200),
        }
    }
}
```

### Provider Trait

```rust
// provider/traits.rs

use crate::errors::{MarketDataError, BulkFailure};
use crate::models::{Quote, QuoteContext, ProviderInstrument, InstrumentCandidate, AssetProfile};
use crate::provider::capabilities::{ProviderCapabilities, RateLimit};
use crate::time::BarTimeMeaning;
use async_trait::async_trait;
use chrono::{DateTime, Utc};

/// Market data provider trait.
///
/// Providers are "dumb" - they receive pre-resolved ProviderInstrument
/// and just make HTTP calls. No suffix logic, no symbol parsing.
#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    /// Unique provider identifier
    fn id(&self) -> &'static str;

    /// Priority for fallback ordering (lower = higher priority)
    fn priority(&self) -> u8 { 10 }

    /// What this provider supports
    fn capabilities(&self) -> ProviderCapabilities;

    /// Rate limiting configuration
    fn rate_limit(&self) -> RateLimit;

    /// What timestamp convention this provider uses
    fn bar_time_meaning(&self) -> BarTimeMeaning {
        BarTimeMeaning::Unknown
    }

    /// Fetch latest quote
    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError>;

    /// Fetch historical quotes
    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError>;

    /// Bulk fetch historical quotes (optional)
    async fn get_historical_quotes_bulk(
        &self,
        requests: &[(QuoteContext, ProviderInstrument)],
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<(Vec<Quote>, Vec<BulkFailure>), MarketDataError> {
        // Default: sequential fetch
        let mut quotes = Vec::new();
        let mut failures = Vec::new();

        for (ctx, instr) in requests {
            match self.get_historical_quotes(ctx, instr.clone(), start, end).await {
                Ok(q) => quotes.extend(q),
                Err(e) => failures.push(BulkFailure {
                    context: ctx.clone(),
                    error: e,
                }),
            }
        }

        Ok((quotes, failures))
    }
}

/// Asset profiler for search and metadata
#[async_trait]
pub trait AssetProfiler: Send + Sync {
    /// Search for instruments matching query.
    /// Returns canonical InstrumentCandidate, NOT provider-specific symbols.
    async fn search(
        &self,
        query: &str,
    ) -> Result<Vec<InstrumentCandidate>, MarketDataError>;

    /// Get asset profile/metadata
    async fn get_profile(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<AssetProfile, MarketDataError>;
}
```

---

## Registry

### Rate Limiter

```rust
// registry/rate_limiter.rs

use crate::models::ProviderId;
use crate::provider::capabilities::RateLimit;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{Duration, Instant};

/// Token bucket rate limiter per provider
pub struct RateLimiter {
    limiters: HashMap<ProviderId, ProviderLimiter>,
}

struct ProviderLimiter {
    semaphore: Arc<Semaphore>,
    min_delay: Duration,
    last_request: std::sync::Mutex<Instant>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            limiters: HashMap::new(),
        }
    }

    pub fn register(&mut self, provider: ProviderId, config: RateLimit) {
        let limiter = ProviderLimiter {
            semaphore: Arc::new(Semaphore::new(config.max_concurrency)),
            min_delay: config.min_delay,
            last_request: std::sync::Mutex::new(Instant::now() - config.min_delay),
        };
        self.limiters.insert(provider, limiter);
    }

    /// Acquire permission to make a request.
    /// Returns a guard that releases on drop.
    pub async fn acquire(&self, provider: &ProviderId) -> Option<RateLimitGuard> {
        let limiter = self.limiters.get(provider)?;

        // Acquire semaphore permit
        let permit = limiter.semaphore.clone().acquire_owned().await.ok()?;

        // Enforce min delay
        {
            let mut last = limiter.last_request.lock().unwrap();
            let elapsed = last.elapsed();
            if elapsed < limiter.min_delay {
                tokio::time::sleep(limiter.min_delay - elapsed).await;
            }
            *last = Instant::now();
        }

        Some(RateLimitGuard { _permit: permit })
    }
}

pub struct RateLimitGuard {
    _permit: tokio::sync::OwnedSemaphorePermit,
}
```

### Circuit Breaker

```rust
// registry/circuit_breaker.rs

use crate::models::ProviderId;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// Circuit breaker state
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircuitState {
    Closed,      // Normal operation
    Open,        // Failing, reject requests
    HalfOpen,    // Testing if recovered
}

/// Circuit breaker configuration
#[derive(Clone, Debug)]
pub struct CircuitBreakerConfig {
    /// Failures before opening circuit
    pub failure_threshold: u32,
    /// Window for counting failures
    pub failure_window: Duration,
    /// How long to stay open before half-open
    pub open_duration: Duration,
    /// Successes needed in half-open to close
    pub half_open_successes: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            failure_window: Duration::from_secs(60),
            open_duration: Duration::from_secs(30),
            half_open_successes: 2,
        }
    }
}

struct BreakerState {
    state: CircuitState,
    failures: Vec<Instant>,
    opened_at: Option<Instant>,
    half_open_successes: u32,
}

/// Circuit breaker per provider
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    states: RwLock<HashMap<ProviderId, BreakerState>>,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            states: RwLock::new(HashMap::new()),
        }
    }

    /// Check if requests are allowed
    pub fn is_allowed(&self, provider: &ProviderId) -> bool {
        let mut states = self.states.write().unwrap();
        let state = states.entry(provider.clone()).or_insert_with(|| BreakerState {
            state: CircuitState::Closed,
            failures: Vec::new(),
            opened_at: None,
            half_open_successes: 0,
        });

        match state.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if we should transition to half-open
                if let Some(opened) = state.opened_at {
                    if opened.elapsed() >= self.config.open_duration {
                        state.state = CircuitState::HalfOpen;
                        state.half_open_successes = 0;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true, // Allow probe requests
        }
    }

    /// Record a successful request
    pub fn record_success(&self, provider: &ProviderId) {
        let mut states = self.states.write().unwrap();
        if let Some(state) = states.get_mut(provider) {
            match state.state {
                CircuitState::HalfOpen => {
                    state.half_open_successes += 1;
                    if state.half_open_successes >= self.config.half_open_successes {
                        state.state = CircuitState::Closed;
                        state.failures.clear();
                        state.opened_at = None;
                    }
                }
                CircuitState::Closed => {
                    // Clear old failures
                    let cutoff = Instant::now() - self.config.failure_window;
                    state.failures.retain(|&t| t > cutoff);
                }
                _ => {}
            }
        }
    }

    /// Record a failed request
    pub fn record_failure(&self, provider: &ProviderId) {
        let mut states = self.states.write().unwrap();
        let state = states.entry(provider.clone()).or_insert_with(|| BreakerState {
            state: CircuitState::Closed,
            failures: Vec::new(),
            opened_at: None,
            half_open_successes: 0,
        });

        let now = Instant::now();

        match state.state {
            CircuitState::Closed => {
                // Clean old failures and add new
                let cutoff = now - self.config.failure_window;
                state.failures.retain(|&t| t > cutoff);
                state.failures.push(now);

                if state.failures.len() as u32 >= self.config.failure_threshold {
                    state.state = CircuitState::Open;
                    state.opened_at = Some(now);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open reopens the circuit
                state.state = CircuitState::Open;
                state.opened_at = Some(now);
                state.half_open_successes = 0;
            }
            CircuitState::Open => {
                // Already open, just update timestamp
                state.opened_at = Some(now);
            }
        }
    }

    pub fn get_state(&self, provider: &ProviderId) -> CircuitState {
        self.states
            .read()
            .unwrap()
            .get(provider)
            .map(|s| s.state)
            .unwrap_or(CircuitState::Closed)
    }
}
```

### Data Validator

```rust
// registry/validator.rs

use crate::models::{Quote, QuoteQuality};
use crate::errors::MarketDataError;
use rust_decimal::Decimal;

/// Validation rules for quote data
pub struct QuoteValidator {
    /// Maximum allowed single-day price change (as ratio)
    pub max_daily_change: Decimal,
    /// Maximum age for "fresh" quote (seconds)
    pub max_staleness_secs: i64,
}

impl Default for QuoteValidator {
    fn default() -> Self {
        Self {
            max_daily_change: Decimal::new(50, 2), // 50%
            max_staleness_secs: 86400 * 7,         // 7 days
        }
    }
}

impl QuoteValidator {
    /// Validate a single quote, updating quality flags
    pub fn validate(&self, quote: &mut Quote) -> Result<(), MarketDataError> {
        // OHLC invariants
        if !self.check_ohlc_invariants(quote) {
            quote.quality.suspect_ohlc = true;
        }

        // Staleness check
        let age = chrono::Utc::now()
            .signed_duration_since(quote.timestamp)
            .num_seconds();
        if age > self.max_staleness_secs {
            quote.quality.stale = true;
        }

        // Zero/negative prices
        if quote.close <= Decimal::ZERO {
            return Err(MarketDataError::ValidationFailed {
                message: format!("Invalid close price: {}", quote.close),
            });
        }

        Ok(())
    }

    /// Validate quote against previous quote for continuity
    pub fn validate_continuity(
        &self,
        quote: &mut Quote,
        prev: &Quote,
    ) -> Result<(), MarketDataError> {
        if prev.close <= Decimal::ZERO {
            return Ok(());
        }

        let change = (quote.close - prev.close).abs() / prev.close;
        if change > self.max_daily_change {
            quote.quality.large_move = true;
            // Don't fail - might be a split or legitimate move
            // Log for investigation
        }

        Ok(())
    }

    fn check_ohlc_invariants(&self, quote: &Quote) -> bool {
        // High >= Low
        if quote.high < quote.low {
            return false;
        }

        // High >= Open, Close
        if quote.high < quote.open || quote.high < quote.close {
            return false;
        }

        // Low <= Open, Close
        if quote.low > quote.open || quote.low > quote.close {
            return false;
        }

        true
    }
}
```

### Provider Registry

```rust
// registry/registry.rs

use crate::errors::{MarketDataError, BulkFailure, RetryClass};
use crate::models::*;
use crate::provider::traits::{MarketDataProvider, AssetProfiler};
use crate::resolver::traits::SymbolResolver;
use crate::registry::{
    circuit_breaker::{CircuitBreaker, CircuitState},
    rate_limiter::RateLimiter,
    validator::QuoteValidator,
};
use chrono::{DateTime, Utc};
use log::{debug, info, warn};
use std::sync::Arc;

pub struct ProviderRegistry {
    providers: Vec<Arc<dyn MarketDataProvider>>,
    profilers: Vec<Arc<dyn AssetProfiler>>,
    resolver: Arc<dyn SymbolResolver>,
    rate_limiter: RateLimiter,
    circuit_breaker: CircuitBreaker,
    validator: QuoteValidator,
}

impl ProviderRegistry {
    pub fn new(resolver: Arc<dyn SymbolResolver>) -> Self {
        Self {
            providers: Vec::new(),
            profilers: Vec::new(),
            resolver,
            rate_limiter: RateLimiter::new(),
            circuit_breaker: CircuitBreaker::new(Default::default()),
            validator: QuoteValidator::default(),
        }
    }

    pub fn register_provider(&mut self, provider: Arc<dyn MarketDataProvider>) {
        let id = provider.id();
        self.rate_limiter.register(
            id.into(),
            provider.rate_limit(),
        );
        self.providers.push(provider);
        // Sort by priority
        self.providers.sort_by_key(|p| p.priority());
    }

    pub fn register_profiler(&mut self, profiler: Arc<dyn AssetProfiler>) {
        self.profilers.push(profiler);
    }

    /// Get providers that support a given asset kind
    fn providers_for_kind(&self, kind: AssetKind) -> impl Iterator<Item = &Arc<dyn MarketDataProvider>> {
        self.providers.iter().filter(move |p| {
            p.capabilities().asset_kinds.contains(&kind)
        })
    }

    /// Fetch latest quote with fallback
    pub async fn get_latest_quote(
        &self,
        context: &QuoteContext,
    ) -> Result<Quote, MarketDataError> {
        let mut last_error = None;

        for provider in self.providers_for_kind(context.kind) {
            let provider_id: ProviderId = provider.id().into();

            // Check circuit breaker
            if !self.circuit_breaker.is_allowed(&provider_id) {
                debug!("Circuit open for {}, skipping", provider_id);
                continue;
            }

            // Resolve symbol for this provider
            let instrument = match self.resolver.resolve(&provider_id, context) {
                Ok(i) => i,
                Err(e) => {
                    debug!("Resolution failed for {}: {:?}", provider_id, e);
                    continue;
                }
            };

            // Acquire rate limit
            let _guard = match self.rate_limiter.acquire(&provider_id).await {
                Some(g) => g,
                None => {
                    warn!("Rate limiter not configured for {}", provider_id);
                    continue;
                }
            };

            // Make the request
            match provider.get_latest_quote(context, instrument).await {
                Ok(mut quote) => {
                    self.circuit_breaker.record_success(&provider_id);

                    // Validate
                    if let Err(e) = self.validator.validate(&mut quote) {
                        warn!("Quote validation failed: {:?}", e);
                        last_error = Some(e);
                        continue;
                    }

                    return Ok(quote);
                }
                Err(e) => {
                    let retry_class = e.retry_class();
                    info!(
                        "Provider {} failed for {:?}: {:?} (retry: {:?})",
                        provider_id, context.instrument, e, retry_class
                    );

                    match retry_class {
                        RetryClass::Never => {
                            // Don't try other providers
                            return Err(e);
                        }
                        RetryClass::WithBackoff | RetryClass::CircuitOpen => {
                            self.circuit_breaker.record_failure(&provider_id);
                            last_error = Some(e);
                        }
                        RetryClass::NextProvider => {
                            last_error = Some(e);
                        }
                    }
                }
            }
        }

        Err(last_error.unwrap_or(MarketDataError::NoProvidersAvailable))
    }

    /// Fetch historical quotes with fallback
    pub async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let mut last_error = None;

        for provider in self.providers_for_kind(context.kind) {
            let provider_id: ProviderId = provider.id().into();

            if !self.circuit_breaker.is_allowed(&provider_id) {
                continue;
            }

            let instrument = match self.resolver.resolve(&provider_id, context) {
                Ok(i) => i,
                Err(_) => continue,
            };

            let _guard = match self.rate_limiter.acquire(&provider_id).await {
                Some(g) => g,
                None => continue,
            };

            match provider.get_historical_quotes(context, instrument, start, end).await {
                Ok(mut quotes) => {
                    self.circuit_breaker.record_success(&provider_id);

                    // Validate all quotes
                    for quote in &mut quotes {
                        let _ = self.validator.validate(quote);
                    }

                    // Validate continuity
                    for i in 1..quotes.len() {
                        let (prev, curr) = quotes.split_at_mut(i);
                        let _ = self.validator.validate_continuity(
                            &mut curr[0],
                            &prev[i - 1],
                        );
                    }

                    if !quotes.is_empty() {
                        return Ok(quotes);
                    }
                }
                Err(e) => {
                    let retry_class = e.retry_class();
                    if retry_class == RetryClass::Never {
                        return Err(e);
                    }
                    if matches!(retry_class, RetryClass::WithBackoff | RetryClass::CircuitOpen) {
                        self.circuit_breaker.record_failure(&provider_id);
                    }
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or(MarketDataError::NoProvidersAvailable))
    }

    /// Bulk fetch with intelligent provider routing
    pub async fn get_historical_quotes_bulk(
        &self,
        contexts: &[QuoteContext],
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<(Vec<Quote>, Vec<BulkFailure>), MarketDataError> {
        if self.providers.is_empty() {
            return Err(MarketDataError::NoProvidersAvailable);
        }

        let mut all_quotes = Vec::new();
        let mut remaining: Vec<QuoteContext> = contexts.to_vec();
        let mut all_failures = Vec::new();

        for provider in &self.providers {
            if remaining.is_empty() {
                break;
            }

            let provider_id: ProviderId = provider.id().into();

            if !self.circuit_breaker.is_allowed(&provider_id) {
                continue;
            }

            // Filter to contexts this provider supports
            let (supported, unsupported): (Vec<_>, Vec<_>) = remaining
                .into_iter()
                .partition(|ctx| {
                    provider.capabilities().asset_kinds.contains(&ctx.kind)
                });

            if supported.is_empty() {
                remaining = unsupported;
                continue;
            }

            // Resolve all symbols for this provider
            let mut requests = Vec::new();
            let mut resolution_failures = Vec::new();

            for ctx in supported {
                match self.resolver.resolve(&provider_id, &ctx) {
                    Ok(instr) => requests.push((ctx, instr)),
                    Err(e) => resolution_failures.push(BulkFailure {
                        context: ctx,
                        error: e,
                    }),
                }
            }

            all_failures.extend(resolution_failures);

            if requests.is_empty() {
                remaining = unsupported;
                continue;
            }

            // Bulk fetch
            let _guard = self.rate_limiter.acquire(&provider_id).await;

            match provider.get_historical_quotes_bulk(&requests, start, end).await {
                Ok((quotes, failures)) => {
                    self.circuit_breaker.record_success(&provider_id);
                    all_quotes.extend(quotes);

                    // Separate retryable failures
                    let (retry, terminal): (Vec<_>, Vec<_>) = failures
                        .into_iter()
                        .partition(|f| f.retry_class().should_try_next_provider());

                    all_failures.extend(terminal);
                    remaining = retry.into_iter().map(|f| f.context).collect();
                    remaining.extend(unsupported);
                }
                Err(e) => {
                    self.circuit_breaker.record_failure(&provider_id);
                    remaining = requests.into_iter().map(|(ctx, _)| ctx).collect();
                    remaining.extend(unsupported);
                    warn!("Bulk fetch failed for {}: {:?}", provider_id, e);
                }
            }
        }

        // Any remaining contexts are failures
        for ctx in remaining {
            all_failures.push(BulkFailure {
                context: ctx,
                error: MarketDataError::AllProvidersFailed,
            });
        }

        Ok((all_quotes, all_failures))
    }

    /// Search for instruments (returns canonical)
    pub async fn search(&self, query: &str) -> Result<Vec<InstrumentCandidate>, MarketDataError> {
        for profiler in &self.profilers {
            match profiler.search(query).await {
                Ok(results) if !results.is_empty() => return Ok(results),
                Ok(_) => continue,
                Err(e) => {
                    debug!("Search failed: {:?}", e);
                    continue;
                }
            }
        }

        Ok(Vec::new())
    }
}
```

---

## Migration from Core

### Phase 1: Create Crate Structure

1. Create `crates/market-data/` with module structure
2. Copy/adapt models from `crates/core/src/market_data/`
3. Set up Cargo.toml with dependencies

### Phase 2: Implement Core Types

1. Implement `InstrumentId`, `ProviderInstrument`, `QuoteContext`
2. Implement error types with `RetryClass`
3. Implement time semantics types

### Phase 3: Implement Infrastructure

1. Implement `StaticResolver` with exchange mappings
2. Implement `RateLimiter` and `CircuitBreaker`
3. Implement `QuoteValidator`

### Phase 4: Migrate Providers

For each provider:
1. Create new implementation of `MarketDataProvider` trait
2. Remove all suffix logic (resolver handles it)
3. Pattern match on `ProviderInstrument` variants
4. Add `ProviderCapabilities` and `RateLimit`

### Phase 5: Implement Registry

1. Implement `ProviderRegistry` with all orchestration
2. Wire up resolver, rate limiter, circuit breaker, validator

### Phase 6: Integration

1. Add `wealthfolio-market-data` as dependency to `core`
2. Create adapter layer in `core` that:
   - Converts existing `Asset` → `QuoteContext`
   - Converts `Quote` (new) → existing quote model
3. Replace existing `ProviderRegistry` usage with new one

### Phase 7: Cleanup

1. Remove old provider implementations from `core`
2. Remove old models that are now in `market-data`
3. Update tests

---

## Example Provider Implementation

### AlphaVantage (Sketch)

```rust
// provider/alpha_vantage/mod.rs

use crate::errors::MarketDataError;
use crate::models::*;
use crate::provider::capabilities::{ProviderCapabilities, RateLimit};
use crate::provider::traits::MarketDataProvider;
use crate::time::BarTimeMeaning;
use async_trait::async_trait;

pub struct AlphaVantageProvider {
    client: reqwest::Client,
    api_key: String,
}

impl AlphaVantageProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
        }
    }
}

#[async_trait]
impl MarketDataProvider for AlphaVantageProvider {
    fn id(&self) -> &'static str {
        "ALPHA_VANTAGE"
    }

    fn priority(&self) -> u8 {
        3
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            asset_kinds: &[AssetKind::Equity, AssetKind::Crypto, AssetKind::Fx],
            supports_bulk: false,
            supports_historical: true,
            supports_search: true,
            supports_profiles: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit::alpha_vantage_free()
    }

    fn bar_time_meaning(&self) -> BarTimeMeaning {
        BarTimeMeaning::EndTimeUtc
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        self.get_historical_quotes(
            context,
            instrument,
            chrono::Utc::now() - chrono::Duration::days(5),
            chrono::Utc::now(),
        )
        .await?
        .into_iter()
        .last()
        .ok_or(MarketDataError::NoDataForRange)
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        // Route to correct endpoint based on instrument type
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => {
                self.fetch_time_series_daily(&symbol, context, start, end).await
            }
            ProviderInstrument::CryptoPair { symbol, market } => {
                self.fetch_digital_currency_daily(&symbol, &market, context, start, end).await
            }
            ProviderInstrument::FxPair { from_symbol, to_symbol } => {
                self.fetch_fx_daily(&from_symbol, &to_symbol, context, start, end).await
            }
            _ => Err(MarketDataError::UnsupportedAssetType(
                format!("{:?}", instrument)
            )),
        }
    }
}
```

---

## Open Questions

1. **Async Runtime**: Should the crate be runtime-agnostic or assume tokio?
   - *Recommendation*: Assume tokio - it's already used throughout Wealthfolio

2. **Configuration**: How should provider API keys and settings be injected?
   - *Recommendation*: Trait-based `SecretStore` like current implementation

3. **Logging/Tracing**: Use `log` crate or `tracing`? Should we add OpenTelemetry support?
   - *Recommendation*: Start with `log`, migrate to `tracing` if observability needs grow

## Resolved Questions

- **Instrument Master**: Yes, DB-backed with resolver chain (DB → Rules → Discovery)
- **Caching**: Not needed in this crate - quotes already stored in SQLite by core

---

## Dependencies

```toml
[dependencies]
async-trait = "0.1"
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1", features = ["serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["sync", "time"] }
thiserror = "2"
log = "0.4"

[dev-dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
wiremock = "0.6"
```
