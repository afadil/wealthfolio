//! In-memory quote cache with TTL using moka

use moka::future::Cache;
use std::sync::Arc;
use std::time::Duration;

use crate::vn_market::cache::models::{CachedQuote, VnAssetType};

/// In-memory quote cache with asset-specific TTL
pub struct VnQuoteCache {
    /// Stock quotes cache (1 hour TTL)
    stock_cache: Cache<String, CachedQuote>,
    /// Fund quotes cache (24 hour TTL)
    fund_cache: Cache<String, CachedQuote>,
    /// Gold quotes cache (30 min TTL)
    gold_cache: Cache<String, CachedQuote>,
    /// Index quotes cache (1 hour TTL)
    index_cache: Cache<String, CachedQuote>,
}

impl VnQuoteCache {
    /// Create a new quote cache with default settings
    pub fn new() -> Self {
        Self {
            stock_cache: Cache::builder()
                .time_to_live(Duration::from_secs(3600)) // 1 hour
                .max_capacity(1000)
                .build(),
            fund_cache: Cache::builder()
                .time_to_live(Duration::from_secs(86400)) // 24 hours
                .max_capacity(200)
                .build(),
            gold_cache: Cache::builder()
                .time_to_live(Duration::from_secs(1800)) // 30 minutes
                .max_capacity(10)
                .build(),
            index_cache: Cache::builder()
                .time_to_live(Duration::from_secs(3600)) // 1 hour
                .max_capacity(20)
                .build(),
        }
    }

    /// Get quote from cache
    pub async fn get(&self, symbol: &str, asset_type: VnAssetType) -> Option<CachedQuote> {
        let cache = self.get_cache_for_type(asset_type);
        cache.get(symbol).await
    }

    /// Store quote in cache
    pub async fn set(&self, quote: CachedQuote) {
        let cache = self.get_cache_for_type(quote.asset_type);
        cache.insert(quote.symbol.clone(), quote).await;
    }

    /// Remove quote from cache
    pub async fn invalidate(&self, symbol: &str, asset_type: VnAssetType) {
        let cache = self.get_cache_for_type(asset_type);
        cache.invalidate(symbol).await;
    }

    /// Clear all caches
    pub async fn clear_all(&self) {
        self.stock_cache.invalidate_all();
        self.fund_cache.invalidate_all();
        self.gold_cache.invalidate_all();
        self.index_cache.invalidate_all();
    }

    /// Get cache statistics
    pub fn stats(&self) -> QuoteCacheStats {
        QuoteCacheStats {
            stock_count: self.stock_cache.entry_count() as usize,
            fund_count: self.fund_cache.entry_count() as usize,
            gold_count: self.gold_cache.entry_count() as usize,
            index_count: self.index_cache.entry_count() as usize,
        }
    }

    /// Get the appropriate cache for an asset type
    fn get_cache_for_type(&self, asset_type: VnAssetType) -> &Cache<String, CachedQuote> {
        match asset_type {
            VnAssetType::Stock => &self.stock_cache,
            VnAssetType::Fund => &self.fund_cache,
            VnAssetType::Gold => &self.gold_cache,
            VnAssetType::Index => &self.index_cache,
        }
    }
}

impl Default for VnQuoteCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Quote cache statistics
#[derive(Debug, Clone)]
pub struct QuoteCacheStats {
    pub stock_count: usize,
    pub fund_count: usize,
    pub gold_count: usize,
    pub index_count: usize,
}

impl QuoteCacheStats {
    pub fn total(&self) -> usize {
        self.stock_count + self.fund_count + self.gold_count + self.index_count
    }
}

/// Thread-safe wrapper for VnQuoteCache
pub type SharedQuoteCache = Arc<VnQuoteCache>;

/// Create a new shared quote cache
pub fn create_shared_cache() -> SharedQuoteCache {
    Arc::new(VnQuoteCache::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal::Decimal;

    fn create_test_quote(symbol: &str, asset_type: VnAssetType) -> CachedQuote {
        CachedQuote {
            symbol: symbol.to_string(),
            asset_type,
            date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            open: Decimal::new(100000, 0),
            high: Decimal::new(101000, 0),
            low: Decimal::new(99000, 0),
            close: Decimal::new(100500, 0),
            volume: Decimal::new(1000000, 0),
            nav: None,
            buy_price: None,
            sell_price: None,
            currency: "VND".to_string(),
        }
    }

    #[tokio::test]
    async fn test_cache_set_get() {
        let cache = VnQuoteCache::new();

        let quote = create_test_quote("VNM", VnAssetType::Stock);
        cache.set(quote.clone()).await;

        let retrieved = cache.get("VNM", VnAssetType::Stock).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().symbol, "VNM");
    }

    #[tokio::test]
    async fn test_cache_miss() {
        let cache = VnQuoteCache::new();

        let retrieved = cache.get("NONEXISTENT", VnAssetType::Stock).await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_cache_invalidate() {
        let cache = VnQuoteCache::new();

        let quote = create_test_quote("VNM", VnAssetType::Stock);
        cache.set(quote).await;

        cache.invalidate("VNM", VnAssetType::Stock).await;

        let retrieved = cache.get("VNM", VnAssetType::Stock).await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_separate_caches_by_asset_type() {
        let cache = VnQuoteCache::new();

        let stock_quote = create_test_quote("VNM", VnAssetType::Stock);
        let fund_quote = create_test_quote("VESAF", VnAssetType::Fund);

        cache.set(stock_quote).await;
        cache.set(fund_quote).await;

        // Stock quote should not be in fund cache
        let wrong_type = cache.get("VNM", VnAssetType::Fund).await;
        assert!(wrong_type.is_none());

        // But should be in stock cache
        let correct_type = cache.get("VNM", VnAssetType::Stock).await;
        assert!(correct_type.is_some());
    }
}
