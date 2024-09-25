use crate::fx::fx_repository::FxRepository;
use crate::models::ExchangeRate;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub struct CurrencyExchangeService {
    exchange_rates: Arc<RwLock<HashMap<String, f64>>>,
}

impl CurrencyExchangeService {
    pub fn new() -> Self {
        Self {
            exchange_rates: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn initialize(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let exchange_rates = FxRepository::get_exchange_rates(conn)?
            .into_iter()
            .map(|rate| {
                (
                    format!("{}{}", rate.from_currency, rate.to_currency),
                    rate.rate,
                )
            })
            .collect::<HashMap<_, _>>();

        let mut cache = self.exchange_rates.write().map_err(|_| "RwLock poisoned")?;
        *cache = exchange_rates;
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

        let key = format!("{}{}", from_currency, to_currency);

        // Check cache
        let cache = self.exchange_rates.read().map_err(|_| "RwLock poisoned")?;
        if let Some(&rate) = cache.get(&key) {
            return Ok(rate);
        }

        // If not found, try the inverse rate
        let inverse_key = format!("{}{}", to_currency, from_currency);
        if let Some(&rate) = cache.get(&inverse_key) {
            return Ok(1.0 / rate);
        }

        // If still not found, try USD conversion
        let from_usd = cache
            .get(&format!("{}USD", from_currency))
            .ok_or_else(|| format!("No USD rate found for {}", from_currency))?;
        let to_usd = cache
            .get(&format!("{}USD", to_currency))
            .ok_or_else(|| format!("No USD rate found for {}", to_currency))?;

        let rate = from_usd / to_usd;
        Ok(rate)
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

    pub fn update_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        let updated_rate = FxRepository::update_exchange_rate(conn, rate)?;
        self.cache_rate(&updated_rate.id, updated_rate.rate)?;
        Ok(updated_rate)
    }

    pub fn get_exchange_rates(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ExchangeRate>, Box<dyn std::error::Error>> {
        let rates = FxRepository::get_exchange_rates(conn)?;
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

    pub fn add_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        from: String,
        to: String,
        rate: Option<f64>,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        // Check for direct conversion
        let direct_id = format!("{}{}=X", from, to);
        if let Some(existing_rate) = FxRepository::get_exchange_rate_by_id(conn, &direct_id)? {
            return Ok(existing_rate);
        }

        // Check for inverse conversion
        let inverse_id = format!("{}{}=X", to, from);
        if let Some(existing_rate) = FxRepository::get_exchange_rate_by_id(conn, &inverse_id)? {
            return Ok(existing_rate);
        }

        // If neither direct nor inverse rate exists, create a new rate
        let exchange_rate = ExchangeRate {
            id: direct_id,
            from_currency: from,
            to_currency: to,
            rate: rate.unwrap_or(1.0),
            source: "MANUAL".to_string(),
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        let result = self.upsert_exchange_rate(conn, exchange_rate)?;
        // self.cache_rate(&result.id, result.rate)?;
        Ok(result)
    }

    pub fn delete_exchange_rate(
        &self,
        conn: &mut PooledConnection<ConnectionManager<SqliteConnection>>,
        rate_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Delete the exchange rate from the database
        FxRepository::delete_exchange_rate(conn, rate_id)?;

        // Remove the rate from the cache
        let mut cache = self.exchange_rates.write().map_err(|_| "RwLock poisoned")?;
        cache.remove(rate_id);

        // If it's a manual rate, also remove the inverse rate from the cache
        if rate_id.ends_with("=X") {
            let parts: Vec<&str> = rate_id.split('=').collect();
            if parts.len() == 2 {
                let currencies = parts[0];
                if currencies.len() == 6 {
                    let inverse_id = format!("{}{}=X", &currencies[3..], &currencies[..3]);
                    cache.remove(&inverse_id);
                }
            }
        }

        Ok(())
    }
}
