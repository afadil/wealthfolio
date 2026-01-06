# Asset Model + Market Data Provider Redesign

> Complete specification for provider-agnostic asset management and multi-provider market data

## Overview

This specification defines:

1. **Asset Model** - Single `assets` table supporting all portfolio asset kinds
2. **Pricing Modes** - Manual pricing as first-class alongside market pricing
3. **Provider-Agnostic Resolution** - No provider symbols stored on assets; resolution via chain
4. **Market Data Crate** - Standalone `wealthfolio-market-data` crate with multi-provider orchestration

## Scope

**In Scope:**
- All portfolio asset kinds (security, crypto, FX, cash, property, liability, etc.)
- Manual pricing (user-entered quotes) as first-class
- Market pricing via multiple providers
- Provider symbol resolution via resolver chain
- Rate limiting, circuit breaking, data validation

**Out of Scope:**
- Real-time streaming
- Options market pricing (options are DERIVED)

---

## Part 1: Data Model

### Terminology

| Term | Definition |
|------|------------|
| **Ticker** | Exchange-traded short code (SHOP, AAPL). Stored in `assets.symbol` when `kind=SECURITY` |
| **Provider Symbol** | Provider-specific lookup string (SHOP.TO, SHOP.TRT, EURUSD=X). **Never stored in `assets.symbol`** |
| **MIC** | ISO 10383 Market Identifier Code (XTSE, XNAS, XLON) |
| **Canonical Identity** | The provider-agnostic representation: `(symbol, exchange_mic)` for securities, `(base, quote)` for FX/crypto |

### 1.1 Assets Table

Single table for all asset kinds.

#### Schema

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
  id                 TEXT PRIMARY KEY,

  -- Identity
  kind               TEXT NOT NULL,              -- AssetKind enum
  name               TEXT,                       -- Display name
  symbol             TEXT NOT NULL,              -- Canonical ticker/label (no provider suffix)

  -- Market Identity (for SECURITY)
  exchange_mic       TEXT,                       -- ISO 10383 MIC (XTSE, XNAS, XLON)

  -- Currency
  currency           TEXT NOT NULL,              -- Native/valuation currency
                                                 -- For FX/CRYPTO: quote currency (USD in EUR/USD)

  -- Pricing Configuration
  pricing_mode       TEXT NOT NULL DEFAULT 'MARKET',  -- MARKET, MANUAL, DERIVED, NONE
  preferred_provider TEXT,                            -- Optional hint (YAHOO, ALPHA_VANTAGE)
  provider_overrides TEXT,                            -- JSON: provider_id -> provider params

  -- Classification
  isin               TEXT,
  asset_class        TEXT,                       -- Equity, Fixed Income, etc.
  asset_sub_class    TEXT,                       -- Stock, ETF, Bond, etc.

  -- Metadata
  notes              TEXT,
  profile_json       TEXT,                       -- Provider profile data (sector, website, etc.)
  metadata           TEXT,                       -- Kind-specific extensions (OptionSpec, property terms)

  -- Status
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  -- Note: CHECK constraints and triggers omitted - enforce in application code
  -- This avoids SQLite ALTER TABLE limitations and keeps validation centralized
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assets_kind_active ON assets(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_assets_exchange_mic ON assets(exchange_mic);

-- Uniqueness constraints
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_security
ON assets(symbol, exchange_mic)
WHERE kind = 'SECURITY' AND exchange_mic IS NOT NULL AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_fx_pair
ON assets(symbol, currency)
WHERE kind = 'FX_RATE' AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_crypto_pair
ON assets(symbol, currency)
WHERE kind = 'CRYPTO' AND pricing_mode = 'MARKET';

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_cash_currency
ON assets(kind, currency)
WHERE kind = 'CASH';
```

#### Column Details

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Deterministic, human-readable ID (e.g., `SHOP:XTSE`, `EUR/USD`, `$CASH-USD`) |
| `kind` | TEXT | AssetKind enum (SCREAMING_SNAKE_CASE) |
| `name` | TEXT | Display name |
| `symbol` | TEXT | Canonical ticker/label. **No provider suffix.** For FX/CRYPTO: base asset (EUR, BTC) |
| `exchange_mic` | TEXT | ISO 10383 MIC for securities (XTSE, XNAS). **Optional with fallback**: if NULL, resolver uses symbol-only resolution |
| `currency` | TEXT | Asset's native currency. For FX/CRYPTO: quote currency |
| `pricing_mode` | TEXT | How this asset is priced (MARKET, MANUAL, DERIVED, NONE) |
| `preferred_provider` | TEXT | Optional provider hint for resolution |
| `provider_overrides` | JSON | Per-provider symbol overrides (see below) |
| `isin` | TEXT | Optional ISIN identifier |
| `asset_class` | TEXT | Classification (Equity, Fixed Income, etc.) |
| `asset_sub_class` | TEXT | Sub-classification (Stock, ETF, Bond, etc.) |
| `notes` | TEXT | User notes |
| `profile_json` | JSON | Provider-sourced profile data |
| `metadata` | JSON | Kind-specific extensions (OptionSpec, property terms) |
| `is_active` | INTEGER | 0/1 soft delete flag |

### 1.2 Provider Overrides Format

The `provider_overrides` column stores a JSON object keyed by provider ID.

#### Security Example

```json
{
  "YAHOO": { "type": "equity_symbol", "symbol": "SHOP.TO" },
  "ALPHA_VANTAGE": { "type": "equity_symbol", "symbol": "SHOP.TRT" }
}
```

#### FX Example

```json
{
  "YAHOO": { "type": "fx_symbol", "symbol": "EURUSD=X" },
  "ALPHA_VANTAGE": { "type": "fx_pair", "from": "EUR", "to": "USD" }
}
```

#### Crypto Example

```json
{
  "YAHOO": { "type": "crypto_symbol", "symbol": "BTC-USD" },
  "ALPHA_VANTAGE": { "type": "crypto_pair", "symbol": "BTC", "market": "USD" }
}
```

### 1.3 Quotes Table

Quotes are the system of record. Stored in existing SQLite table.

#### Requirements

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | TEXT | FK to assets |
| `ts` | TEXT | Date/time of bar/quote |
| `open` | REAL | Optional |
| `high` | REAL | Optional |
| `low` | REAL | Optional |
| `close` | REAL | Required |
| `volume` | REAL | Optional |
| `currency` | TEXT | Quote currency |
| `source` | TEXT | MANUAL, YAHOO, ALPHA_VANTAGE, etc. |

#### Quote Source Rules

1. **Manual quotes** (`source='MANUAL'`) are **never overwritten** by provider refresh
2. **Manual quote entry**: Daily granularity, supports CSV import for bulk entry
3. If `pricing_mode = MANUAL`:
   - Pricing pipeline does not call providers for that asset
   - Current price = latest quote where `source='MANUAL'`
4. If `pricing_mode = MARKET`:
   - Providers upsert quotes by `(asset_id, ts, source)`
   - Current price = latest quote from any provider (preference by priority)
   - **Auto-backfill**: Historical quotes fetched automatically on asset creation

#### FX Conversion

FX rate inversion and multi-hop conversion is handled by the existing `CurrencyConverter` (graph-based BFS). The market data layer only fetches canonical pairs (e.g., `EUR/USD`); inverse rates and cross rates are computed on-the-fly.

---

## Part 2: Rust Domain Model

### 2.1 Enums

```rust
/// Asset classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Security,       // Stocks, ETFs, bonds, funds
    Crypto,         // Cryptocurrencies
    Cash,           // Cash holdings ($CASH-USD)
    FxRate,         // Currency pairs (non-holdable, for conversion)
    Option,         // Options contracts
    Commodity,      // Physical commodities
    PrivateEquity,
    Property,
    Vehicle,
    Liability,
    Other,
}

/// How the asset is priced
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PricingMode {
    #[default]
    Market,   // Priced via market data providers
    Manual,   // User-entered quotes only
    Derived,  // Calculated from other assets (e.g., options from underlying)
    None,     // No pricing needed (e.g., cash is always 1:1)
}

impl AssetKind {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    /// Use this instead of magic strings in SQL queries and database operations.
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            AssetKind::Security => "SECURITY",
            AssetKind::Crypto => "CRYPTO",
            AssetKind::Cash => "CASH",
            AssetKind::FxRate => "FX_RATE",
            AssetKind::Option => "OPTION",
            // ... etc
        }
    }
}

impl PricingMode {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            PricingMode::Market => "MARKET",
            PricingMode::Manual => "MANUAL",
            PricingMode::Derived => "DERIVED",
            PricingMode::None => "NONE",
        }
    }
}

/// Option contract type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionRight {
    Call,
    Put,
}
```

### 2.2 Asset Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,

    // Identity
    pub kind: AssetKind,
    pub name: Option<String>,
    pub symbol: String,              // Canonical ticker (no provider suffix)
    pub exchange_mic: Option<String>, // ISO 10383 MIC

    // Currency
    pub currency: String,

    // Pricing
    pub pricing_mode: PricingMode,
    pub preferred_provider: Option<String>,
    pub provider_overrides: Option<ProviderOverrides>,

    // Classification
    pub isin: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,

    // Metadata
    pub notes: Option<String>,
    pub profile: Option<AssetProfile>,
    pub metadata: Option<AssetMetadata>,

    // Status
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Provider-specific symbol overrides
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderOverrides {
    #[serde(flatten)]
    pub overrides: HashMap<String, ProviderInstrument>,
}

/// Kind-specific metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetMetadata {
    Option(OptionSpec),
    Property(PropertySpec),
    Liability(LiabilitySpec),
    // ... other kinds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionSpec {
    pub underlying_symbol: String,
    pub strike: Decimal,
    pub expiry: NaiveDate,
    pub right: OptionRight,
    pub multiplier: Option<Decimal>,
}
```

### 2.3 Asset Behavior Methods

```rust
impl Asset {
    /// Whether this asset needs market price fetching
    pub fn needs_pricing(&self) -> bool {
        // Cash doesn't need pricing (always 1:1)
        if self.kind == AssetKind::Cash {
            return false;
        }

        // Only MARKET mode triggers provider calls
        self.pricing_mode == PricingMode::Market
    }

    /// Whether this asset can be held in a portfolio
    pub fn is_holdable(&self) -> bool {
        !matches!(self.kind, AssetKind::FxRate)
    }

    /// Convert to canonical instrument for resolution
    pub fn to_instrument_id(&self) -> Option<InstrumentId> {
        match self.kind {
            AssetKind::Security => Some(InstrumentId::Equity {
                ticker: self.symbol.clone().into(),
                mic: self.exchange_mic.clone().map(Into::into),
            }),
            AssetKind::Crypto => Some(InstrumentId::Crypto {
                base: self.symbol.clone().into(),
                quote: self.currency.clone().into(),
            }),
            AssetKind::FxRate => Some(InstrumentId::Fx {
                base: self.symbol.clone().into(),
                quote: self.currency.clone().into(),
            }),
            AssetKind::Commodity if self.is_precious_metal() => Some(InstrumentId::Metal {
                code: self.symbol.clone().into(),
                quote: self.currency.clone().into(),
            }),
            _ => None, // Not resolvable to market data
        }
    }

    fn is_precious_metal(&self) -> bool {
        matches!(self.symbol.as_str(), "XAU" | "XAG" | "XPT" | "XPD")
    }
}
```

---

## Part 3: Market Data Crate

### 3.1 Crate Structure

```
crates/
└── market-data/
    ├── Cargo.toml
    └── src/
        ├── lib.rs
        │
        ├── models/
        │   ├── mod.rs
        │   ├── instrument.rs      # InstrumentId (canonical)
        │   ├── provider_params.rs # ProviderInstrument (provider-specific)
        │   ├── quote.rs           # Quote with time semantics
        │   ├── profile.rs         # AssetProfile, InstrumentCandidate
        │   └── types.rs           # Mic, Currency, ProviderId
        │
        ├── errors/
        │   ├── mod.rs
        │   └── retry.rs           # RetryClass, error classification
        │
        ├── resolver/
        │   ├── mod.rs
        │   ├── traits.rs          # Resolver, SymbolResolver traits
        │   ├── chain.rs           # ResolverChain composite
        │   ├── asset_resolver.rs  # Resolves from Asset.provider_overrides
        │   ├── rules_resolver.rs  # Deterministic MIC→suffix rules
        │   └── exchange_map.rs    # MIC → provider suffix mappings
        │
        ├── provider/
        │   ├── mod.rs
        │   ├── traits.rs          # MarketDataProvider, AssetProfiler
        │   ├── capabilities.rs    # ProviderCapabilities, RateLimit
        │   ├── yahoo/
        │   ├── alpha_vantage/
        │   ├── marketdata_app/
        │   └── metal_price_api/
        │
        ├── registry/
        │   ├── mod.rs
        │   ├── registry.rs        # ProviderRegistry orchestration
        │   ├── rate_limiter.rs    # Token bucket rate limiting
        │   ├── circuit_breaker.rs # Per-provider circuit breaker (in-memory, resets on restart)
        │   └── validator.rs       # Data validation gates
        │
        └── time/
            ├── mod.rs
            ├── session.rs         # SessionType, trading hours
            └── bar_time.rs        # BarTimeMeaning, normalization
```

### 3.2 Core Types

#### Type Aliases

```rust
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

#### Canonical Instrument Identity

```rust
/// Provider-agnostic instrument identifier.
/// This is what the domain layer works with.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub enum InstrumentId {
    /// Exchange-traded security
    Equity {
        ticker: Arc<str>,        // "SHOP", "AAPL" (no suffix)
        mic: Option<Mic>,        // "XTSE", "XNAS"
    },

    /// Cryptocurrency pair
    Crypto {
        base: Arc<str>,          // "BTC"
        quote: Currency,         // "USD"
    },

    /// Foreign exchange pair
    Fx {
        base: Currency,          // "EUR"
        quote: Currency,         // "USD"
    },

    /// Precious metal
    Metal {
        code: Arc<str>,          // "XAU"
        quote: Currency,         // "USD"
    },
}

impl InstrumentId {
    pub fn kind(&self) -> AssetKind {
        match self {
            Self::Equity { .. } => AssetKind::Security,
            Self::Crypto { .. } => AssetKind::Crypto,
            Self::Fx { .. } => AssetKind::FxRate,
            Self::Metal { .. } => AssetKind::Commodity,
        }
    }
}
```

#### Provider-Specific Instrument

```rust
/// Provider-specific instrument parameters.
/// Produced by resolver, consumed by providers.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderInstrument {
    /// Equity with provider-specific suffix
    EquitySymbol { symbol: ProviderSymbol },

    /// Crypto as single symbol (Yahoo: "BTC-USD")
    CryptoSymbol { symbol: ProviderSymbol },

    /// Crypto as separate base/market (AlphaVantage)
    CryptoPair { symbol: ProviderSymbol, market: Currency },

    /// FX as single symbol (Yahoo: "EURUSD=X")
    FxSymbol { symbol: ProviderSymbol },

    /// FX as from/to pair (AlphaVantage)
    FxPair { from: Currency, to: Currency },

    /// Metal symbol
    MetalSymbol { symbol: ProviderSymbol, quote: Currency },
}
```

#### Quote Context

```rust
/// Request context for quote fetching
#[derive(Clone, Debug)]
pub struct QuoteContext {
    /// Canonical instrument
    pub instrument: InstrumentId,

    /// Pre-resolved provider overrides (from Asset.provider_overrides)
    pub overrides: Option<ProviderOverrides>,

    /// Currency hint
    pub currency_hint: Option<Currency>,

    /// Preferred provider (from Asset.preferred_provider)
    pub preferred_provider: Option<ProviderId>,
}
```

### 3.3 Error Handling

```rust
/// Classification for retry policy
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetryClass {
    /// Never retry - bad symbol, validation error
    Never,
    /// Retry with backoff - 429, timeout
    WithBackoff,
    /// Try next provider - this provider can't handle it
    NextProvider,
    /// Circuit breaker is open
    CircuitOpen,
}

#[derive(Error, Debug)]
pub enum MarketDataError {
    #[error("Symbol not found: {0}")]
    SymbolNotFound(String),

    #[error("Unsupported asset type: {0}")]
    UnsupportedAssetType(String),

    #[error("No data for date range")]
    NoDataForRange,

    #[error("Rate limited: {provider}")]
    RateLimited { provider: ProviderId },

    #[error("Timeout: {provider}")]
    Timeout { provider: ProviderId },

    #[error("Provider error: {provider} - {message}")]
    ProviderError { provider: ProviderId, message: String },

    #[error("Resolution failed for provider: {provider}")]
    ResolutionFailed { provider: ProviderId },

    #[error("Circuit open: {provider}")]
    CircuitOpen { provider: ProviderId },

    #[error("Validation failed: {message}")]
    ValidationFailed { message: String },

    #[error("No providers available")]
    NoProvidersAvailable,

    #[error("All providers failed")]
    AllProvidersFailed,
}

impl MarketDataError {
    pub fn retry_class(&self) -> RetryClass {
        match self {
            Self::SymbolNotFound(_) |
            Self::UnsupportedAssetType(_) |
            Self::NoDataForRange |
            Self::ValidationFailed { .. } => RetryClass::Never,

            Self::RateLimited { .. } |
            Self::Timeout { .. } => RetryClass::WithBackoff,

            Self::ProviderError { .. } |
            Self::ResolutionFailed { .. } => RetryClass::NextProvider,

            Self::CircuitOpen { .. } => RetryClass::CircuitOpen,

            Self::NoProvidersAvailable |
            Self::AllProvidersFailed => RetryClass::Never,
        }
    }
}
```

---

## Part 4: Symbol Resolution

### 4.1 Resolver Chain

Resolution uses a chain of responsibility with two layers:

```
┌─────────────────────────────────────────────────────────────┐
│                      ResolverChain                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Asset Resolver (provider_overrides)                  │ │
│  │    - Checks Asset.provider_overrides[provider_id]       │ │
│  │    - User can set explicit overrides per provider       │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │ miss                             │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 2. Rules Resolver (deterministic)                       │ │
│  │    - MIC → suffix mappings                              │ │
│  │    - FX/Crypto format rules per provider                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Resolution Precedence

Given `(asset, provider_id)`, resolve provider instrument as:

1. **If `provider_overrides[provider_id]` exists** → use it directly
2. **Else derive from canonical identity:**
   - Security: `symbol + suffix(exchange_mic, provider_id)`
   - FX: Provider format from `(base=symbol, quote=currency)`
   - Crypto: Provider format from `(base=symbol, quote=currency)`
3. **If cannot resolve** → return `ResolutionFailed`, registry tries next provider

### 4.3 Resolver Traits

```rust
/// Resolution result with source info
#[derive(Clone, Debug)]
pub struct ResolvedInstrument {
    pub instrument: ProviderInstrument,
    pub source: ResolutionSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResolutionSource {
    Override,    // From Asset.provider_overrides
    Rules,       // From deterministic MIC→suffix rules
}

/// Individual resolver in chain
#[async_trait]
pub trait Resolver: Send + Sync {
    /// Attempt to resolve. Returns None if can't handle.
    fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>>;
}

/// Main resolver interface
pub trait SymbolResolver: Send + Sync {
    fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Result<ResolvedInstrument, MarketDataError>;

    fn get_currency(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Currency>;
}
```

### 4.4 Asset Resolver (Override Layer)

```rust
/// Resolves from Asset.provider_overrides
pub struct AssetResolver;

impl Resolver for AssetResolver {
    fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>> {
        // Check if asset has override for this provider
        let overrides = context.overrides.as_ref()?;
        let instrument = overrides.overrides.get(provider.as_ref())?;

        Some(Ok(ResolvedInstrument {
            instrument: instrument.clone(),
            source: ResolutionSource::Override,
        }))
    }
}
```

### 4.5 Rules Resolver (Deterministic Layer)

```rust
/// Resolves from MIC→suffix rules
pub struct RulesResolver {
    exchange_map: ExchangeMap,
}

impl Resolver for RulesResolver {
    fn resolve(
        &self,
        provider: &ProviderId,
        context: &QuoteContext,
    ) -> Option<Result<ResolvedInstrument, MarketDataError>> {
        let instrument = match &context.instrument {
            InstrumentId::Equity { ticker, mic } => {
                let symbol = match mic {
                    Some(mic) => {
                        let suffix = self.exchange_map.get_suffix(mic, provider)?;
                        Arc::from(format!("{}{}", ticker, suffix))
                    }
                    None => ticker.clone(), // No MIC = US, no suffix
                };
                ProviderInstrument::EquitySymbol { symbol: symbol.into() }
            }

            InstrumentId::Crypto { base, quote } => {
                match provider.as_ref() {
                    "YAHOO" => ProviderInstrument::CryptoSymbol {
                        symbol: Arc::from(format!("{}-{}", base, quote)).into(),
                    },
                    "ALPHA_VANTAGE" => ProviderInstrument::CryptoPair {
                        symbol: base.clone().into(),
                        market: quote.clone(),
                    },
                    _ => return None,
                }
            }

            InstrumentId::Fx { base, quote } => {
                match provider.as_ref() {
                    "YAHOO" => ProviderInstrument::FxSymbol {
                        symbol: Arc::from(format!("{}{}=X", base, quote)).into(),
                    },
                    "ALPHA_VANTAGE" => ProviderInstrument::FxPair {
                        from: base.clone(),
                        to: quote.clone(),
                    },
                    _ => return None,
                }
            }

            InstrumentId::Metal { code, quote } => {
                match provider.as_ref() {
                    "METAL_PRICE_API" => ProviderInstrument::MetalSymbol {
                        symbol: code.clone().into(),
                        quote: quote.clone(),
                    },
                    "YAHOO" => {
                        let futures = match code.as_ref() {
                            "XAU" => "GC=F",
                            "XAG" => "SI=F",
                            "XPT" => "PL=F",
                            "XPD" => "PA=F",
                            _ => return None,
                        };
                        ProviderInstrument::EquitySymbol {
                            symbol: Arc::from(futures).into(),
                        }
                    }
                    _ => return None,
                }
            }
        };

        Some(Ok(ResolvedInstrument {
            instrument,
            source: ResolutionSource::Rules,
        }))
    }
}
```

### 4.6 Exchange Suffix Mappings

```rust
/// MIC → provider suffix mapping
pub struct ExchangeMap {
    mappings: HashMap<Mic, HashMap<ProviderId, ExchangeSuffix>>,
}

pub struct ExchangeSuffix {
    pub suffix: Cow<'static, str>,
    pub currency: Cow<'static, str>,
}

impl ExchangeMap {
    pub fn new() -> Self {
        let mut map = Self { mappings: HashMap::new() };
        map.load_defaults();
        map
    }

    fn load_defaults(&mut self) {
        // North America
        self.add("XNYS", &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")]);
        self.add("XNAS", &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")]);
        self.add("XASE", &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")]);
        self.add("XTSE", &[("YAHOO", ".TO", "CAD"), ("ALPHA_VANTAGE", ".TRT", "CAD")]);
        self.add("XTSX", &[("YAHOO", ".V", "CAD"), ("ALPHA_VANTAGE", ".TRV", "CAD")]);
        self.add("XCNQ", &[("YAHOO", ".CN", "CAD"), ("ALPHA_VANTAGE", ".CNQ", "CAD")]);
        self.add("XMEX", &[("YAHOO", ".MX", "MXN"), ("ALPHA_VANTAGE", ".MEX", "MXN")]);

        // UK & Ireland
        self.add("XLON", &[("YAHOO", ".L", "GBP"), ("ALPHA_VANTAGE", ".LON", "GBP")]);
        self.add("XLON_IL", &[("YAHOO", ".IL", "GBP")]);  // London Intl
        self.add("XDUB", &[("YAHOO", ".IR", "EUR"), ("ALPHA_VANTAGE", ".DUB", "EUR")]);

        // Germany
        self.add("XETR", &[("YAHOO", ".DE", "EUR"), ("ALPHA_VANTAGE", ".DEX", "EUR")]);
        self.add("XFRA", &[("YAHOO", ".F", "EUR"), ("ALPHA_VANTAGE", ".FRK", "EUR")]);
        self.add("XSTU", &[("YAHOO", ".SG", "EUR"), ("ALPHA_VANTAGE", ".STU", "EUR")]);
        self.add("XHAM", &[("YAHOO", ".HM", "EUR")]);
        self.add("XDUS", &[("YAHOO", ".DU", "EUR")]);
        self.add("XMUN", &[("YAHOO", ".MU", "EUR")]);
        self.add("XBER", &[("YAHOO", ".BE", "EUR")]);
        self.add("XHAN", &[("YAHOO", ".HA", "EUR")]);

        // Euronext
        self.add("XPAR", &[("YAHOO", ".PA", "EUR"), ("ALPHA_VANTAGE", ".PAR", "EUR")]);
        self.add("XAMS", &[("YAHOO", ".AS", "EUR"), ("ALPHA_VANTAGE", "", "EUR")]);
        self.add("XBRU", &[("YAHOO", ".BR", "EUR"), ("ALPHA_VANTAGE", ".BRU", "EUR")]);
        self.add("XLIS", &[("YAHOO", ".LS", "EUR"), ("ALPHA_VANTAGE", ".LIS", "EUR")]);

        // Southern Europe
        self.add("XMIL", &[("YAHOO", ".MI", "EUR"), ("ALPHA_VANTAGE", ".MIL", "EUR")]);
        self.add("XMAD", &[("YAHOO", ".MC", "EUR"), ("ALPHA_VANTAGE", ".MCE", "EUR")]);
        self.add("XATH", &[("YAHOO", ".AT", "EUR")]);

        // Nordic
        self.add("XSTO", &[("YAHOO", ".ST", "SEK"), ("ALPHA_VANTAGE", ".STO", "SEK")]);
        self.add("XHEL", &[("YAHOO", ".HE", "EUR"), ("ALPHA_VANTAGE", ".HEL", "EUR")]);
        self.add("XCSE", &[("YAHOO", ".CO", "DKK"), ("ALPHA_VANTAGE", ".CPH", "DKK")]);
        self.add("XOSL", &[("YAHOO", ".OL", "NOK"), ("ALPHA_VANTAGE", ".OSL", "NOK")]);
        self.add("XICE", &[("YAHOO", ".IC", "ISK")]);

        // Central/Eastern Europe
        self.add("XSWX", &[("YAHOO", ".SW", "CHF"), ("ALPHA_VANTAGE", ".SWX", "CHF")]);
        self.add("XWBO", &[("YAHOO", ".VI", "EUR"), ("ALPHA_VANTAGE", ".VIE", "EUR")]);
        self.add("XWAR", &[("YAHOO", ".WA", "PLN")]);
        self.add("XPRA", &[("YAHOO", ".PR", "CZK")]);
        self.add("XBUD", &[("YAHOO", ".BD", "HUF")]);
        self.add("XIST", &[("YAHOO", ".IS", "TRY")]);

        // Asia - China
        self.add("XSHG", &[("YAHOO", ".SS", "CNY"), ("ALPHA_VANTAGE", ".SHH", "CNY")]);
        self.add("XSHE", &[("YAHOO", ".SZ", "CNY"), ("ALPHA_VANTAGE", ".SHZ", "CNY")]);
        self.add("XHKG", &[("YAHOO", ".HK", "HKD"), ("ALPHA_VANTAGE", ".HKG", "HKD")]);

        // Asia - Japan & Korea
        self.add("XTKS", &[("YAHOO", ".T", "JPY"), ("ALPHA_VANTAGE", ".TYO", "JPY")]);
        self.add("XKRX", &[("YAHOO", ".KS", "KRW")]);
        self.add("XKOS", &[("YAHOO", ".KQ", "KRW")]);

        // Asia - Southeast
        self.add("XSES", &[("YAHOO", ".SI", "SGD")]);
        self.add("XBKK", &[("YAHOO", ".BK", "THB")]);
        self.add("XIDX", &[("YAHOO", ".JK", "IDR")]);
        self.add("XKLS", &[("YAHOO", ".KL", "MYR")]);

        // Asia - South
        self.add("XBOM", &[("YAHOO", ".BO", "INR"), ("ALPHA_VANTAGE", ".BSE", "INR")]);
        self.add("XNSE", &[("YAHOO", ".NS", "INR"), ("ALPHA_VANTAGE", ".NSE", "INR")]);

        // Asia - Taiwan
        self.add("XTAI", &[("YAHOO", ".TW", "TWD")]);
        self.add("XTAI_OTC", &[("YAHOO", ".TWO", "TWD")]);

        // Oceania
        self.add("XASX", &[("YAHOO", ".AX", "AUD"), ("ALPHA_VANTAGE", ".AX", "AUD")]);
        self.add("XNZE", &[("YAHOO", ".NZ", "NZD")]);

        // South America
        self.add("BVMF", &[("YAHOO", ".SA", "BRL")]);
        self.add("XBUE", &[("YAHOO", ".BA", "ARS")]);
        self.add("XSGO", &[("YAHOO", ".SN", "CLP")]);

        // Middle East
        self.add("XTAE", &[("YAHOO", ".TA", "ILS")]);
        self.add("XSAU", &[("YAHOO", ".SAU", "SAR")]);
        self.add("XDFM", &[("YAHOO", ".AE", "AED")]);
        self.add("XADS", &[("YAHOO", ".AE", "AED")]);
        self.add("DSMD", &[("YAHOO", ".QA", "QAR")]);

        // Africa
        self.add("XJSE", &[("YAHOO", ".JO", "ZAR")]);
        self.add("XCAI", &[("YAHOO", ".CA", "EGP")]);
    }

    fn add(&mut self, mic: &'static str, providers: &[(&'static str, &'static str, &'static str)]) {
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

    pub fn get_suffix(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.suffix.as_ref())
    }

    pub fn get_currency(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.currency.as_ref())
    }
}
```

### 4.7 Yahoo Exchange Code → MIC Mapping

For search results, map Yahoo's exchange codes to MIC:

```rust
/// Map Yahoo exchange code to MIC
pub fn yahoo_exchange_to_mic(code: &str) -> Option<Mic> {
    let mic = match code {
        // North America
        "NMS" | "NGM" | "NCM" => "XNAS",  // NASDAQ variants
        "NYQ" | "NYS" => "XNYS",           // NYSE
        "PCX" | "ASE" => "XASE",           // NYSE American
        "TOR" => "XTSE",                   // Toronto
        "VAN" | "CVE" => "XTSX",           // TSX Venture
        "CNQ" => "XCNQ",                   // CSE Canada
        "MEX" => "XMEX",                   // Mexico

        // UK & Ireland
        "LSE" => "XLON",
        "IOB" => "XLON",                   // London IOB
        "ISE" => "XDUB",                   // Dublin

        // Germany
        "GER" | "XETRA" => "XETR",
        "FRA" => "XFRA",
        "STU" => "XSTU",
        "HAM" => "XHAM",
        "DUS" => "XDUS",
        "MUN" => "XMUN",
        "BER" => "XBER",

        // Euronext
        "PAR" | "ENX" => "XPAR",
        "AMS" => "XAMS",
        "BRU" => "XBRU",
        "LIS" => "XLIS",

        // Southern Europe
        "MIL" => "XMIL",
        "MCE" => "XMAD",
        "ATH" => "XATH",

        // Nordic
        "STO" => "XSTO",
        "HEL" => "XHEL",
        "CPH" => "XCSE",
        "OSL" => "XOSL",

        // Switzerland & Central Europe
        "EBS" | "SWX" => "XSWX",
        "VIE" => "XWBO",
        "WSE" => "XWAR",
        "PRA" => "XPRA",
        "BUD" => "XBUD",
        "IST" => "XIST",

        // China & Hong Kong
        "SHH" => "XSHG",
        "SHZ" => "XSHE",
        "HKG" => "XHKG",

        // Japan & Korea
        "TYO" | "JPX" => "XTKS",
        "KSC" | "KRX" => "XKRX",
        "KOE" | "KOSDAQ" => "XKOS",

        // Southeast Asia
        "SES" | "SGX" => "XSES",
        "BKK" | "SET" => "XBKK",
        "JKT" | "IDX" => "XIDX",
        "KLS" | "KLSE" => "XKLS",

        // India
        "BSE" | "BOM" => "XBOM",
        "NSI" | "NSE" => "XNSE",

        // Taiwan
        "TAI" | "TPE" => "XTAI",
        "TWO" => "XTAI_OTC",

        // Oceania
        "ASX" | "AX" => "XASX",
        "NZE" => "XNZE",

        // South America
        "SAO" | "BVMF" => "BVMF",
        "BUE" => "XBUE",
        "SGO" => "XSGO",

        // Middle East
        "TLV" => "XTAE",
        "SAU" => "XSAU",
        "DFM" => "XDFM",
        "ADX" => "XADS",
        "DOH" => "DSMD",

        // Africa
        "JNB" | "JSE" => "XJSE",
        "CAI" => "XCAI",

        _ => return None,
    };

    Some(Cow::Borrowed(mic))
}

/// Known Yahoo exchange suffixes (whitelist-based to avoid false positives like BRK.B)
const YAHOO_EXCHANGE_SUFFIXES: &[&str] = &[
    // North America
    ".TO", ".V", ".CN", ".MX",
    // UK & Europe
    ".L", ".IL", ".IR", ".DE", ".F", ".SG", ".HM", ".DU", ".MU", ".BE", ".HA",
    ".PA", ".AS", ".BR", ".LS", ".MI", ".MC", ".AT",
    // Nordic
    ".ST", ".HE", ".CO", ".OL", ".IC",
    // Central/Eastern Europe
    ".SW", ".VI", ".WA", ".PR", ".BD", ".IS",
    // Asia
    ".SS", ".SZ", ".HK", ".T", ".KS", ".KQ", ".SI", ".BK", ".JK", ".KL",
    ".BO", ".NS", ".TW", ".TWO",
    // Oceania
    ".AX", ".NZ",
    // South America
    ".SA", ".BA", ".SN",
    // Middle East & Africa
    ".TA", ".SAU", ".AE", ".QA", ".JO", ".CA",
];

/// Extract canonical ticker from provider symbol using whitelist
/// Safe for share classes like BRK.B, RDS.A (won't strip .B or .A)
pub fn strip_yahoo_suffix(symbol: &str) -> &str {
    // Handle special suffixes first
    if symbol.ends_with("=X") {  // FX pairs like EURUSD=X
        return &symbol[..symbol.len() - 2];
    }
    if symbol.ends_with("=F") {  // Futures like GC=F
        return &symbol[..symbol.len() - 2];
    }

    // Only strip if suffix is in our known exchange whitelist
    for suffix in YAHOO_EXCHANGE_SUFFIXES {
        if symbol.ends_with(suffix) {
            return &symbol[..symbol.len() - suffix.len()];
        }
    }

    // No known suffix found - return as-is (preserves BRK.B, RDS.A, etc.)
    symbol
}
```

---

## Part 5: Provider Implementation

### 5.1 Provider Traits

```rust
/// Provider capabilities
#[derive(Clone, Debug)]
pub struct ProviderCapabilities {
    pub asset_kinds: &'static [AssetKind],
    pub supports_historical: bool,
    pub supports_search: bool,
}

/// Rate limiting config
#[derive(Clone, Debug)]
pub struct RateLimit {
    pub requests_per_minute: u32,
    pub max_concurrency: usize,
    pub min_delay: Duration,
}

/// Market data provider trait
#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn priority(&self) -> u8 { 10 }
    fn capabilities(&self) -> ProviderCapabilities;
    fn rate_limit(&self) -> RateLimit;

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError>;

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError>;
}
```

### 5.2 AlphaVantage Routing

```rust
impl AlphaVantageProvider {
    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => {
                // TIME_SERIES_DAILY
                self.fetch_time_series_daily(&symbol, start, end).await
            }
            ProviderInstrument::CryptoPair { symbol, market } => {
                // DIGITAL_CURRENCY_DAILY
                self.fetch_digital_currency_daily(&symbol, &market, start, end).await
            }
            ProviderInstrument::FxPair { from, to } => {
                // FX_DAILY
                self.fetch_fx_daily(&from, &to, start, end).await
            }
            _ => Err(MarketDataError::UnsupportedAssetType(
                format!("{:?}", instrument)
            )),
        }
    }

    async fn fetch_digital_currency_daily(
        &self,
        symbol: &str,
        market: &str,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let params = vec![
            ("function", "DIGITAL_CURRENCY_DAILY"),
            ("symbol", symbol),
            ("market", market),
            ("apikey", &self.api_key),
        ];
        // ... parse response
    }

    async fn fetch_fx_daily(
        &self,
        from: &str,
        to: &str,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let params = vec![
            ("function", "FX_DAILY"),
            ("from_symbol", from),
            ("to_symbol", to),
            ("apikey", &self.api_key),
        ];
        // ... parse response
    }
}
```

---

## Part 6: Registry & Pipeline

### 6.1 Provider Registry

```rust
pub struct ProviderRegistry {
    providers: Vec<Arc<dyn MarketDataProvider>>,
    resolver: Arc<dyn SymbolResolver>,
    rate_limiter: RateLimiter,
    circuit_breaker: CircuitBreaker,
    validator: QuoteValidator,
}

impl ProviderRegistry {
    /// Fetch quotes for an asset
    pub async fn fetch_quotes(
        &self,
        asset: &Asset,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        // 1. Skip if not market-priced
        if asset.pricing_mode != PricingMode::Market {
            return Ok(vec![]);
        }

        // 2. Convert to instrument
        let instrument = asset.to_instrument_id()
            .ok_or(MarketDataError::UnsupportedAssetType(asset.kind.to_string()))?;

        // 3. Build context
        let context = QuoteContext {
            instrument,
            overrides: asset.provider_overrides.clone(),
            currency_hint: Some(asset.currency.clone().into()),
            preferred_provider: asset.preferred_provider.clone().map(Into::into),
        };

        // 4. Try providers in order (prefer preferred_provider if set)
        let providers = self.ordered_providers(&context);

        let mut last_error = None;
        for provider in providers {
            let provider_id: ProviderId = provider.id().into();

            // Check circuit breaker
            if !self.circuit_breaker.is_allowed(&provider_id) {
                continue;
            }

            // Resolve symbol for this provider
            let resolved = match self.resolver.resolve(&provider_id, &context) {
                Ok(r) => r,
                Err(_) => continue,
            };

            // Rate limit
            let _guard = self.rate_limiter.acquire(&provider_id).await;

            // Fetch
            match provider.get_historical_quotes(&context, resolved.instrument, start, end).await {
                Ok(mut quotes) => {
                    self.circuit_breaker.record_success(&provider_id);

                    // Validate
                    for q in &mut quotes {
                        let _ = self.validator.validate(q);
                    }

                    return Ok(quotes);
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

    fn ordered_providers(&self, context: &QuoteContext) -> Vec<&Arc<dyn MarketDataProvider>> {
        let mut providers: Vec<_> = self.providers.iter()
            .filter(|p| p.capabilities().asset_kinds.contains(&context.instrument.kind()))
            .collect();

        // Preferred provider first
        if let Some(preferred) = &context.preferred_provider {
            providers.sort_by_key(|p| {
                if p.id() == preferred.as_ref() { 0 } else { p.priority() as i32 + 1 }
            });
        }

        providers
    }
}
```

### 6.2 Quote Source Rules

**Key invariant:** Quotes are unique by `(asset_id, ts, source)`. Provider quotes and manual quotes
can coexist for the same date. "Never overwrite manual" means provider writes never touch
`source='MANUAL'` rows—they write to their own source key.

```rust
/// Persist quotes with source tracking
impl QuoteRepository {
    /// Upsert quotes by (asset_id, ts, source) - allows multiple sources per date
    pub async fn upsert_quotes(
        &self,
        asset_id: &str,
        quotes: Vec<Quote>,
        source: &str,
    ) -> Result<(), Error> {
        for quote in quotes {
            // Upsert by (asset_id, timestamp, source) - each source has its own row
            // This allows manual and provider quotes to coexist for same date
            self.upsert_quote(asset_id, &quote, source).await?;
        }
        Ok(())
    }

    /// SQL: INSERT OR REPLACE INTO quotes (asset_id, ts, source, ...) VALUES (?, ?, ?, ...)
    /// Uniqueness constraint: UNIQUE(asset_id, ts, source)
    async fn upsert_quote(&self, asset_id: &str, quote: &Quote, source: &str) -> Result<(), Error> {
        // ...
    }
}

/// Get current price respecting pricing mode
impl AssetService {
    pub async fn get_current_price(&self, asset: &Asset) -> Result<Option<Quote>, Error> {
        match asset.pricing_mode {
            PricingMode::Manual => {
                // Only manual quotes
                self.quote_repo.get_latest_quote(&asset.id, Some("MANUAL")).await
            }
            PricingMode::Market => {
                // Prefer preferred_provider, else latest
                if let Some(provider) = &asset.preferred_provider {
                    if let Some(q) = self.quote_repo.get_latest_quote(&asset.id, Some(provider)).await? {
                        return Ok(Some(q));
                    }
                }
                self.quote_repo.get_latest_quote(&asset.id, None).await
            }
            PricingMode::None => Ok(None),
            PricingMode::Derived => {
                // Calculate from underlying (future)
                Ok(None)
            }
        }
    }
}
```

---

## Part 7: UI / User Actions

### 7.1 Creating Assets

#### Security from Search

1. User searches "SHOP"
2. Provider returns candidates with exchange info
3. UI displays: "SHOP (TSX, CAD)", "SHOP (NASDAQ, USD)"
4. User selects one
5. System creates asset with **override only for search provider** (rules handle other providers):

```rust
Asset {
    id: "SHOP:XTSE".to_string(),       // Deterministic, human-readable
    kind: AssetKind::Security,
    symbol: "SHOP",                    // Ticker only, no suffix
    exchange_mic: Some("XTSE"),        // From selection
    currency: "CAD",                   // Trading currency
    pricing_mode: PricingMode::Market,
    provider_overrides: Some(ProviderOverrides {
        // Only seed for search provider - rules resolver handles other providers
        overrides: hashmap! {
            "YAHOO".to_string() => ProviderInstrument::EquitySymbol {
                symbol: "SHOP.TO".into()
            }
        }
    }),
    ..
}
```

#### FX Pair

1. User selects base=EUR, quote=USD
2. System creates:

```rust
Asset {
    kind: AssetKind::FxRate,
    symbol: "EUR",                     // Base currency
    currency: "USD",                   // Quote currency
    pricing_mode: PricingMode::Market,
    provider_overrides: Some(ProviderOverrides {
        overrides: hashmap! {
            "YAHOO".to_string() => ProviderInstrument::FxSymbol {
                symbol: "EURUSD=X".into()
            },
            "ALPHA_VANTAGE".to_string() => ProviderInstrument::FxPair {
                from: "EUR".into(),
                to: "USD".into()
            }
        }
    }),
    ..
}
```

#### Manual Asset (Property)

```rust
Asset {
    kind: AssetKind::Property,
    symbol: "HOME-1",                  // User label
    name: Some("Primary Residence"),
    currency: "USD",
    pricing_mode: PricingMode::Manual, // No provider calls
    ..
}
// User enters quotes manually → source='MANUAL'
```

### 7.2 Editing Assets

#### Switching Pricing Mode

| From | To | Effect |
|------|-----|--------|
| MARKET | MANUAL | Stops provider refresh. Provider quotes remain. Valuation uses manual quotes only. |
| MANUAL | MARKET | Resumes provider refresh. Manual quotes remain. Valuation uses provider quotes. |

```rust
impl AssetService {
    pub async fn update_pricing_mode(
        &self,
        asset_id: &str,
        new_mode: PricingMode,
    ) -> Result<Asset, Error> {
        // Just update the mode - don't delete any quotes
        self.repo.update_pricing_mode(asset_id, new_mode).await
    }
}
```

---

## Part 8: Migration Plan

### 8.1 Database Migration

```sql
-- Add new columns
ALTER TABLE assets ADD COLUMN exchange_mic TEXT;
ALTER TABLE assets ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'MARKET';
ALTER TABLE assets ADD COLUMN preferred_provider TEXT;
ALTER TABLE assets ADD COLUMN provider_overrides TEXT;
ALTER TABLE assets ADD COLUMN profile_json TEXT;

-- Add constraints (SQLite requires recreating table for CHECK constraints)
-- Or enforce in application code

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assets_exchange_mic ON assets(exchange_mic);
```

### 8.2 Data Backfill

```rust
/// Migration: backfill new columns from existing data
pub async fn migrate_assets(repo: &AssetRepository) -> Result<(), Error> {
    let assets = repo.get_all_assets().await?;

    for asset in assets {
        let mut updates = AssetUpdates::default();

        // 1. Set pricing_mode
        updates.pricing_mode = Some(match asset.data_source.as_deref() {
            Some("MANUAL") => PricingMode::Manual,
            _ if asset.kind == AssetKind::Cash => PricingMode::None,
            _ => PricingMode::Market,
        });

        // 2. Move quote_symbol to provider_overrides
        if let Some(quote_symbol) = &asset.quote_symbol {
            if quote_symbol != &asset.symbol {
                // Has a provider-specific symbol
                let provider = asset.data_source.clone().unwrap_or("YAHOO".to_string());
                let instrument = infer_provider_instrument(quote_symbol, &asset.kind);

                updates.provider_overrides = Some(ProviderOverrides {
                    overrides: hashmap! {
                        provider => instrument
                    }
                });
            }
        }

        // 3. Infer exchange_mic from quote_symbol suffix
        if asset.kind == AssetKind::Security {
            if let Some(quote_symbol) = &asset.quote_symbol {
                updates.exchange_mic = infer_mic_from_yahoo_symbol(quote_symbol);
            }
        }

        repo.update_asset(&asset.id, updates).await?;
    }

    Ok(())
}

fn infer_mic_from_yahoo_symbol(symbol: &str) -> Option<String> {
    // Extract suffix and map to MIC
    if let Some(dot_pos) = symbol.rfind('.') {
        let suffix = &symbol[dot_pos..];
        return match suffix {
            ".TO" => Some("XTSE".to_string()),
            ".V" => Some("XTSX".to_string()),
            ".L" => Some("XLON".to_string()),
            ".DE" => Some("XETR".to_string()),
            ".PA" => Some("XPAR".to_string()),
            ".AS" => Some("XAMS".to_string()),
            // ... etc
            _ => None,
        };
    }
    // No suffix = US exchange
    Some("XNAS".to_string()) // or XNYS - would need more context
}
```

### 8.3 Code Changes

1. **Remove from Asset struct:** `data_source`, `quote_symbol`
2. **Add to Asset struct:** `exchange_mic`, `pricing_mode`, `preferred_provider`, `provider_overrides`, `profile_json`
3. **Update pricing pipeline:** Gate by `pricing_mode == Market`
4. **Update quote writes:** Set `source` field appropriately

---

## Part 9: Acceptance Criteria

### Must Have

- [ ] No provider-specific symbols stored in `assets.symbol`
- [ ] Switching provider does not require rewriting assets
- [ ] FX works with AlphaVantage (`FX_DAILY` endpoint)
- [ ] Crypto works with AlphaVantage (`DIGITAL_CURRENCY_DAILY` endpoint)
- [ ] Manual-priced assets never trigger provider calls
- [ ] Manual quotes are never overwritten by provider refresh
- [ ] Dual-listed tickers supported via `exchange_mic` (SHOP:XTSE vs SHOP:XNAS)

### Should Have

- [ ] `provider_overrides` allows explicit per-provider symbols
- [ ] Resolver chain: overrides → rules
- [ ] Rate limiting per provider
- [ ] Circuit breaker per provider

### Nice to Have

- [ ] Data validation (OHLC invariants, staleness)
- [ ] Session type awareness (24/7 vs exchange hours)

---

## Appendix A: Full Exchange Map

See section 4.6 for complete MIC → provider suffix mappings covering:

- **North America:** NYSE, NASDAQ, TSX, TSX Venture, CSE, Mexico
- **UK & Ireland:** LSE, Dublin
- **Germany:** XETRA, Frankfurt, Stuttgart, Hamburg, Dusseldorf, Munich, Berlin
- **Euronext:** Paris, Amsterdam, Brussels, Lisbon
- **Southern Europe:** Milan, Madrid, Athens
- **Nordic:** Stockholm, Helsinki, Copenhagen, Oslo, Iceland
- **Central/Eastern Europe:** Swiss, Vienna, Warsaw, Prague, Budapest, Istanbul
- **China:** Shanghai, Shenzhen, Hong Kong
- **Japan & Korea:** Tokyo, KOSPI, KOSDAQ
- **Southeast Asia:** Singapore, Bangkok, Jakarta, Kuala Lumpur
- **India:** BSE, NSE
- **Taiwan:** TWSE, OTC
- **Oceania:** ASX, NZX
- **South America:** B3, Buenos Aires, Santiago
- **Middle East:** Tel Aviv, Saudi, Dubai, Abu Dhabi, Qatar
- **Africa:** Johannesburg, Cairo

## Appendix B: Dependencies

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
```
