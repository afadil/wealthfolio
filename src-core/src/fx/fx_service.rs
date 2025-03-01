use chrono::{Utc, Duration, NaiveDateTime, NaiveDate};
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use super::fx_errors::FxError;
use super::fx_model::{ExchangeRate, NewExchangeRate};
use crate::market_data::market_data_model::{Quote, DataSource};
use super::fx_repository::FxRepository;

/// Cache entry with timestamp to track staleness
#[derive(Clone)]
struct CacheEntry {
    rate: f64,
    timestamp: NaiveDateTime,
}

type RateCache = HashMap<String, CacheEntry>;
type HistoricalCache = HashMap<String, Vec<Quote>>;

pub struct FxService {
    repository: FxRepository,
    rate_cache: Arc<RwLock<RateCache>>,
    historical_cache: Arc<RwLock<HistoricalCache>>,
    cache_ttl: Duration, // Time-to-live for cache entries
}

impl FxService {
    const DEFAULT_DATA_SOURCE: DataSource = DataSource::Manual;
    const CACHE_TTL_HOURS: i64 = 24; // Cache TTL of 24 hours

    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self {
            repository: FxRepository::new(pool.clone()),
            rate_cache: Arc::new(RwLock::new(HashMap::new())),
            historical_cache: Arc::new(RwLock::new(HashMap::new())),
            cache_ttl: Duration::hours(Self::CACHE_TTL_HOURS),
        }
    }

    pub fn initialize(&self) -> Result<(), FxError> {
        // Initialize latest rates cache
        let latest_rates = self.repository.get_latest_currency_rates()?;
        let mut cache = self.rate_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        *cache = latest_rates.into_iter().map(|(k, v)| (
            k,
            CacheEntry {
                rate: v,
                timestamp: Utc::now().naive_utc(),
            }
        )).collect();

        // Initialize historical quotes cache
        let historical_quotes = self.repository.get_all_currency_quotes()?;
        let mut historical_cache = self.historical_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        *historical_cache = historical_quotes;

        Ok(())
    }

    /// Update the rate cache with a new quote
    fn update_rate_cache(&self, quote: &Quote) -> Result<(), FxError> {
        let mut cache = self.rate_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        
        cache.insert(
            quote.symbol.clone(),
            CacheEntry {
                rate: quote.close,
                timestamp: quote.date,
            },
        );
        
        Ok(())
    }

    /// Update the historical cache with a new quote
    fn update_historical_cache(&self, quote: &Quote) -> Result<(), FxError> {
        let mut cache = self.historical_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        
        let entries = cache.entry(quote.symbol.clone()).or_insert_with(Vec::new);
        entries.push(quote.clone());
        entries.sort_by_key(|q| q.date);
        
        Ok(())
    }

    /// Check if a cache entry is stale
    fn is_cache_stale(&self, entry: &CacheEntry) -> bool {
        let now = Utc::now().naive_utc();
        now.signed_duration_since(entry.timestamp) > self.cache_ttl
    }

    pub fn get_exchange_rate(&self, from: &str, to: &str) -> Result<ExchangeRate, FxError> {
        let symbol = ExchangeRate::make_fx_symbol(from, to);
        
        // Check cache first
        if let Ok(cache) = self.rate_cache.read() {
            if let Some(entry) = cache.get(&symbol) {
                if !self.is_cache_stale(entry) {
                    return Ok(ExchangeRate {
                        id: ExchangeRate::make_fx_symbol(from, to),
                        from_currency: from.to_string(),
                        to_currency: to.to_string(),
                        rate: entry.rate,
                        source: Self::DEFAULT_DATA_SOURCE,
                        timestamp: entry.timestamp,
                    });
                }
            }
        }

        // Cache miss or stale, fetch from repository
        match self.repository.get_exchange_rate(from, to)? {
            Some(rate) => {
                // Update cache
                let quote = rate.to_quote();
                self.update_rate_cache(&quote)?;
                Ok(rate)
            },
            None => {
                // Try inverse rate
                let inverse_symbol = ExchangeRate::make_fx_symbol(to, from);
                match self.repository.get_exchange_rate_by_id(&inverse_symbol)? {
                    Some(inverse_rate) => {
                        let direct_rate = ExchangeRate {
                            id: ExchangeRate::make_fx_symbol(from, to),
                            from_currency: from.to_string(),
                            to_currency: to.to_string(),
                            rate: 1.0 / inverse_rate.rate,
                            source: inverse_rate.source,
                            timestamp: inverse_rate.timestamp,
                        };
                        
                        // Update cache with inverted rate
                        let quote = direct_rate.to_quote();
                        self.update_rate_cache(&quote)?;
                        
                        Ok(direct_rate)
                    },
                    None => Err(FxError::RateNotFound(format!(
                        "Exchange rate not found for {}/{}", from, to
                    ))),
                }
            }
        }
    }

    pub fn add_exchange_rate(&self, new_rate: NewExchangeRate) -> Result<ExchangeRate, FxError> {
        let rate = ExchangeRate {
            id: ExchangeRate::make_fx_symbol(&new_rate.from_currency, &new_rate.to_currency),
            from_currency: new_rate.from_currency,
            to_currency: new_rate.to_currency,
            rate: new_rate.rate,
            source: new_rate.source,
            timestamp: Utc::now().naive_utc(),
        };

        match self.repository.upsert_exchange_rate(rate) {
            Ok(saved_rate) => {
                // Update both caches
                let quote = saved_rate.to_quote();
                self.update_rate_cache(&quote)?;
                self.update_historical_cache(&quote)?;
                Ok(saved_rate)
            },
            Err(e) => Err(FxError::SaveError(format!(
                "Failed to save exchange rate: {}", e
            ))),
        }
    }

    pub fn get_historical_rates(
        &self,
        from: &str,
        to: &str,
        days: i64,
    ) -> Result<Vec<ExchangeRate>, FxError> {
        let symbol = ExchangeRate::make_fx_symbol(from, to);
        let end = Utc::now();
        let start = end - Duration::days(days);

        // Check cache first
        if let Ok(cache) = self.historical_cache.read() {
            if let Some(quotes) = cache.get(&symbol) {
                let filtered: Vec<_> = quotes
                    .iter()
                    .filter(|q| {
                        q.date >= start.naive_utc() && q.date <= end.naive_utc()
                    })
                    .collect();
                
                if !filtered.is_empty() {
                    return Ok(filtered
                        .into_iter()
                        .map(|q| ExchangeRate::from_quote(q))
                        .collect());
                }
            }
        }

        // Cache miss, fetch from repository
        match self.repository.get_historical_quotes(&symbol, start.naive_utc(), end.naive_utc()) {
            Ok(quotes) => {
                // Update cache with all quotes
                for quote in &quotes {
                    self.update_historical_cache(quote)?;
                }
                Ok(quotes.into_iter().map(|q| ExchangeRate::from_quote(&q)).collect())
            },
            Err(e) => Err(FxError::FetchError(format!(
                "Failed to fetch historical rates: {}", e
            ))),
        }
    }

    pub fn update_exchange_rate(
        &self,
        from: &str,
        to: &str,
        rate: f64,
    ) -> Result<ExchangeRate, FxError> {
        let new_rate = NewExchangeRate {
            from_currency: from.to_string(),
            to_currency: to.to_string(),
            rate,
            source: Self::DEFAULT_DATA_SOURCE,
        };
        self.add_exchange_rate(new_rate)
    }

    pub fn get_latest_exchange_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, FxError> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let key = format!("{}{}=X", from_currency, to_currency);
        let cache = self.rate_cache.read().map_err(|e| FxError::CacheError(e.to_string()))?;

        if let Some(entry) = cache.get(&key) {
            return Ok(entry.rate);
        }

        // If not found, try the inverse rate
        let inverse_key = format!("{}{}=X", to_currency, from_currency);
        if let Some(entry) = cache.get(&inverse_key) {
            return Ok(1.0 / entry.rate);
        }

        // If still not found, try USD conversion
        let from_usd = cache
            .get(&format!("{}USD=X", from_currency))
            .ok_or_else(|| FxError::RateNotFound(format!("No USD rate found for {}", from_currency)))?;
        let to_usd = cache
            .get(&format!("{}USD=X", to_currency))
            .ok_or_else(|| FxError::RateNotFound(format!("No USD rate found for {}", to_currency)))?;

        Ok(from_usd.rate / to_usd.rate)
    }

    pub fn get_exchange_rate_for_date(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<f64, FxError> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let symbol = format!("{}{}=X", from_currency, to_currency);
        let inverse_symbol = format!("{}{}=X", to_currency, from_currency);
        let cache = self.historical_cache.read().map_err(|e| FxError::CacheError(e.to_string()))?;

        // Try direct rate
        if let Some(quotes) = cache.get(&symbol) {
            if let Some(quote) = Self::find_closest_quote(quotes, date) {
                let days_diff = (quote.date.date().signed_duration_since(date))
                    .num_days()
                    .abs();
                if days_diff <= 30 {
                    return Ok(quote.close);
                }
            }
        }

        // Try inverse rate
        if let Some(quotes) = cache.get(&inverse_symbol) {
            if let Some(quote) = Self::find_closest_quote(quotes, date) {
                let days_diff = (quote.date.date().signed_duration_since(date))
                    .num_days()
                    .abs();
                if days_diff <= 30 {
                    return Ok(1.0 / quote.close);
                }
            }
        }

        // Fallback to latest rate if historical rate not found
        self.get_latest_exchange_rate(from_currency, to_currency)
    }

    fn find_closest_quote(quotes: &[Quote], target_date: NaiveDate) -> Option<&Quote> {
        quotes.iter().min_by_key(|quote| {
            let quote_date = quote.date.date();
            (quote_date.signed_duration_since(target_date))
                .num_days()
                .abs()
        })
    }

    pub fn convert_currency(
        &self,
        amount: f64,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, FxError> {
        if from_currency.eq(to_currency) {
            return Ok(amount);
        }

        let rate = self.get_latest_exchange_rate(from_currency, to_currency)?;
        Ok(amount * rate)
    }

    pub fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>, FxError> {
        self.repository.get_exchange_rates()
    }

    pub fn delete_exchange_rate(
        &self,
        rate_id: &str,
    ) -> Result<(), FxError> {
        self.repository.delete_exchange_rate(rate_id)?;

        // Remove from cache
        let mut cache = self.rate_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        cache.remove(rate_id);

        Ok(())
    }

    /// Register a new currency pair and create necessary FX assets
    pub fn register_currency_pair(&self, from: &str, to: &str) -> Result<(), FxError> {
        // Return early if trying to register the same currency
        if from == to {
            return Ok(());
        }

        // Try to get existing rate first
        let existing_rate = self.get_exchange_rate(from, to).ok();

        // Create FX asset and add default rate if no rate exists
        if existing_rate.is_none() {
            self.repository.create_fx_asset(from, to, DataSource::Yahoo.as_str())?;

            let exchange_rate = NewExchangeRate {
                from_currency: from.to_string(),
                to_currency: to.to_string(),
                rate: 1.0,
                source: DataSource::Yahoo,
            };

            self.add_exchange_rate(exchange_rate)?;
        }
        
        Ok(())
    }

    pub fn clear_cache(&self) -> Result<(), FxError> {
        let mut rate_cache = self.rate_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        let mut historical_cache = self.historical_cache.write().map_err(|e| FxError::CacheError(e.to_string()))?;
        
        rate_cache.clear();
        historical_cache.clear();
        Ok(())
    }
}
