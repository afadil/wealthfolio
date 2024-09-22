use crate::fx::fx_repository::FxRepository;
use crate::models::{ExchangeRate, Quote};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub struct CurrencyExchangeService {
    pool: Pool<ConnectionManager<SqliteConnection>>,
    exchange_rates: Arc<RwLock<HashMap<String, (f64, NaiveDateTime)>>>,
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

        let symbol = format!("{}{}=X", from_currency, to_currency);
        let inverse_symbol = format!("{}{}=X", to_currency, from_currency);

        // Check cache first
        {
            let cache = self.exchange_rates.read().map_err(|_| "RwLock poisoned")?;
            if let Some(&(rate, _)) = cache.get(&symbol) {
                return Ok(rate);
            }
            if let Some(&(rate, _)) = cache.get(&inverse_symbol) {
                return Ok(1.0 / rate);
            }
        }

        let mut conn = self
            .pool
            .get()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

        // Try to get the direct rate
        if let Some((rate, date)) = self.get_latest_rate_from_db(&mut conn, &symbol)? {
            self.cache_rate(&symbol, rate, date)?;
            return Ok(rate);
        }

        // If not found, try the inverse rate
        if let Some((rate, date)) = self.get_latest_rate_from_db(&mut conn, &inverse_symbol)? {
            let inverse_rate = 1.0 / rate;
            self.cache_rate(&symbol, inverse_rate, date)?;
            return Ok(inverse_rate);
        }

        // If still not found, try USD conversion
        let (from_usd, from_date) = self.get_latest_usd_rate(&mut conn, from_currency)?;
        let (to_usd, to_date) = self.get_latest_usd_rate(&mut conn, to_currency)?;

        let rate = from_usd / to_usd;
        let date = from_date.max(to_date);
        self.cache_rate(&symbol, rate, date)?;
        Ok(rate)
    }

    pub fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let mut exchange_rates = FxRepository::get_exchange_rates(&mut conn)?;

        for rate in &mut exchange_rates {
            let fx_symbol = format!("{}{}=X", rate.from_currency, rate.to_currency);
            if let Some(quote) = self.get_latest_quote(&fx_symbol)? {
                rate.rate = quote.close;
                rate.source = quote.data_source;
            }
        }

        Ok(exchange_rates)
    }

    pub fn update_exchange_rate(
        &self,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        Ok(FxRepository::update_exchange_rate(&mut conn, rate)?)
    }

    fn get_latest_quote(
        &self,
        fx_symbol: &str,
    ) -> Result<Option<Quote>, Box<dyn std::error::Error>> {
        use crate::schema::quotes::dsl::*;
        let mut conn = self.pool.get()?;

        Ok(quotes
            .filter(symbol.eq(fx_symbol))
            .order(date.desc())
            .first(&mut conn)
            .optional()?)
    }

    fn get_latest_rate_from_db(
        &self,
        conn: &mut SqliteConnection,
        fx_symbol: &str,
    ) -> Result<Option<(f64, NaiveDateTime)>, diesel::result::Error> {
        use crate::schema::quotes::dsl::*;

        quotes
            .filter(symbol.eq(fx_symbol))
            .order(date.desc())
            .select((close, date))
            .first(conn)
            .optional()
    }

    fn get_latest_usd_rate(
        &self,
        conn: &mut SqliteConnection,
        currency: &str,
    ) -> Result<(f64, NaiveDateTime), Box<dyn std::error::Error>> {
        if currency == "USD" {
            return Ok((1.0, chrono::Utc::now().naive_utc()));
        }

        let symbol = format!("{}USD=X", currency);
        self.get_latest_rate_from_db(conn, &symbol)?
            .ok_or_else(|| format!("No USD rate found for {}", currency).into())
    }

    fn cache_rate(
        &self,
        symbol: &str,
        rate: f64,
        date: NaiveDateTime,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.exchange_rates.write().map_err(|_| "RwLock poisoned")?;
        cache.insert(symbol.to_string(), (rate, date));
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
}
