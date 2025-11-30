# VN Market Rust Migration Plan

## Overview

This plan migrates the Python `vn-market-service` functionality into native Rust code within `src-core`, eliminating the need for an external Python service.

## Current State

```
┌─────────────────────┐     HTTP      ┌─────────────────────┐
│   VnMarketProvider  │ ────────────► │  vn-market-service  │
│   (Rust - Client)   │  localhost    │     (Python)        │
└─────────────────────┘    :8765      └─────────────────────┘
                                              │
                                              ▼
                                      ┌───────────────┐
                                      │ External APIs │
                                      │ VCI/FMarket/  │
                                      │     SJC       │
                                      └───────────────┘
```

## Target State

```
┌─────────────────────────────────────────────────────────┐
│                    src-core (Rust)                       │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │ VnMarketProvider│  │     vn_market module        │   │
│  │   (Facade)      │──│  ┌─────────┐ ┌───────────┐  │   │
│  └─────────────────┘  │  │VciClient│ │FMarketCli │  │   │
│                       │  └────┬────┘ └─────┬─────┘  │   │
│                       │       │            │        │   │
│                       │  ┌────┴────┐ ┌─────┴─────┐  │   │
│                       │  │SjcClient│ │ VnCache   │  │   │
│                       │  └─────────┘ └───────────┘  │   │
│                       └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │ External APIs │
                      │ VCI/FMarket/  │
                      │     SJC       │
                      └───────────────┘
```

---

## File Structure

### New Files to Create

```
src-core/src/
├── vn_market/                          # NEW MODULE
│   ├── mod.rs                          # Module exports
│   ├── clients/
│   │   ├── mod.rs
│   │   ├── vci_client.rs               # Stock/Index API client
│   │   ├── fmarket_client.rs           # Fund API client
│   │   └── sjc_client.rs               # Gold API client
│   ├── models/
│   │   ├── mod.rs
│   │   ├── stock.rs                    # VCI response models
│   │   ├── fund.rs                     # FMarket response models
│   │   └── gold.rs                     # SJC response models
│   ├── cache/
│   │   ├── mod.rs
│   │   ├── historical_cache.rs         # SQLite historical data cache
│   │   └── quote_cache.rs              # In-memory quote cache
│   ├── utils/
│   │   ├── mod.rs
│   │   ├── rate_limiter.rs             # API rate limiting
│   │   └── headers.rs                  # HTTP headers helper
│   └── errors.rs                       # VN market specific errors
├── market_data/
│   └── providers/
│       └── vn_market_provider.rs       # MODIFY: Remove HTTP calls, use vn_market module
```

### Files to Modify

| File | Change |
|------|--------|
| `src-core/src/lib.rs` | Add `pub mod vn_market;` |
| `src-core/src/market_data/providers/vn_market_provider.rs` | Refactor to use native clients |
| `src-core/src/schema.rs` | Add `vn_historical_records` table |
| `src-core/Cargo.toml` | Add `tokio`, `moka` (cache) dependencies |

---

## Phase 1: Foundation (2-3 days)

### 1.1 Create Module Structure

**File: `src-core/src/vn_market/mod.rs`**
```rust
pub mod clients;
pub mod models;
pub mod cache;
pub mod utils;
pub mod errors;

pub use clients::{VciClient, FMarketClient, SjcClient};
pub use errors::VnMarketError;
```

### 1.2 Add Dependencies

**File: `src-core/Cargo.toml`** (add to `[dependencies]`)
```toml
# Async runtime (if not already present)
tokio = { version = "1", features = ["full"] }

# In-memory cache with TTL
moka = { version = "0.12", features = ["future"] }

# Rate limiting
governor = "0.6"
```

### 1.3 Create Error Types

**File: `src-core/src/vn_market/errors.rs`**
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum VnMarketError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Invalid symbol: {0}")]
    InvalidSymbol(String),

    #[error("No data available for {symbol} on {date}")]
    NoData { symbol: String, date: String },

    #[error("Rate limited, retry after {0} seconds")]
    RateLimited(u64),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("API error: {0}")]
    ApiError(String),
}
```

### 1.4 Create HTTP Headers Helper

**File: `src-core/src/vn_market/utils/headers.rs`**
```rust
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};

pub fn vci_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(REFERER, HeaderValue::from_static("https://trading.vietcap.com.vn/"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://trading.vietcap.com.vn/"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
    ));
    headers
}

pub fn fmarket_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(REFERER, HeaderValue::from_static("https://fmarket.vn/"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://fmarket.vn/"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
    ));
    headers
}

pub fn sjc_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/x-www-form-urlencoded"));
    headers.insert(REFERER, HeaderValue::from_static("https://sjc.com.vn/bieu-do-gia-vang"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://sjc.com.vn"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
    ));
    headers
}
```

---

## Phase 2: API Clients (4-5 days)

### 2.1 VCI Client (Stocks & Indices)

**File: `src-core/src/vn_market/clients/vci_client.rs`**

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, NaiveDate};
use rust_decimal::Decimal;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::utils::headers::vci_headers;

const VCI_BASE_URL: &str = "https://trading.vietcap.com.vn/api";

#[derive(Clone)]
pub struct VciClient {
    client: Client,
}

// Request/Response models
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OhlcRequest {
    time_frame: String,
    symbols: Vec<String>,
    to: i64,
    count_back: i32,
}

#[derive(Deserialize)]
struct OhlcArrayResponse {
    t: Vec<i64>,
    o: Vec<f64>,
    h: Vec<f64>,
    l: Vec<f64>,
    c: Vec<f64>,
    v: Vec<i64>,
}

impl VciClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .default_headers(vci_headers())
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Get all listed symbols
    pub async fn get_all_symbols(&self) -> Result<Vec<VciSymbol>, VnMarketError> {
        let url = format!("{}/price/symbols/getAll", VCI_BASE_URL);
        let response = self.client.get(&url).send().await?;
        let symbols: Vec<VciSymbol> = response.json().await?;
        Ok(symbols)
    }

    /// Get historical OHLC data
    pub async fn get_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VciQuote>, VnMarketError> {
        let url = format!("{}/chart/OHLCChart/gap-chart", VCI_BASE_URL);
        let days = (end - start).num_days() + 1;
        let end_timestamp = end.and_hms_opt(23, 59, 59)
            .unwrap()
            .and_utc()
            .timestamp();

        let payload = OhlcRequest {
            time_frame: "ONE_DAY".to_string(),
            symbols: vec![symbol.to_string()],
            to: end_timestamp,
            count_back: days as i32,
        };

        let response = self.client
            .post(&url)
            .json(&payload)
            .send()
            .await?;

        let data: Vec<OhlcArrayResponse> = response.json().await?;
        
        if data.is_empty() {
            return Ok(vec![]);
        }

        let ohlc = &data[0];
        let quotes = self.transform_ohlc_response(symbol, ohlc);
        Ok(quotes)
    }

    fn transform_ohlc_response(&self, symbol: &str, data: &OhlcArrayResponse) -> Vec<VciQuote> {
        data.t.iter().enumerate().map(|(i, &ts)| {
            VciQuote {
                symbol: symbol.to_string(),
                timestamp: DateTime::from_timestamp(ts, 0).unwrap_or_default(),
                open: Decimal::from_f64_retain(data.o[i] * 1000.0).unwrap_or_default(),
                high: Decimal::from_f64_retain(data.h[i] * 1000.0).unwrap_or_default(),
                low: Decimal::from_f64_retain(data.l[i] * 1000.0).unwrap_or_default(),
                close: Decimal::from_f64_retain(data.c[i] * 1000.0).unwrap_or_default(),
                volume: data.v[i],
            }
        }).collect()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VciSymbol {
    pub symbol: String,
    pub board: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub organ_name: String,
    pub organ_short_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct VciQuote {
    pub symbol: String,
    pub timestamp: DateTime<Utc>,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: i64,
}
```

### 2.2 FMarket Client (Funds)

**File: `src-core/src/vn_market/clients/fmarket_client.rs`**

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use rust_decimal::Decimal;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::utils::headers::fmarket_headers;

const FMARKET_BASE_URL: &str = "https://api.fmarket.vn/res/products";

#[derive(Clone)]
pub struct FMarketClient {
    client: Client,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FundFilterRequest {
    types: Vec<String>,
    page: i32,
    page_size: i32,
    search_field: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NavHistoryRequest {
    is_all_data: i32,
    product_id: i32,
    from_date: String,
    to_date: String,
}

#[derive(Deserialize)]
struct FundListResponse {
    data: FundListData,
}

#[derive(Deserialize)]
struct FundListData {
    rows: Vec<FundInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FundInfo {
    pub id: i32,
    pub short_name: String,
    pub name: String,
    pub nav: Option<f64>,
}

#[derive(Deserialize)]
struct NavHistoryResponse {
    data: Vec<NavRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavRecord {
    pub nav_date: String,
    pub nav: f64,
}

impl FMarketClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .default_headers(fmarket_headers())
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Get all funds listing
    pub async fn get_funds_listing(&self) -> Result<Vec<FundInfo>, VnMarketError> {
        let url = format!("{}/filter", FMARKET_BASE_URL);
        
        let payload = FundFilterRequest {
            types: vec!["NEW_FUND".to_string(), "TRADING_FUND".to_string()],
            page: 1,
            page_size: 100,
            search_field: String::new(),
        };

        let response = self.client
            .post(&url)
            .json(&payload)
            .send()
            .await?;

        let result: FundListResponse = response.json().await?;
        Ok(result.data.rows)
    }

    /// Get fund NAV history
    pub async fn get_nav_history(
        &self,
        fund_id: i32,
        start_date: &str,  // YYYY-MM-DD
        end_date: &str,
    ) -> Result<Vec<NavRecord>, VnMarketError> {
        let url = format!("{}/get-nav-history", FMARKET_BASE_URL.trim_end_matches('s'));

        let payload = NavHistoryRequest {
            is_all_data: 0,
            product_id: fund_id,
            from_date: start_date.replace("-", ""),
            to_date: end_date.replace("-", ""),
        };

        let response = self.client
            .post(&url)
            .json(&payload)
            .send()
            .await?;

        let result: NavHistoryResponse = response.json().await?;
        Ok(result.data)
    }
}
```

### 2.3 SJC Client (Gold)

**File: `src-core/src/vn_market/clients/sjc_client.rs`**

```rust
use reqwest::Client;
use serde::Deserialize;
use chrono::NaiveDate;
use rust_decimal::Decimal;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::utils::headers::sjc_headers;

const SJC_URL: &str = "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx";

#[derive(Clone)]
pub struct SjcClient {
    client: Client,
}

#[derive(Deserialize)]
struct SjcResponse {
    success: bool,
    data: Vec<SjcGoldPrice>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SjcGoldPrice {
    pub type_name: String,
    pub branch_name: String,
    pub buy_value: f64,
    pub sell_value: f64,
}

impl SjcClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .default_headers(sjc_headers())
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Get gold price for a specific date
    pub async fn get_gold_price(&self, date: NaiveDate) -> Result<SjcGoldPrice, VnMarketError> {
        let date_str = date.format("%d/%m/%Y").to_string();
        let body = format!("method=GetSJCGoldPriceByDate&toDate={}", date_str);

        let response = self.client
            .post(SJC_URL)
            .body(body)
            .send()
            .await?;

        let result: SjcResponse = response.json().await?;

        if !result.success || result.data.is_empty() {
            return Err(VnMarketError::NoData {
                symbol: "VN.GOLD".to_string(),
                date: date.to_string(),
            });
        }

        // Return first entry (SJC standard gold bar)
        Ok(result.data.into_iter().next().unwrap())
    }

    /// Get gold price history for date range
    pub async fn get_gold_history(
        &self,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<(NaiveDate, SjcGoldPrice)>, VnMarketError> {
        let mut results = Vec::new();
        let mut current = start;

        while current <= end {
            // Skip weekends
            if current.weekday().num_days_from_monday() < 5 {
                match self.get_gold_price(current).await {
                    Ok(price) => results.push((current, price)),
                    Err(VnMarketError::NoData { .. }) => {
                        // Skip dates with no data (holidays)
                    }
                    Err(e) => return Err(e),
                }
            }
            current = current.succ_opt().unwrap();
        }

        Ok(results)
    }
}
```

---

## Phase 3: Caching Layer (2-3 days)

### 3.1 Database Schema Migration

**File: `src-core/migrations/XXXXXX_create_vn_historical_records/up.sql`**

```sql
CREATE TABLE IF NOT EXISTS vn_historical_records (
    id TEXT PRIMARY KEY NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL,  -- STOCK, FUND, GOLD, INDEX
    date TEXT NOT NULL,
    open TEXT NOT NULL,
    high TEXT NOT NULL,
    low TEXT NOT NULL,
    close TEXT NOT NULL,
    volume TEXT NOT NULL,
    nav TEXT,                  -- For funds
    buy_price TEXT,            -- For gold
    sell_price TEXT,           -- For gold
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(symbol, date, asset_type)
);

CREATE INDEX idx_vn_historical_symbol_date ON vn_historical_records(symbol, date);
CREATE INDEX idx_vn_historical_asset_type ON vn_historical_records(asset_type);
```

### 3.2 Historical Cache Implementation

**File: `src-core/src/vn_market/cache/historical_cache.rs`**

```rust
use diesel::prelude::*;
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;

pub struct VnHistoricalCache {
    // Uses existing diesel connection pool
}

impl VnHistoricalCache {
    /// Get cached records for date range
    pub fn get_cached_records(
        &self,
        conn: &mut SqliteConnection,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
        asset_type: &str,
    ) -> Result<Vec<VnHistoricalRecord>, diesel::result::Error> {
        use crate::schema::vn_historical_records::dsl::*;

        vn_historical_records
            .filter(symbol.eq(symbol))
            .filter(asset_type.eq(asset_type))
            .filter(date.ge(start.to_string()))
            .filter(date.le(end.to_string()))
            .order(date.asc())
            .load::<VnHistoricalRecord>(conn)
    }

    /// Store records in cache
    pub fn store_records(
        &self,
        conn: &mut SqliteConnection,
        records: &[VnHistoricalRecord],
    ) -> Result<usize, diesel::result::Error> {
        use crate::schema::vn_historical_records::dsl::*;

        diesel::insert_or_replace_into(vn_historical_records)
            .values(records)
            .execute(conn)
    }

    /// Calculate missing date ranges
    pub fn get_missing_ranges(
        &self,
        conn: &mut SqliteConnection,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
        asset_type: &str,
    ) -> Vec<(NaiveDate, NaiveDate)> {
        // Get cached dates
        let cached = self.get_cached_dates(conn, symbol, start, end, asset_type);
        
        // Calculate gaps
        calculate_missing_ranges(start, end, &cached)
    }
}
```

### 3.3 In-Memory Quote Cache

**File: `src-core/src/vn_market/cache/quote_cache.rs`**

```rust
use moka::future::Cache;
use std::time::Duration;

pub struct VnQuoteCache {
    stock_cache: Cache<String, CachedQuote>,
    fund_cache: Cache<String, CachedQuote>,
    gold_cache: Cache<String, CachedQuote>,
}

impl VnQuoteCache {
    pub fn new() -> Self {
        Self {
            // Stocks: 1 hour TTL
            stock_cache: Cache::builder()
                .time_to_live(Duration::from_secs(3600))
                .max_capacity(1000)
                .build(),
            // Funds: 24 hour TTL (NAV updates once daily)
            fund_cache: Cache::builder()
                .time_to_live(Duration::from_secs(86400))
                .max_capacity(200)
                .build(),
            // Gold: 30 min TTL
            gold_cache: Cache::builder()
                .time_to_live(Duration::from_secs(1800))
                .max_capacity(10)
                .build(),
        }
    }

    pub async fn get_stock(&self, symbol: &str) -> Option<CachedQuote> {
        self.stock_cache.get(symbol).await
    }

    pub async fn set_stock(&self, symbol: &str, quote: CachedQuote) {
        self.stock_cache.insert(symbol.to_string(), quote).await;
    }

    // Similar for fund and gold...
}
```

---

## Phase 4: Refactor VnMarketProvider (2-3 days)

### 4.1 Update Provider to Use Native Clients

**File: `src-core/src/market_data/providers/vn_market_provider.rs`**

```rust
use crate::vn_market::{
    VciClient, FMarketClient, SjcClient,
    cache::{VnHistoricalCache, VnQuoteCache},
};

pub struct VnMarketProvider {
    vci_client: VciClient,
    fmarket_client: FMarketClient,
    sjc_client: SjcClient,
    historical_cache: VnHistoricalCache,
    quote_cache: VnQuoteCache,
    fund_id_map: HashMap<String, i32>,  // symbol -> fund_id
}

impl VnMarketProvider {
    pub fn new() -> Self {
        Self {
            vci_client: VciClient::new(),
            fmarket_client: FMarketClient::new(),
            sjc_client: SjcClient::new(),
            historical_cache: VnHistoricalCache::new(),
            quote_cache: VnQuoteCache::new(),
            fund_id_map: HashMap::new(),
        }
    }

    /// Initialize fund ID map from FMarket listing
    pub async fn init_fund_map(&mut self) -> Result<(), MarketDataError> {
        let funds = self.fmarket_client.get_funds_listing().await
            .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;
        
        for fund in funds {
            self.fund_id_map.insert(fund.short_name.clone(), fund.id);
        }
        Ok(())
    }

    /// Detect asset type from symbol
    fn detect_asset_type(&self, symbol: &str) -> AssetType {
        let symbol_upper = symbol.to_uppercase();
        
        if symbol_upper.contains("GOLD") {
            AssetType::Gold
        } else if symbol_upper.contains("INDEX") {
            AssetType::Index
        } else if self.fund_id_map.contains_key(&symbol_upper) {
            AssetType::Fund
        } else {
            AssetType::Stock
        }
    }
}

#[async_trait]
impl MarketDataProvider for VnMarketProvider {
    async fn get_latest_quote(
        &self,
        symbol: &str,
        _fallback_currency: String,
    ) -> Result<Quote, MarketDataError> {
        let asset_type = self.detect_asset_type(symbol);
        
        match asset_type {
            AssetType::Stock | AssetType::Index => {
                // Check cache first
                if let Some(cached) = self.quote_cache.get_stock(symbol).await {
                    return Ok(cached.into());
                }
                
                // Fetch from VCI
                let today = Utc::now().date_naive();
                let quotes = self.vci_client.get_history(symbol, today, today).await
                    .map_err(|e| MarketDataError::ProviderError(e.to_string()))?;
                
                // Transform and cache
                // ...
            }
            AssetType::Fund => {
                // Get from FMarket...
            }
            AssetType::Gold => {
                // Get from SJC...
            }
        }
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        _fallback_currency: String,
    ) -> Result<Vec<Quote>, MarketDataError> {
        let asset_type = self.detect_asset_type(symbol);
        let start_date = system_time_to_naive_date(start);
        let end_date = system_time_to_naive_date(end);

        // Check cache for missing ranges
        let missing = self.historical_cache.get_missing_ranges(
            symbol, start_date, end_date, asset_type.as_str()
        );

        // Fetch only missing data
        for (range_start, range_end) in missing {
            let new_data = match asset_type {
                AssetType::Stock | AssetType::Index => {
                    self.vci_client.get_history(symbol, range_start, range_end).await?
                }
                // ... other asset types
            };
            
            // Store in cache
            self.historical_cache.store_records(&new_data)?;
        }

        // Return full range from cache
        self.historical_cache.get_cached_records(symbol, start_date, end_date, asset_type.as_str())
    }
}
```

---

## Phase 5: Testing & Integration (2-3 days)

### 5.1 Unit Tests

**File: `src-core/src/vn_market/clients/vci_client_test.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_all_symbols() {
        let client = VciClient::new();
        let symbols = client.get_all_symbols().await.unwrap();
        
        assert!(!symbols.is_empty());
        assert!(symbols.iter().any(|s| s.symbol == "VNM"));
    }

    #[tokio::test]
    async fn test_get_stock_history() {
        let client = VciClient::new();
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2024, 1, 31).unwrap();
        
        let quotes = client.get_history("VNM", start, end).await.unwrap();
        
        assert!(!quotes.is_empty());
        assert!(quotes[0].close > Decimal::ZERO);
    }
}
```

### 5.2 Integration Tests

**File: `src-core/tests/vn_market_integration_test.rs`**

```rust
#[tokio::test]
async fn test_vn_market_provider_full_flow() {
    let provider = VnMarketProvider::new();
    provider.init_fund_map().await.unwrap();

    // Test stock quote
    let stock_quote = provider.get_latest_quote("VNM", "VND".to_string()).await.unwrap();
    assert_eq!(stock_quote.symbol, "VNM");

    // Test fund quote
    let fund_quote = provider.get_latest_quote("VESAF", "VND".to_string()).await.unwrap();
    assert_eq!(fund_quote.symbol, "VESAF");

    // Test gold quote
    let gold_quote = provider.get_latest_quote("VN.GOLD", "VND".to_string()).await.unwrap();
    assert_eq!(gold_quote.symbol, "VN.GOLD");
}
```

---

## Timeline Summary

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Module structure, errors, headers | 2-3 days | None |
| **Phase 2** | VCI, FMarket, SJC clients | 4-5 days | Phase 1 |
| **Phase 3** | Caching layer, DB migration | 2-3 days | Phase 2 |
| **Phase 4** | Refactor VnMarketProvider | 2-3 days | Phase 3 |
| **Phase 5** | Testing & integration | 2-3 days | Phase 4 |

**Total: 12-17 days**

---

## Rollback Plan

If issues arise, the existing `vn-market-service` Python service can still be used:

1. Keep Python service running on port 8765
2. Revert `VnMarketProvider` to use HTTP client
3. Gradually migrate one asset type at a time

---

## Success Metrics

- [ ] All existing tests pass
- [ ] Stock quotes match Python service output
- [ ] Fund NAV history matches Python service output
- [ ] Gold prices match Python service output
- [ ] Response time < 500ms for cached data
- [ ] No Python dependency in production build
