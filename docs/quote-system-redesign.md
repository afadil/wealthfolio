# Quote System Redesign

## Goals

- Remove ambiguity between `asset_id`, canonical identity, and provider symbols
- Split storage (DB) from provider IO (external APIs) from orchestration (resolution/fallback/sync)
- Strong typing across boundaries (no naked `&str` IDs)
- Enforce one quote per asset per day per source with deterministic IDs
- Support multiple providers with coverage filtering, fallback, rate limiting

## Non-Goals (this phase)

- Real-time streaming
- Tick/intraday storage (daily bars only)
- Full amortization/payment tracking for liabilities

---

## Vocabulary & Types

### Core IDs

```rust
/// Database identity - our internal ID
/// Examples: "AAPL:XNAS", "USD/CAD", "PROP-abc123"
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetId(pub String);

/// Provider identifier
/// Examples: "YAHOO", "ALPHA_VANTAGE", "MARKETDATA_APP"
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderId(pub String);

/// UTC date bucket for daily quotes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Day(pub NaiveDate);

/// Quote data source
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuoteSource {
    Manual,
    Provider(ProviderId),
}
```

### Canonical Market Identity

Lives in `market-data` crate. Represents what the instrument IS, not how to fetch it.

```rust
pub enum InstrumentId {
    Equity { ticker: Arc<str>, mic: Option<Cow<'static, str>> },
    Fx { base: Cow<'static, str>, quote: Cow<'static, str> },
    Crypto { base: Arc<str>, quote: Cow<'static, str> },
    Metal { code: Arc<str>, quote: Cow<'static, str> },
}
```

### Provider Request Params

Provider-specific request description. NOT "just a string" because providers have different APIs.

```rust
pub enum ProviderInstrument {
    EquitySymbol { symbol: Arc<str> },                    // "SHOP.TO"
    FxSymbol { symbol: Arc<str> },                        // "EURUSD=X" (Yahoo)
    FxPair { from: Cow<'static, str>, to: Cow<'static, str> }, // AlphaVantage
    CryptoSymbol { symbol: Arc<str> },                    // "BTC-USD"
    CryptoPair { symbol: Arc<str>, market: Cow<'static, str> },
    MetalSymbol { symbol: Arc<str>, quote_ccy: Cow<'static, str> },
}
```

---

## Invariants

1. **Quotes keyed by `(asset_id, day, source)`** - deterministic, no duplicates
2. **Daily time semantics** - all provider data normalized to UTC day
3. **Manual quotes never overwritten** - provider refresh skips `source=MANUAL`
4. **No provider symbols in `assets.symbol`** - provider-specific data lives in `provider_overrides`
5. **Resolution only in ProviderRegistry** - no other code resolves canonical → provider

---

## Data Model

### `quotes` Table

```sql
CREATE TABLE quotes (
    id          TEXT PRIMARY KEY,      -- "{asset_id}_{YYYY-MM-DD}_{source}"
    asset_id    TEXT NOT NULL,
    day         TEXT NOT NULL,         -- "YYYY-MM-DD" (UTC)
    source      TEXT NOT NULL,         -- "MANUAL" or provider id
    open        REAL,
    high        REAL,
    low         REAL,
    close       REAL NOT NULL,
    adjclose    REAL,                  -- Adjusted close (splits/dividends)
    volume      REAL,
    currency    TEXT NOT NULL,
    notes       TEXT,                  -- User notes (manual quotes)
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (length(day) = 10)
);

CREATE UNIQUE INDEX uq_quotes_asset_day_source ON quotes(asset_id, day, source);
CREATE INDEX idx_quotes_asset_day ON quotes(asset_id, day);
CREATE INDEX idx_quotes_asset_source_day ON quotes(asset_id, source, day);
```

### Quote ID Construction

```rust
fn quote_id(asset_id: &AssetId, day: Day, source: &QuoteSource) -> String {
    let source_str = match source {
        QuoteSource::Manual => "MANUAL".to_string(),
        QuoteSource::Provider(p) => p.0.clone(),
    };
    format!("{}_{}_{}", asset_id.0, day.0.format("%Y-%m-%d"), source_str)
}
```

### `quote_sync_state` Table

```sql
CREATE TABLE quote_sync_state (
    asset_id            TEXT PRIMARY KEY,
    last_synced_day     TEXT,           -- "YYYY-MM-DD"
    first_activity_day  TEXT,           -- Earliest activity for backfill
    needs_backfill      INTEGER DEFAULT 0,
    last_provider       TEXT,           -- Last successful provider
    last_error          TEXT,
    error_count         INTEGER DEFAULT 0,
    updated_at          TEXT NOT NULL
);
```

---

## Service Boundaries

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    App Layer (Commands)                      │
├─────────────────────────────────────────────────────────────┤
│  QuoteSyncService  │  QuoteImportService  │  AssetService   │
├────────────────────┴───────────────────────┴────────────────┤
│                      ProviderRegistry                        │
│      (resolution, coverage, fallback, rate limiting)         │
├─────────────────────────────────────────────────────────────┤
│     QuoteStore      │       MarketDataProvider[]            │
│     (DB only)       │       (dumb IO per provider)          │
├─────────────────────┴───────────────────────────────────────┤
│                   Database / External APIs                   │
└─────────────────────────────────────────────────────────────┘
```

### Who Speaks What

| Layer | Input | Output |
|-------|-------|--------|
| **QuoteStore** | `AssetId`, `Day`, `QuoteSource` | `Quote` |
| **MarketDataProvider** | `ProviderInstrument` | `ProviderQuote` |
| **ProviderRegistry** | `InstrumentId` + overrides | `Quote` (mapped) |
| **QuoteSyncService** | `AssetId` | `SyncReport` |

---

## Layer 1: QuoteStore (DB Only)

Pure CRUD. Only speaks `AssetId`, `Day`, `QuoteSource`. No provider concepts.

```rust
#[async_trait]
pub trait QuoteStore: Send + Sync {
    // === Single Asset Queries ===

    /// Get latest quote for an asset
    fn latest(
        &self,
        asset_id: &AssetId,
        source: Option<&QuoteSource>,
    ) -> Result<Option<Quote>>;

    /// Get quotes in date range for single asset
    fn range(
        &self,
        asset_id: &AssetId,
        start: Day,
        end: Day,
        source: Option<&QuoteSource>,
    ) -> Result<Vec<Quote>>;

    // === Batch Queries (for efficiency) ===

    /// Get latest quotes for multiple assets
    fn latest_batch(
        &self,
        asset_ids: &[AssetId],
        source: Option<&QuoteSource>,
    ) -> Result<HashMap<AssetId, Quote>>;

    /// Get latest + previous quote for daily change calculation
    fn latest_with_previous(
        &self,
        asset_ids: &[AssetId],
    ) -> Result<HashMap<AssetId, QuotePair>>;

    /// Get quotes in date range for multiple assets
    fn range_batch(
        &self,
        asset_ids: &[AssetId],
        start: Day,
        end: Day,
        source: Option<&QuoteSource>,
    ) -> Result<HashMap<AssetId, Vec<Quote>>>;

    // === Mutations ===

    /// Upsert daily quotes - keyed by (asset_id, day, source)
    async fn upsert(&self, quotes: &[Quote]) -> Result<usize>;

    /// Delete a specific quote by ID
    async fn delete(&self, quote_id: &str) -> Result<()>;
}

pub struct Quote {
    pub id: String,              // "{asset_id}_{day}_{source}"
    pub asset_id: AssetId,
    pub day: Day,
    pub source: QuoteSource,
    pub open: Option<Decimal>,
    pub high: Option<Decimal>,
    pub low: Option<Decimal>,
    pub close: Decimal,
    pub adjclose: Option<Decimal>,
    pub volume: Option<Decimal>,
    pub currency: Currency,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub struct QuotePair {
    pub latest: Quote,
    pub previous: Option<Quote>,
}
```

---

## Layer 2: MarketDataProvider (Dumb IO)

Each provider is a thin wrapper around external API. Takes `ProviderInstrument`, returns raw data.

```rust
#[async_trait]
pub trait MarketDataProvider: Send + Sync {
    /// Provider identifier
    fn id(&self) -> &ProviderId;

    /// What this provider supports
    fn capabilities(&self) -> &ProviderCapabilities;

    /// Search for instruments (optional capability)
    async fn search(&self, query: &str) -> Result<Vec<ProviderSearchHit>>;

    /// Fetch instrument profile (optional capability)
    async fn fetch_profile(
        &self,
        instrument: &ProviderInstrument,
    ) -> Result<ProviderProfile>;

    /// Fetch daily historical quotes
    async fn fetch_quotes(
        &self,
        req: &ProviderQuoteRequest,
    ) -> Result<Vec<ProviderQuote>>;
}

pub struct ProviderQuoteRequest {
    pub instrument: ProviderInstrument,
    pub start: Day,
    pub end: Day,
}

/// Raw quote from provider - no asset_id yet
pub struct ProviderQuote {
    pub timestamp: DateTime<Utc>,
    pub open: Option<Decimal>,
    pub high: Option<Decimal>,
    pub low: Option<Decimal>,
    pub close: Decimal,
    pub adjclose: Option<Decimal>,
    pub volume: Option<Decimal>,
    pub currency: Currency,
}

pub struct ProviderSearchHit {
    pub instrument: ProviderInstrument,
    pub canonical: InstrumentId,
    pub name: String,
    pub currency: Currency,
    pub exchange: Option<String>,
    pub asset_type: Option<String>,
}

pub struct ProviderCapabilities {
    pub supports_search: bool,
    pub supports_profile: bool,
    pub supports_historical: bool,
    pub supported_instruments: HashSet<InstrumentKind>,
    pub coverage: ProviderCoverage,
    pub rate_limit: Option<RateLimit>,
}

pub struct ProviderCoverage {
    pub us_only: bool,
    pub allowed_mics: Option<HashSet<String>>,
    pub allow_unknown_mic: bool,
    pub allowed_currencies: Option<HashSet<Currency>>,
}
```

---

## Layer 3: ProviderRegistry (The Brain)

Single place that:
- Filters providers by capabilities/coverage
- Resolves `InstrumentId` + overrides → `ProviderInstrument`
- Handles fallback ordering
- Applies rate limiting + circuit breaker
- Maps `ProviderQuote` → `Quote`

```rust
pub struct QuoteFetchRequest {
    pub asset_id: AssetId,
    pub instrument: InstrumentId,
    pub overrides: Option<ProviderOverrides>,
    pub preferred_provider: Option<ProviderId>,
}

#[async_trait]
pub trait ProviderRegistry: Send + Sync {
    /// Fetch daily quotes with resolution + fallback
    async fn fetch_quotes(
        &self,
        req: &QuoteFetchRequest,
        start: Day,
        end: Day,
    ) -> Result<Vec<Quote>>;

    /// Fetch latest quote
    async fn fetch_latest(
        &self,
        req: &QuoteFetchRequest,
    ) -> Result<Option<Quote>>;

    /// Search across all providers that support search
    async fn search(&self, query: &str) -> Result<Vec<SearchCandidate>>;

    /// Fetch profile with fallback
    async fn fetch_profile(
        &self,
        req: &QuoteFetchRequest,
    ) -> Result<ProviderProfile>;

    /// Get all providers and their status
    fn providers(&self) -> Vec<ProviderStatus>;

    /// Update provider settings
    async fn update_provider(
        &self,
        id: &ProviderId,
        enabled: bool,
        priority: i32,
    ) -> Result<()>;
}

/// Search result with full context for asset creation
pub struct SearchCandidate {
    pub provider: ProviderId,
    pub provider_instrument: ProviderInstrument,
    pub canonical: InstrumentId,
    pub suggested_asset_id: AssetId,
    pub name: String,
    pub currency: Currency,
    pub exchange: Option<String>,
    pub asset_type: Option<String>,
}

pub struct ProviderStatus {
    pub id: ProviderId,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub requires_api_key: bool,
    pub has_api_key: bool,
    pub circuit_breaker_open: bool,
    pub last_error: Option<String>,
}
```

### Resolution Flow

```
QuoteFetchRequest {
    asset_id: "AAPL:XNAS",
    instrument: Equity { ticker: "AAPL", mic: Some("XNAS") },
    overrides: None,
    preferred_provider: None,
}
    │
    ▼
ProviderRegistry.fetch_quotes(req, start, end)
    │
    ├─► Filter providers by coverage (XNAS → US exchange → Yahoo OK)
    ├─► Check overrides → None
    ├─► Resolve: Equity("AAPL", "XNAS") → ProviderInstrument::EquitySymbol { symbol: "AAPL" }
    ├─► Rate limit check
    ├─► Yahoo.fetch_quotes(ProviderQuoteRequest)
    ├─► Map ProviderQuote → Quote { asset_id, day, source: Provider("YAHOO"), ... }
    │
    ▼
Vec<Quote>
```

### Provider Selection Order

1. `preferred_provider` (if set, enabled, and supports instrument)
2. Providers sorted by priority (descending)
3. Skip providers where coverage doesn't match
4. Skip providers with open circuit breaker

### Fallback Policy

| Error | Action |
|-------|--------|
| `SymbolNotFound` | Try next provider |
| `UnsupportedInstrument` | Try next provider |
| `RateLimited` | Backoff, try next provider |
| `Timeout` | Try next provider, increment circuit breaker |
| `ValidationFailed` | Reject result, try next provider |
| All providers failed | Return error with details |

---

## Layer 4: QuoteSyncService (Orchestration)

Coordinates sync. Talks to `ProviderRegistry` and `QuoteStore`. Never calls providers directly.

```rust
pub struct QuoteSyncService<S, R, A, T>
where
    S: QuoteStore,
    R: ProviderRegistry,
    A: AssetRepository,
    T: SyncStateStore,
{
    store: Arc<S>,
    registry: Arc<R>,
    assets: Arc<A>,
    state: Arc<T>,
}

impl<S, R, A, T> QuoteSyncService<S, R, A, T> {
    /// Sync all assets that need updates
    pub async fn sync_all(&self) -> Result<SyncReport>;

    /// Sync specific assets
    pub async fn sync_assets(&self, asset_ids: &[AssetId]) -> Result<SyncReport>;

    /// Get assets pending sync
    pub fn pending(&self) -> Result<Vec<SyncPlan>>;

    // === Activity Lifecycle Hooks ===

    pub async fn on_activity_created(&self, asset_id: &AssetId, date: Day) -> Result<()>;
    pub async fn on_activity_deleted(&self, asset_id: &AssetId) -> Result<()>;
    pub async fn on_asset_deleted(&self, asset_id: &AssetId) -> Result<()>;
}

pub struct SyncReport {
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub assets_processed: usize,
    pub quotes_fetched: usize,
    pub quotes_saved: usize,
    pub failures: Vec<SyncFailure>,
}

pub struct SyncFailure {
    pub asset_id: AssetId,
    pub error: String,
    pub provider_errors: Vec<(ProviderId, String)>,
}

pub struct SyncPlan {
    pub asset_id: AssetId,
    pub instrument: InstrumentId,
    pub start: Day,
    pub end: Day,
    pub reason: SyncReason,
}

pub enum SyncReason {
    NewAsset,
    Backfill { activity_date: Day },
    Incremental,
    Manual,
}
```

### Sync Policy (per asset)

1. Skip if `pricing_mode != Market`
2. Determine date range:
   - **New asset**: backfill window (e.g., 30 days)
   - **Incremental**: `last_synced_day + 1` → today
   - **Backfill**: `first_activity_day` → today
3. Build `QuoteFetchRequest` from asset
4. Call `registry.fetch_quotes(req, start, end)`
5. Call `store.upsert(quotes)`
6. Update sync state

---

## Layer 5: QuoteImportService (Manual Entry)

Handles CSV import and manual quote entry. All quotes created with `source = Manual`.

```rust
pub struct QuoteImportService<S: QuoteStore> {
    store: Arc<S>,
}

impl<S: QuoteStore> QuoteImportService<S> {
    /// Import quotes from CSV
    pub async fn import_csv(
        &self,
        asset_id: &AssetId,
        currency: Currency,
        records: Vec<QuoteImportRecord>,
        overwrite: bool,
    ) -> Result<ImportReport>;

    /// Add a single manual quote
    pub async fn add_manual(
        &self,
        asset_id: &AssetId,
        day: Day,
        close: Decimal,
        currency: Currency,
        notes: Option<String>,
    ) -> Result<Quote>;

    /// Update a manual quote
    pub async fn update_manual(
        &self,
        quote_id: &str,
        close: Decimal,
        notes: Option<String>,
    ) -> Result<Quote>;
}

pub struct QuoteImportRecord {
    pub date: String,           // "YYYY-MM-DD"
    pub open: Option<Decimal>,
    pub high: Option<Decimal>,
    pub low: Option<Decimal>,
    pub close: Decimal,
    pub volume: Option<Decimal>,
    pub notes: Option<String>,
}

pub struct ImportReport {
    pub total: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<ImportError>,
}
```

---

## Quote Normalization Rules

### Provider → Storage

1. Provider returns `DateTime<Utc>` → normalize to `Day(utc_date)`
2. If provider returns multiple points per day → use last close
3. Store currency as-is from provider (FX conversion at valuation time)
4. Add `asset_id` from request
5. Add `source = Provider(provider_id)`
6. Generate deterministic `id`

### Manual Quotes

- Created with `source = Manual`
- Never overwritten by provider sync
- Can include `notes` field

---

## Error Types

```rust
pub enum QuoteError {
    // Store errors
    NotFound { asset_id: AssetId, day: Day },
    DatabaseError(String),

    // Provider errors
    SymbolNotFound { provider: ProviderId, instrument: ProviderInstrument },
    UnsupportedInstrument { provider: ProviderId, instrument: InstrumentId },
    RateLimited { provider: ProviderId, retry_after: Option<Duration> },
    ProviderTimeout { provider: ProviderId },
    ProviderError { provider: ProviderId, message: String },

    // Registry errors
    NoProvidersAvailable,
    AllProvidersFailed { errors: Vec<(ProviderId, String)> },
    ResolutionFailed { instrument: InstrumentId },

    // Validation errors
    InvalidDateRange,
    InvalidQuoteData(String),
}
```

---

## File Structure

```
crates/core/src/
├── quotes/
│   ├── mod.rs
│   ├── types.rs           # AssetId, Day, QuoteSource, ProviderId
│   ├── model.rs           # Quote, QuotePair
│   ├── store.rs           # QuoteStore trait
│   ├── sync.rs            # QuoteSyncService
│   ├── sync_state.rs      # SyncStateStore trait, SyncPlan
│   ├── import.rs          # QuoteImportService
│   └── error.rs           # QuoteError
│
├── market_data/
│   ├── mod.rs
│   ├── provider.rs        # MarketDataProvider trait, ProviderQuote
│   ├── registry.rs        # ProviderRegistry trait + impl
│   ├── resolver.rs        # InstrumentId → ProviderInstrument
│   ├── coverage.rs        # ProviderCoverage, capability checks
│   ├── rate_limit.rs      # TokenBucketRateLimiter
│   ├── circuit_breaker.rs # SimpleCircuitBreaker
│   └── providers/
│       ├── mod.rs
│       ├── yahoo.rs
│       ├── alpha_vantage.rs
│       └── ...
│
└── ... (other modules)
```

---

## Migration Plan

### Phase 1: Strong Types
- [ ] Create `quotes/types.rs` with `AssetId`, `Day`, `QuoteSource`, `ProviderId`
- [ ] Add `From`/`Into` impls for compatibility during migration

### Phase 2: Schema Migration
- [ ] Add new columns to `quotes` table (`day`, `source` if missing)
- [ ] Backfill `day` from existing `timestamp`
- [ ] Backfill `source` from existing `data_source`
- [ ] Generate deterministic `id` values
- [ ] Create indexes

### Phase 3: QuoteStore
- [ ] Implement new `QuoteStore` trait in `storage-sqlite`
- [ ] Add batch methods (`latest_batch`, `range_batch`, `latest_with_previous`)
- [ ] Update callers incrementally

### Phase 4: Provider Extraction
- [ ] Extract `MarketDataProvider` trait
- [ ] Implement for Yahoo, AlphaVantage, etc.
- [ ] Move provider-specific logic out of client

### Phase 5: ProviderRegistry
- [ ] Create `ProviderRegistry` trait and implementation
- [ ] Implement resolver chain
- [ ] Add coverage filtering
- [ ] Add rate limiting + circuit breaker

### Phase 6: QuoteSyncService
- [ ] Refactor to use Registry + Store only
- [ ] Remove direct provider calls
- [ ] Update activity hooks

### Phase 7: QuoteImportService
- [ ] Extract import logic from old service
- [ ] Ensure manual quotes use `source = Manual`

### Phase 8: App Layer
- [ ] Update `src-tauri/src/context/providers.rs`
- [ ] Update commands
- [ ] Update event listeners

### Phase 9: Cleanup
- [ ] Delete `market_data/market_data_service.rs`
- [ ] Delete `market_data/market_data_traits.rs`
- [ ] Delete `quotes/service.rs` (unified service)
- [ ] Update re-exports

### Phase 10: Tests
- [ ] Update mocks for new traits
- [ ] Add integration tests per layer

---

## Acceptance Criteria

- [ ] No provider symbol stored in `assets.symbol`
- [ ] Provider resolution only inside `ProviderRegistry`
- [ ] Quotes enforce one-per-day-per-source with deterministic IDs
- [ ] Manual quotes never overwritten by sync
- [ ] Coverage filtering prevents calling US-only provider for non-US assets
- [ ] Registry fallback works across providers
- [ ] All quote consumers depend only on `QuoteStore`
- [ ] All provider fetch goes through `ProviderRegistry`
