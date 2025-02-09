use crate::asset::asset_service::AssetService;
use crate::fx::fx_repository::FxRepository;
use crate::models::{ ExchangeRate, Quote};
use chrono::NaiveDate;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

type QuoteCache = HashMap<String, Vec<Quote>>;
type RateCache = HashMap<String, f64>;

pub struct CurrencyExchangeService {
    exchange_rates: Arc<RwLock<RateCache>>,
    historical_quotes: Arc<RwLock<QuoteCache>>,
}

impl CurrencyExchangeService {
    const DEFAULT_DATA_SOURCE: &'static str = "Yahoo";

    pub fn new() -> Self {
        Self {
            exchange_rates: Arc::new(RwLock::new(HashMap::new())),
            historical_quotes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn initialize(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Initialize latest rates cache
        let latest_rates = FxRepository::get_latest_currency_rates(conn)?;
        let mut cache = self.exchange_rates.write().map_err(|e| e.to_string())?;
        *cache = latest_rates;

        // Initialize historical quotes cache
        let historical_quotes = FxRepository::get_all_currency_quotes(conn)?;
        let mut historical_cache = self.historical_quotes.write().map_err(|e| e.to_string())?;
        *historical_cache = historical_quotes;

        Ok(())
    }

    pub fn get_latest_exchange_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let key = format!("{}{}=X", from_currency, to_currency);
        let cache = self.exchange_rates.read().map_err(|e| e.to_string())?;

        if let Some(&rate) = cache.get(&key) {
            return Ok(rate);
        }

        // If not found, try the inverse rate
        let inverse_key = format!("{}{}=X", to_currency, from_currency);
        if let Some(&rate) = cache.get(&inverse_key) {
            return Ok(1.0 / rate);
        }

        // If still not found, try USD conversion
        let from_usd = cache
            .get(&format!("{}USD=X", from_currency))
            .ok_or_else(|| format!("No USD rate found for {}", from_currency))?;
        let to_usd = cache
            .get(&format!("{}USD=X", to_currency))
            .ok_or_else(|| format!("No USD rate found for {}", to_currency))?;

        Ok(from_usd / to_usd)
    }

    fn find_closest_quote(quotes: &[Quote], target_date: NaiveDate) -> Option<&Quote> {
        quotes.iter().min_by_key(|quote| {
            let quote_date = quote.date.date();
            (quote_date.signed_duration_since(target_date))
                .num_days()
                .abs()
        })
    }

    pub fn get_exchange_rate_for_date(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let symbol = format!("{}{}=X", from_currency, to_currency);
        let inverse_symbol = format!("{}{}=X", to_currency, from_currency);
        let cache = self.historical_quotes.read().map_err(|e| e.to_string())?;

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

    pub fn convert_currency(
        &self,
        amount: f64,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency.eq(to_currency) {
            return Ok(amount);
        }

        let rate = self.get_latest_exchange_rate(from_currency, to_currency)?;
        Ok(amount * rate)
    }

    pub async fn add_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        from: String,
        to: String,
        source: String,
        rate: Option<f64>,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        let asset_service = AssetService::new().await;
        let direct_symbol = format!("{}{}=X", from, to);

        // Create currency pairs in assets table
        asset_service.create_fx_asset(conn, &from, &to, &source)?;

        let exchange_rate = ExchangeRate {
            id: direct_symbol.clone(),
            from_currency: from,
            to_currency: to,
            rate: rate.unwrap_or(1.0),
            source: source.clone(),
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        // If rate is provided, create a quote
        if let Some(rate_value) = rate {
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            FxRepository::add_quote(
                conn,
                direct_symbol.clone(),
                today,
                rate_value,
                source,
            )?;
        }

        let result = FxRepository::upsert_exchange_rate(conn, exchange_rate)?;

        // Update the cache
        if let Some(rate) = rate {
            self.cache_rate(&result.id, rate)?;
        }

        Ok(result)
    }

    pub async fn update_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        // Update asset symbol
        let asset_service = AssetService::new().await;
        asset_service.create_fx_asset(conn, &rate.from_currency, &rate.to_currency, &rate.source)?;

        // Add a new quote with the current rate
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        FxRepository::add_quote(
            conn,
            rate.id.clone(),
            today,
            rate.rate,
            rate.source.clone(),
        )?;

        // Update the exchange rate record
        let updated_rate = ExchangeRate {
            updated_at: chrono::Utc::now().naive_utc(),
            ..rate.clone()
        };

        let result = FxRepository::upsert_exchange_rate(conn, updated_rate)?;

        // Update the cache
        self.cache_rate(&result.id, result.rate)?;

        Ok(result)
    }

    pub fn get_exchange_rates(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ExchangeRate>, Box<dyn std::error::Error>> {
        Ok(FxRepository::get_exchange_rates(conn)?)
    }

    pub fn delete_exchange_rate(
        &self,
        conn: &mut PooledConnection<ConnectionManager<SqliteConnection>>,
        rate_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        FxRepository::delete_exchange_rate(conn, rate_id)?;

        // Remove from cache
        let mut cache = self.exchange_rates.write().map_err(|e| e.to_string())?;
        cache.remove(rate_id);

        Ok(())
    }

    fn cache_rate(&self, key: &str, rate: f64) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.exchange_rates.write().map_err(|e| e.to_string())?;
        cache.insert(key.to_string(), rate);
        Ok(())
    }

    pub async fn register_currency(
        &self,
        conn: &mut SqliteConnection,
        from: String,
        to: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Return early if trying to register the same currency
        if from == to {
            return Ok(());
        }

        let asset_service = AssetService::new().await;

        // Check if currency pair exists in assets
        if let Some((_asset, _)) = asset_service.get_fx_asset(conn, &from, &to)? {
            // Asset already exists, nothing to do
            return Ok(());
        }

        // If no existing asset found, create a new one with default data source
        let source = Self::DEFAULT_DATA_SOURCE.to_string();
        
        // Create the asset
        asset_service.create_fx_asset(conn, &from, &to, &source)?;

        Ok(())
    }
}
