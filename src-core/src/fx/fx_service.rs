use crate::fx::fx_repository::FxRepository;
use crate::models::ExchangeRate;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub struct CurrencyExchangeService {
    pool: Pool<ConnectionManager<SqliteConnection>>,
    exchange_rates: Arc<RwLock<HashMap<String, f64>>>,
}

impl CurrencyExchangeService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        Self {
            pool,
            exchange_rates: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn get_latest_exchange_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let key = format!("{}{}", from_currency, to_currency);

        // Check cache first
        {
            let cache = self.exchange_rates.read().map_err(|_| "RwLock poisoned")?;
            if let Some(&rate) = cache.get(&key) {
                return Ok(rate);
            }
        }

        let mut conn = self.pool.get()?;

        // Try to get the direct rate
        if let Some(rate) = FxRepository::get_exchange_rate(&mut conn, from_currency, to_currency)?
        {
            self.cache_rate(&key, rate.rate)?;
            return Ok(rate.rate);
        }

        // If not found, try the inverse rate
        if let Some(rate) = FxRepository::get_exchange_rate(&mut conn, to_currency, from_currency)?
        {
            let inverse_rate = 1.0 / rate.rate;
            self.cache_rate(&key, inverse_rate)?;
            return Ok(inverse_rate);
        }

        // If still not found, try USD conversion
        let from_usd = self.get_usd_rate(&mut conn, from_currency)?;
        let to_usd = self.get_usd_rate(&mut conn, to_currency)?;

        let rate = from_usd / to_usd;
        self.cache_rate(&key, rate)?;
        Ok(rate)
    }

    fn get_usd_rate(
        &self,
        conn: &mut SqliteConnection,
        currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if currency == "USD" {
            return Ok(1.0);
        }

        FxRepository::get_exchange_rate(conn, currency, "USD")?
            .map(|rate| rate.rate)
            .ok_or_else(|| format!("No USD rate found for {}", currency).into())
    }

    fn cache_rate(&self, key: &str, rate: f64) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.exchange_rates.write().map_err(|_| "RwLock poisoned")?;
        cache.insert(key.to_string(), rate);
        Ok(())
    }

    pub fn convert_currency(
        &self,
        amount: f64,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency == to_currency {
            return Ok(amount);
        }

        let rate = self.get_latest_exchange_rate(from_currency, to_currency)?;
        Ok(amount * rate)
    }

    pub fn sync_rates_from_yahoo(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let existing_rates = FxRepository::get_exchange_rates(&mut conn)?;

        for rate in existing_rates {
            let (from, to) = (&rate.from_currency, &rate.to_currency);
            let new_rate = self.fetch_yahoo_rate(from, to)?;

            let updated_rate = ExchangeRate {
                id: format!("{}{}=X", from, to),
                from_currency: from.to_string(),
                to_currency: to.to_string(),
                rate: new_rate,
                source: "Yahoo Finance".to_string(),
                created_at: rate.created_at,
                updated_at: chrono::Utc::now().naive_utc(),
            };

            let updated_rate = FxRepository::upsert_exchange_rate(&mut conn, updated_rate)?;
            self.cache_rate(&format!("{}{}=X", from, to), updated_rate.rate)?;
        }
        Ok(())
    }

    fn fetch_yahoo_rate(&self, from: &str, to: &str) -> Result<f64, Box<dyn std::error::Error>> {
        let direct_id = format!("{}{}=X", from, to);
        if let Ok(rate) = self.fetch_rate_from_yahoo(&direct_id) {
            return Ok(rate);
        }

        let inverse_id = format!("{}{}=X", to, from);
        if let Ok(rate) = self.fetch_rate_from_yahoo(&inverse_id) {
            return Ok(1.0 / rate);
        }

        // If both direct and inverse fail, try USD conversion
        let from_usd = self.fetch_rate_from_yahoo(&format!("USD{}=X", from))?;
        let to_usd = self.fetch_rate_from_yahoo(&format!("USD{}=X", to))?;

        Ok(from_usd / to_usd)
    }

    fn fetch_rate_from_yahoo(&self, symbol: &str) -> Result<f64, Box<dyn std::error::Error>> {
        // Implement Yahoo Finance API call here
        // Return the fetched rate
        unimplemented!(
            "Yahoo Finance API call not implemented for symbol: {}",
            symbol
        )
    }

    pub fn update_exchange_rate(
        &self,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let updated_rate = FxRepository::update_exchange_rate(&mut conn, rate)?;
        self.cache_rate(&updated_rate.id, updated_rate.rate)?;
        Ok(updated_rate)
    }

    pub fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let rates = FxRepository::get_exchange_rates(&mut conn)?;
        Ok(rates)
    }

    pub fn upsert_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        new_rate: ExchangeRate,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        let updated_rate = FxRepository::upsert_exchange_rate(conn, new_rate)?;
        self.cache_rate(&updated_rate.id, updated_rate.rate)?;
        Ok(updated_rate)
    }
}
