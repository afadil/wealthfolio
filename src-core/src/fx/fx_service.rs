use crate::models::Quote;
use crate::schema::quotes;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub struct CurrencyExchangeService {
    exchange_rates: Arc<Mutex<HashMap<String, f64>>>,
    pool: Pool<ConnectionManager<SqliteConnection>>,
    is_loading: Arc<AtomicBool>,
}

impl CurrencyExchangeService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        Self {
            exchange_rates: Arc::new(Mutex::new(HashMap::new())),
            pool,
            is_loading: Arc::new(AtomicBool::new(false)),
        }
    }

    fn load_exchange_rates(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        let direct_symbol = format!("{}{}=X", from_currency, to_currency);
        let inverse_symbol = format!("{}{}=X", to_currency, from_currency);

        let latest_quote: Option<Quote> = quotes::table
            .filter(
                quotes::symbol
                    .eq(&direct_symbol)
                    .or(quotes::symbol.eq(&inverse_symbol)),
            )
            .order(quotes::date.desc())
            .first(&mut *conn)
            .optional()?;

        if let Some(quote) = latest_quote {
            let rate = if quote.symbol == direct_symbol {
                quote.close
            } else {
                1.0 / quote.close
            };

            let mut exchange_rates = self
                .exchange_rates
                .lock()
                .map_err(|_| "Failed to acquire lock")?;
            exchange_rates.insert(direct_symbol.clone(), rate);
            exchange_rates.insert(inverse_symbol, 1.0 / rate);

            Ok(rate)
        } else {
            Err(format!(
                "No exchange rate found for {} to {}",
                from_currency, to_currency
            )
            .into())
        }
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

        let rate = self.load_exchange_rates(from_currency, to_currency)?;
        Ok(amount * rate)
    }

    pub fn get_exchange_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        if from_currency == to_currency {
            return Ok(1.0);
        }

        let direct_key = format!("{}{}=X", from_currency, to_currency);
        let inverse_key = format!("{}{}=X", to_currency, from_currency);

        {
            let exchange_rates = self
                .exchange_rates
                .lock()
                .map_err(|_| "Failed to acquire lock")?;
            if let Some(&rate) = exchange_rates.get(&direct_key) {
                return Ok(rate);
            } else if let Some(&rate) = exchange_rates.get(&inverse_key) {
                return Ok(1.0 / rate);
            }
        }

        // Use atomic flag to prevent multiple threads from loading the same rate simultaneously
        if self
            .is_loading
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
        {
            let result = self.load_exchange_rates(from_currency, to_currency);
            self.is_loading.store(false, Ordering::Release);
            result
        } else {
            // Another thread is loading, wait and retry
            std::thread::yield_now();
            self.get_exchange_rate(from_currency, to_currency)
        }
    }
}
