use super::currency_converter::CurrencyConverter;
use super::fx_errors::FxError;
use super::fx_model::{ExchangeRate, NewExchangeRate};
use super::fx_traits::{FxRepositoryTrait, FxServiceTrait};
use crate::errors::Result;
use crate::market_data::market_data_model::DataSource;
use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct FxService {
    repository: Arc<dyn FxRepositoryTrait>,
    converter: Arc<RwLock<Option<CurrencyConverter>>>,
}

impl FxService {
    pub const DEFAULT_DATA_SOURCE: DataSource = DataSource::Manual;

    pub fn new(repository: Arc<dyn FxRepositoryTrait>) -> Self {
        Self {
            repository,
            converter: Arc::new(RwLock::new(None)),
        }
    }

    /// Initialize the currency converter with all exchange rates, filling missing days
    fn initialize_converter(&self) -> Result<()> {
        // Fetch ALL historical rates instead of just the latest
        let all_historical_rates = self.repository.get_historical_exchange_rates()?;

        // Only initialize the converter if we have exchange rates
        if all_historical_rates.is_empty() {
            log::warn!("No exchange rates available, converter not initialized");
            let mut converter_lock = self
                .converter
                .write()
                .map_err(|e| FxError::CacheError(e.to_string()))?;
            *converter_lock = None;
            return Ok(());
        }

        // Directly use the fetched rates without filling gaps
        match CurrencyConverter::new(all_historical_rates) {
            Ok(converter) => {
                let mut converter_lock = self
                    .converter
                    .write()
                    .map_err(|e| FxError::CacheError(e.to_string()))?;
                *converter_lock = Some(converter);
                Ok(())
            }
            Err(e) => {
                log::error!("Failed to initialize currency converter: {}", e);
                let mut converter_lock = self
                    .converter
                    .write()
                    .map_err(|e| FxError::CacheError(e.to_string()))?;
                *converter_lock = None;
                Err(e.into())
            }
        }
    }

    fn load_latest_exchange_rate(&self, from: &str, to: &str) -> Result<ExchangeRate> {
        // Fetch from repository
        match self.repository.get_latest_exchange_rate(from, to)? {
            Some(rate) => Ok(rate),
            None => {
                // Try inverse rate
                let inverse_symbol = ExchangeRate::make_fx_symbol(to, from);
                match self
                    .repository
                    .get_latest_exchange_rate_by_symbol(&inverse_symbol)?
                {
                    Some(inverse_rate) => {
                        let direct_rate = ExchangeRate {
                            id: ExchangeRate::make_fx_symbol(from, to),
                            from_currency: from.to_string(),
                            to_currency: to.to_string(),
                            rate: Decimal::ONE / inverse_rate.rate,
                            source: inverse_rate.source,
                            timestamp: inverse_rate.timestamp,
                        };

                        Ok(direct_rate)
                    }
                    None => Err(FxError::RateNotFound(format!(
                        "Exchange rate not found for {}/{}",
                        from, to
                    ))
                    .into()),
                }
            }
        }
    }
}

#[async_trait]
impl FxServiceTrait for FxService {
    fn initialize(&self) -> Result<()> {
        // Initialize currency converter with all exchange rates
        self.initialize_converter()?;
        Ok(())
    }

    async fn add_exchange_rate(&self, new_rate: NewExchangeRate) -> Result<ExchangeRate> {
        // First register the currency pair
        self.register_currency_pair_manual(&new_rate.from_currency, &new_rate.to_currency)
            .await?;

        let rate = ExchangeRate {
            id: ExchangeRate::make_fx_symbol(&new_rate.from_currency, &new_rate.to_currency),
            from_currency: new_rate.from_currency,
            to_currency: new_rate.to_currency,
            rate: new_rate.rate,
            source: new_rate.source,
            timestamp: Utc::now(),
        };

        self.repository.save_exchange_rate(rate).await
    }

    fn get_historical_rates(&self, from: &str, to: &str, days: i64) -> Result<Vec<ExchangeRate>> {
        let symbol = ExchangeRate::make_fx_symbol(from, to);
        let end = Utc::now();
        let start = end - chrono::Duration::days(days);

        // Fetch from repository
        match self
            .repository
            .get_historical_quotes(&symbol, start.naive_utc(), end.naive_utc())
        {
            Ok(quotes) => Ok(quotes
                .into_iter()
                .map(|q| ExchangeRate::from_quote(&q))
                .collect()),
            Err(e) => {
                Err(FxError::FetchError(format!("Failed to fetch historical rates: {}", e)).into())
            }
        }
    }

    async fn update_exchange_rate(
        &self,
        from: &str,
        to: &str,
        rate: Decimal,
    ) -> Result<ExchangeRate> {
        let new_rate = NewExchangeRate {
            from_currency: from.to_string(),
            to_currency: to.to_string(),
            rate,
            source: Self::DEFAULT_DATA_SOURCE,
        };
        self.add_exchange_rate(new_rate).await
    }

    fn get_latest_exchange_rate(&self, from_currency: &str, to_currency: &str) -> Result<Decimal> {
        if from_currency == to_currency {
            return Ok(Decimal::ONE);
        }

        // Try to get the converter
        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                // Use the converter to get the latest rate
                let today = Utc::now().naive_utc().date();
                match converter.get_rate_nearest(from_currency, to_currency, today) {
                    Ok(rate) => return Ok(rate),
                    Err(_) => {
                        // Fall through to direct repository access (no log here to avoid duplication)
                    }
                }
            }
        }

        // Fallback to direct repository access
        match self.load_latest_exchange_rate(from_currency, to_currency) {
            Ok(rate) => Ok(rate.rate),
            Err(e) => {
                log::error!(
                    "Exchange rate not available for {}/{}",
                    from_currency,
                    to_currency
                );
                Err(e)
            }
        }
    }

    fn get_exchange_rate_for_date(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal> {
        // Check for valid currency codes
        if from_currency.len() != 3 || !from_currency.chars().all(|c| c.is_alphabetic()) {
            return Err(FxError::InvalidCurrencyCode(format!(
                "Invalid currency code: {}",
                from_currency
            ))
            .into());
        }

        if to_currency.len() != 3 || !to_currency.chars().all(|c| c.is_alphabetic()) {
            return Err(FxError::InvalidCurrencyCode(format!(
                "Invalid currency code: {}",
                to_currency
            ))
            .into());
        }

        if from_currency == to_currency {
            return Ok(Decimal::ONE);
        }

        // Try to get the converter
        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                // Use the converter to get the rate for the specific date
                match converter.get_rate_nearest(from_currency, to_currency, date) {
                    Ok(rate) => return Ok(rate),
                    Err(_) => {
                        // Fall through to fallback
                    }
                }
            }
        }

        // Fallback to latest rate if converter not available or failed
        let latest_rate = self.load_latest_exchange_rate(from_currency, to_currency)?;
        let fallback_date = latest_rate.timestamp.date_naive();

        log::warn!(
            "No exchange rate found for {}/{} on {}. Using fallback rate from {}",
            from_currency,
            to_currency,
            date,
            fallback_date
        );

        Ok(latest_rate.rate)
    }

    fn convert_currency(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<Decimal> {
        if from_currency.eq(to_currency) {
            return Ok(amount);
        }

        // Try to get the converter
        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                // Use the converter to convert the amount
                let today = Utc::now().naive_utc().date();
                match converter.convert_amount(amount, from_currency, to_currency, today) {
                    Ok(converted) => return Ok(converted),
                    Err(_) => {
                        // Fall through to fallback
                    }
                }
            }
        }

        // Fallback to direct rate lookup
        let rate = self.get_latest_exchange_rate(from_currency, to_currency)?;
        Ok(amount * rate)
    }

    fn convert_currency_for_date(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal> {
        if from_currency.eq(to_currency) {
            return Ok(amount);
        }

        // Try to get the converter
        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                // Use the converter to convert the amount for the specific date
                match converter.convert_amount_nearest(amount, from_currency, to_currency, date) {
                    Ok(converted) => return Ok(converted),
                    Err(_) => {
                        // Fall through to fallback
                    }
                }
            }
        }

        // Fallback to direct rate lookup - logging happens in get_exchange_rate_for_date
        let rate = self.get_exchange_rate_for_date(from_currency, to_currency, date)?;
        Ok(amount * rate)
    }

    fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
        self.repository.get_latest_exchange_rates()
    }

    async fn delete_exchange_rate(&self, rate_id: &str) -> Result<()> {
        self.repository.delete_exchange_rate(rate_id).await?;

        // Reinitialize the converter with updated rates
        self.initialize_converter()?;

        Ok(())
    }

    /// Register a new currency pair and create necessary FX assets
    async fn register_currency_pair(&self, from: &str, to: &str) -> Result<()> {
        // Return early if trying to register the same currency
        if from == to {
            return Ok(());
        }

        // Try to get existing rate first
        let existing_rate = self.load_latest_exchange_rate(from, to).ok();

        // Create FX asset and add default rate if no rate exists
        if existing_rate.is_none() {
            self.repository
                .create_fx_asset(from, to, DataSource::Yahoo.as_str())
                .await?;
        }

        Ok(())
    }

    async fn register_currency_pair_manual(&self, from: &str, to: &str) -> Result<()> {
        // Return early if trying to register the same currency
        if from == to {
            return Ok(());
        }
        // Try to get existing rate first
        let existing_rate = self.load_latest_exchange_rate(from, to).ok();

        // Create FX asset and add default rate if no rate exists
        if existing_rate.is_none() {
            self.repository
                .create_fx_asset(from, to, DataSource::Manual.as_str())
                .await?;
        }

        Ok(())
    }
}
