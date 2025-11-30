//! VN Market Service - Facade for all VN market data operations
//!
//! This service coordinates between API clients and caching layers
//! to provide a unified interface for Vietnamese market data.

use chrono::{NaiveDate, Utc};
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use log::{debug, warn};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::vn_market::cache::historical_cache::VnHistoricalCache;
use crate::vn_market::cache::models::{CachedQuote, VnAssetType, VnHistoricalRecord};
use crate::vn_market::cache::quote_cache::VnQuoteCache;
use crate::vn_market::clients::{FMarketClient, SjcClient, VciClient};
use crate::vn_market::errors::VnMarketError;
use crate::vn_market::models::gold::is_gold_symbol;
use crate::vn_market::models::stock::map_index_symbol;

type DbPool = Pool<ConnectionManager<SqliteConnection>>;

/// VN Market Service providing unified access to Vietnamese market data
pub struct VnMarketService {
    /// VCI client for stocks and indices
    vci_client: VciClient,
    /// FMarket client for mutual funds
    fmarket_client: Arc<RwLock<FMarketClient>>,
    /// SJC client for gold prices
    sjc_client: SjcClient,
    /// In-memory quote cache
    quote_cache: VnQuoteCache,
    /// SQLite-backed historical cache (optional)
    historical_cache: Option<VnHistoricalCache>,
    /// Fund symbol -> fund_id mapping
    fund_ids: Arc<RwLock<HashMap<String, i32>>>,
    /// Known fund symbols (for detection)
    known_funds: Arc<RwLock<Vec<String>>>,
}

impl VnMarketService {
    /// Create a new VN Market Service without historical cache
    pub fn new() -> Self {
        Self {
            vci_client: VciClient::new(),
            fmarket_client: Arc::new(RwLock::new(FMarketClient::new())),
            sjc_client: SjcClient::new(),
            quote_cache: VnQuoteCache::new(),
            historical_cache: None,
            fund_ids: Arc::new(RwLock::new(HashMap::new())),
            known_funds: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Create a new VN Market Service with historical cache (DB-backed)
    pub fn with_pool(pool: DbPool) -> Self {
        Self {
            vci_client: VciClient::new(),
            fmarket_client: Arc::new(RwLock::new(FMarketClient::new())),
            sjc_client: SjcClient::new(),
            quote_cache: VnQuoteCache::new(),
            historical_cache: Some(VnHistoricalCache::new(pool)),
            fund_ids: Arc::new(RwLock::new(HashMap::new())),
            known_funds: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Initialize the service (load fund list, etc.)
    pub async fn initialize(&self) -> Result<(), VnMarketError> {
        self.refresh_fund_cache().await?;
        Ok(())
    }

    /// Refresh fund ID cache
    pub async fn refresh_fund_cache(&self) -> Result<usize, VnMarketError> {
        let mut client = self.fmarket_client.write().await;
        let count = client.refresh_fund_cache().await?;

        // Update known funds list
        let funds = client.get_funds_listing().await?;
        let mut known = self.known_funds.write().await;
        known.clear();
        for fund in &funds {
            known.push(fund.short_name.to_uppercase());
            if let Some(code) = &fund.code {
                known.push(code.to_uppercase());
            }
        }

        // Update fund IDs map
        let mut ids = self.fund_ids.write().await;
        ids.clear();
        for fund in funds {
            ids.insert(fund.short_name.to_uppercase(), fund.id);
            if let Some(code) = fund.code {
                ids.insert(code.to_uppercase(), fund.id);
            }
        }

        Ok(count)
    }

    /// Detect asset type from symbol
    pub async fn detect_asset_type(&self, symbol: &str) -> VnAssetType {
        let symbol_upper = symbol.to_uppercase();

        // Check for gold symbols
        if is_gold_symbol(symbol) {
            return VnAssetType::Gold;
        }

        // Check for index symbols
        if map_index_symbol(&symbol_upper).is_some()
            || symbol_upper.contains("INDEX")
            || symbol_upper == "VN30"
            || symbol_upper == "HNX30"
        {
            return VnAssetType::Index;
        }

        // Check for known fund symbols
        let known = self.known_funds.read().await;
        if known.contains(&symbol_upper) {
            return VnAssetType::Fund;
        }

        // Default to stock
        VnAssetType::Stock
    }

    /// Get latest quote for a symbol
    pub async fn get_latest_quote(&self, symbol: &str) -> Result<CachedQuote, VnMarketError> {
        let asset_type = self.detect_asset_type(symbol).await;

        // Check cache first
        if let Some(cached) = self.quote_cache.get(symbol, asset_type).await {
            return Ok(cached);
        }

        // Fetch from appropriate client
        let quote = match asset_type {
            VnAssetType::Stock | VnAssetType::Index => self.fetch_stock_quote(symbol).await?,
            VnAssetType::Fund => self.fetch_fund_quote(symbol).await?,
            VnAssetType::Gold => self.fetch_gold_quote(symbol).await?,
        };

        // Store in cache
        self.quote_cache.set(quote.clone()).await;

        Ok(quote)
    }

    /// Get historical quotes for a symbol
    pub async fn get_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        let asset_type = self.detect_asset_type(symbol).await;

        match asset_type {
            VnAssetType::Stock | VnAssetType::Index => {
                self.fetch_stock_history(symbol, start, end).await
            }
            VnAssetType::Fund => self.fetch_fund_history(symbol, start, end).await,
            VnAssetType::Gold => self.fetch_gold_history(symbol, start, end).await,
        }
    }

    /// Fetch stock/index quote from VCI
    async fn fetch_stock_quote(&self, symbol: &str) -> Result<CachedQuote, VnMarketError> {
        let quote = self
            .vci_client
            .get_latest_quote(symbol)
            .await?
            .ok_or_else(|| VnMarketError::NoData {
                symbol: symbol.to_string(),
                date: "latest".to_string(),
            })?;

        Ok(CachedQuote {
            symbol: quote.symbol,
            asset_type: VnAssetType::Stock,
            date: quote.timestamp.date_naive(),
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            volume: Decimal::from(quote.volume),
            nav: None,
            buy_price: None,
            sell_price: None,
            currency: "VND".to_string(),
        })
    }

    /// Fetch fund quote from FMarket
    async fn fetch_fund_quote(&self, symbol: &str) -> Result<CachedQuote, VnMarketError> {
        let fund_id = {
            let ids = self.fund_ids.read().await;
            ids.get(&symbol.to_uppercase())
                .copied()
                .ok_or_else(|| VnMarketError::FundNotFound(symbol.to_string()))?
        };

        // Get latest NAV from all history
        let client = self.fmarket_client.write().await;
        let history = client.get_all_nav_history(fund_id).await?;

        let latest = history
            .last()
            .ok_or_else(|| VnMarketError::NoData {
                symbol: symbol.to_string(),
                date: "latest".to_string(),
            })?;

        let date = NaiveDate::parse_from_str(&latest.normalized_date(), "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Utc::now().date_naive());

        let nav = Decimal::from_f64_retain(latest.nav).unwrap_or_default();

        Ok(CachedQuote {
            symbol: symbol.to_string(),
            asset_type: VnAssetType::Fund,
            date,
            open: nav,
            high: nav,
            low: nav,
            close: nav,
            volume: Decimal::ZERO,
            nav: Some(nav),
            buy_price: None,
            sell_price: None,
            currency: "VND".to_string(),
        })
    }

    /// Fetch gold quote from SJC - tries cache first, falls back to API
    async fn fetch_gold_quote(&self, symbol: &str) -> Result<CachedQuote, VnMarketError> {
        // Try to get latest from historical cache first
        if let Some(ref cache) = self.historical_cache {
            if let Ok(Some(latest)) = cache.get_latest_record("VN.GOLD", VnAssetType::Gold) {
                let today = Utc::now().date_naive();
                let days_old = (today - latest.date).num_days();

                // If cached data is from today or yesterday (accounting for weekends), use it
                if days_old <= 3 {
                    debug!("Using cached gold quote from {}", latest.date);
                    return Ok(CachedQuote {
                        symbol: symbol.to_string(),
                        asset_type: VnAssetType::Gold,
                        date: latest.date,
                        open: latest.close,
                        high: latest.close,
                        low: latest.close,
                        close: latest.close,
                        volume: Decimal::ZERO,
                        nav: None,
                        buy_price: latest.buy_price,
                        sell_price: latest.sell_price,
                        currency: "VND".to_string(),
                    });
                }
            }
        }

        // Fetch from API
        let quote = self.sjc_client.get_latest_quote(symbol).await?;

        // Store in historical cache if available
        if let Some(ref cache) = self.historical_cache {
            let record = VnHistoricalRecord::new(
                "VN.GOLD",
                VnAssetType::Gold,
                quote.date,
                quote.close,
                quote.close,
                quote.close,
                quote.close,
                Decimal::ZERO,
            )
            .with_gold_prices(quote.buy_price, quote.sell_price);

            if let Err(e) = cache.store_records(&[record]) {
                warn!("Failed to cache gold quote: {}", e);
            }
        }

        Ok(CachedQuote {
            symbol: quote.symbol,
            asset_type: VnAssetType::Gold,
            date: quote.date,
            open: quote.close,
            high: quote.close,
            low: quote.close,
            close: quote.close,
            volume: Decimal::ZERO,
            nav: None,
            buy_price: Some(quote.buy_price),
            sell_price: Some(quote.sell_price),
            currency: "VND".to_string(),
        })
    }

    /// Fetch stock/index history from VCI
    async fn fetch_stock_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        let quotes = self.vci_client.get_history(symbol, start, end).await?;

        Ok(quotes
            .into_iter()
            .map(|q| {
                VnHistoricalRecord::new(
                    &q.symbol,
                    VnAssetType::Stock,
                    q.timestamp.date_naive(),
                    q.open,
                    q.high,
                    q.low,
                    q.close,
                    Decimal::from(q.volume),
                )
            })
            .collect())
    }

    /// Fetch fund history from FMarket
    async fn fetch_fund_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        let fund_id = {
            let ids = self.fund_ids.read().await;
            ids.get(&symbol.to_uppercase())
                .copied()
                .ok_or_else(|| VnMarketError::FundNotFound(symbol.to_string()))?
        };

        let client = self.fmarket_client.write().await;
        let start_str = start.format("%Y-%m-%d").to_string();
        let end_str = end.format("%Y-%m-%d").to_string();
        let nav_records = client.get_nav_history(fund_id, &start_str, &end_str).await?;

        Ok(nav_records
            .into_iter()
            .filter_map(|r| {
                let date = NaiveDate::parse_from_str(&r.normalized_date(), "%Y-%m-%d").ok()?;
                let nav = Decimal::from_f64_retain(r.nav).unwrap_or_default();

                Some(
                    VnHistoricalRecord::new(
                        symbol,
                        VnAssetType::Fund,
                        date,
                        nav,
                        nav,
                        nav,
                        nav,
                        Decimal::ZERO,
                    )
                    .with_nav(nav),
                )
            })
            .collect())
    }

    /// Fetch gold history - uses cache-first strategy to avoid API rate limiting
    ///
    /// The SJC API has strict rate limiting, so we:
    /// 1. First check the SQLite historical cache for existing data
    /// 2. Only fetch from API for dates not in cache
    /// 3. Store any new data back to cache
    async fn fetch_gold_history(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        // Normalize symbol to VN.GOLD for cache lookup
        let cache_symbol = if symbol.to_uppercase().contains("GOLD") {
            "VN.GOLD"
        } else {
            symbol
        };

        // Try to get from historical cache first
        if let Some(ref cache) = self.historical_cache {
            // Get cached records
            let cached_records = cache
                .get_records(cache_symbol, start, end, VnAssetType::Gold)
                .unwrap_or_default();

            if !cached_records.is_empty() {
                debug!(
                    "Found {} cached gold records for {} ({} to {})",
                    cached_records.len(),
                    cache_symbol,
                    start,
                    end
                );

                // Check if we have all the data we need
                let cached_dates = cache
                    .get_cached_dates(cache_symbol, start, end, VnAssetType::Gold)
                    .unwrap_or_default();

                let missing_ranges =
                    cache.calculate_missing_ranges(start, end, &cached_dates);

                if missing_ranges.is_empty() {
                    // All data is cached, return it
                    debug!("All gold data is cached, no API call needed");
                    return Ok(cached_records);
                }

                // Only fetch missing ranges from API
                debug!("Missing {} date ranges, fetching from API", missing_ranges.len());
                let mut all_records = cached_records;

                for (range_start, range_end) in missing_ranges {
                    // Only fetch recent data from API to avoid rate limiting
                    let today = Utc::now().date_naive();
                    let days_ago = (today - range_start).num_days();

                    // Only fetch from API if the missing range is within the last 30 days
                    if days_ago <= 30 {
                        match self.fetch_gold_from_api(symbol, range_start, range_end).await {
                            Ok(new_records) => {
                                // Store new records in cache
                                if let Err(e) = cache.store_records(&new_records) {
                                    warn!("Failed to store gold records in cache: {}", e);
                                }
                                all_records.extend(new_records);
                            }
                            Err(e) => {
                                warn!(
                                    "Failed to fetch gold data from API for {} to {}: {}",
                                    range_start, range_end, e
                                );
                                // Continue with cached data only
                            }
                        }
                    } else {
                        debug!(
                            "Skipping API fetch for old date range {} to {} (more than 30 days ago)",
                            range_start, range_end
                        );
                    }
                }

                // Sort by date
                all_records.sort_by(|a, b| a.date.cmp(&b.date));
                return Ok(all_records);
            }
        }

        // No cache available or empty cache - fetch from API
        // But limit to recent dates to avoid rate limiting
        let today = Utc::now().date_naive();
        let effective_start = if (today - start).num_days() > 30 {
            warn!(
                "Gold history request for {} starts more than 30 days ago, limiting to last 30 days",
                symbol
            );
            today - chrono::Duration::days(30)
        } else {
            start
        };

        self.fetch_gold_from_api(symbol, effective_start, end).await
    }

    /// Fetch gold data directly from SJC API
    async fn fetch_gold_from_api(
        &self,
        symbol: &str,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        let quotes = self.sjc_client.get_history(start, end).await?;

        Ok(quotes
            .into_iter()
            .map(|q| {
                VnHistoricalRecord::new(
                    symbol,
                    VnAssetType::Gold,
                    q.date,
                    q.close,
                    q.close,
                    q.close,
                    q.close,
                    Decimal::ZERO,
                )
                .with_gold_prices(q.buy_price, q.sell_price)
            })
            .collect())
    }

    /// Search for assets by query
    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, VnMarketError> {
        let mut results = Vec::new();

        // Search stocks from VCI
        let symbols = self.vci_client.get_all_symbols().await?;
        let query_lower = query.to_lowercase();

        for symbol in symbols.iter().filter(|s| s.is_stock() && s.is_listed()) {
            let name_lower = symbol.display_name().to_lowercase();
            if symbol.symbol.to_lowercase().contains(&query_lower)
                || name_lower.contains(&query_lower)
            {
                results.push(SearchResult {
                    symbol: symbol.symbol.clone(),
                    name: symbol.display_name().to_string(),
                    asset_type: VnAssetType::Stock,
                    exchange: symbol.exchange().to_string(),
                });

                if results.len() >= 20 {
                    break;
                }
            }
        }

        // Search funds
        let client = self.fmarket_client.read().await;
        if let Ok(funds) = client.get_funds_listing().await {
            for fund in funds {
                if fund.short_name.to_lowercase().contains(&query_lower)
                    || fund.name.to_lowercase().contains(&query_lower)
                {
                    results.push(SearchResult {
                        symbol: fund.short_name,
                        name: fund.name,
                        asset_type: VnAssetType::Fund,
                        exchange: "FUND".to_string(),
                    });
                }
            }
        }

        // Add gold if query matches
        if query_lower.contains("gold") || query_lower.contains("vàng") || query_lower == "sjc" {
            results.push(SearchResult {
                symbol: "VN.GOLD".to_string(),
                name: "Vàng VN (Lượng)".to_string(),
                asset_type: VnAssetType::Gold,
                exchange: "SJC".to_string(),
            });
            results.push(SearchResult {
                symbol: "VN.GOLD.C".to_string(),
                name: "Vàng VN (Chỉ)".to_string(),
                asset_type: VnAssetType::Gold,
                exchange: "SJC".to_string(),
            });
        }

        Ok(results)
    }
}

impl Default for VnMarketService {
    fn default() -> Self {
        Self::new()
    }
}

/// Search result item
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub symbol: String,
    pub name: String,
    pub asset_type: VnAssetType,
    pub exchange: String,
}
