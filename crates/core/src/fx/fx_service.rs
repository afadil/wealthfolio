use super::currency_converter::CurrencyConverter;
use super::fx_errors::FxError;
use super::fx_model::{ExchangeRate, NewExchangeRate};
use super::fx_traits::{FxRepositoryTrait, FxServiceTrait};
use crate::errors::Result;
use crate::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use crate::fx::currency::{denormalization_multiplier, normalize_currency_code};
use crate::quotes::DataSource;
use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use std::collections::HashSet;
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct FxService {
    repository: Arc<dyn FxRepositoryTrait>,
    converter: Arc<RwLock<Option<CurrencyConverter>>>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl FxService {
    pub const DEFAULT_DATA_SOURCE: DataSource = DataSource::Manual;

    pub fn new(repository: Arc<dyn FxRepositoryTrait>) -> Self {
        Self {
            repository,
            converter: Arc::new(RwLock::new(None)),
            event_sink: Arc::new(NoOpDomainEventSink),
        }
    }

    /// Sets the domain event sink for this service.
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }

    /// Initialize the currency converter with all exchange rates, filling missing days
    fn initialize_converter(&self) -> Result<()> {
        let all_historical_rates = self.repository.get_historical_exchange_rates()?;

        if all_historical_rates.is_empty() {
            log::warn!("No exchange rates available, converter not initialized");
            let mut converter_lock = self
                .converter
                .write()
                .map_err(|e| FxError::CacheError(e.to_string()))?;
            *converter_lock = None;
            return Ok(());
        }

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
        match self.repository.get_latest_exchange_rate(from, to)? {
            Some(rate) => Ok(rate),
            None => {
                // Try inverse rate via instrument_key
                let inverse_key = ExchangeRate::make_instrument_key(to, from);
                match self
                    .repository
                    .get_latest_exchange_rate_by_symbol(&inverse_key)?
                {
                    Some(inverse_rate) => {
                        let direct_rate = ExchangeRate {
                            id: inverse_rate.id,
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

    fn normalize_currency_pair<'a>(
        from_currency: &'a str,
        to_currency: &'a str,
    ) -> (&'a str, &'a str, Decimal, Decimal) {
        let normalized_from = normalize_currency_code(from_currency);
        let normalized_to = normalize_currency_code(to_currency);

        let source_multiplier = if normalized_from == from_currency {
            Decimal::ONE
        } else {
            Decimal::ONE / denormalization_multiplier(from_currency)
        };

        let target_multiplier = denormalization_multiplier(to_currency);

        (
            normalized_from,
            normalized_to,
            source_multiplier,
            target_multiplier,
        )
    }

    fn get_latest_rate_between_normalized(&self, from: &str, to: &str) -> Result<Decimal> {
        if from == to {
            return Ok(Decimal::ONE);
        }

        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                let today = Utc::now().naive_utc().date();
                if let Ok(rate) = converter.get_rate_nearest(from, to, today) {
                    return Ok(rate);
                }
            }
        }

        let rate = self.load_latest_exchange_rate(from, to)?;
        Ok(rate.rate)
    }

    fn get_rate_for_date_between_normalized(
        &self,
        from: &str,
        to: &str,
        date: NaiveDate,
    ) -> Result<Decimal> {
        if from == to {
            return Ok(Decimal::ONE);
        }

        if let Ok(converter_lock) = self.converter.read() {
            if let Some(converter) = &*converter_lock {
                if let Ok(rate) = converter.get_rate_nearest(from, to, date) {
                    return Ok(rate);
                }
            }
        }

        let latest_rate = self.load_latest_exchange_rate(from, to)?;
        let fallback_date = latest_rate.timestamp.date_naive();

        log::warn!(
            "No exchange rate found for {}/{} on {}. Using fallback rate from {}",
            from,
            to,
            date,
            fallback_date
        );

        Ok(latest_rate.rate)
    }
}

#[async_trait]
impl FxServiceTrait for FxService {
    fn initialize(&self) -> Result<()> {
        self.initialize_converter()?;
        Ok(())
    }

    async fn add_exchange_rate(&self, new_rate: NewExchangeRate) -> Result<ExchangeRate> {
        // Create/get the FX asset — returns the asset UUID
        let asset_id = self
            .repository
            .create_fx_asset(
                &new_rate.from_currency,
                &new_rate.to_currency,
                new_rate.source.as_str(),
            )
            .await?;

        let rate = ExchangeRate {
            id: asset_id,
            from_currency: new_rate.from_currency,
            to_currency: new_rate.to_currency,
            rate: new_rate.rate,
            source: new_rate.source,
            timestamp: Utc::now(),
        };

        self.repository.save_exchange_rate(rate).await
    }

    fn get_historical_rates(&self, from: &str, to: &str, days: i64) -> Result<Vec<ExchangeRate>> {
        let normalized_from = normalize_currency_code(from);
        let normalized_to = normalize_currency_code(to);

        let instrument_key = ExchangeRate::make_instrument_key(normalized_from, normalized_to);
        let end = Utc::now();
        let start = end - chrono::Duration::days(days);

        match self
            .repository
            .get_historical_quotes(&instrument_key, start.naive_utc(), end.naive_utc())
        {
            Ok(quotes) => Ok(quotes
                .into_iter()
                .map(|q| ExchangeRate {
                    id: q.asset_id.clone(),
                    from_currency: normalized_from.to_string(),
                    to_currency: normalized_to.to_string(),
                    rate: q.close,
                    source: q.data_source.clone(),
                    timestamp: q.timestamp,
                })
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
        let (normalized_from, normalized_to, source_multiplier, target_multiplier) =
            Self::normalize_currency_pair(from_currency, to_currency);

        if normalized_from == normalized_to {
            return Ok(source_multiplier * target_multiplier);
        }

        let base_rate =
            match self.get_latest_rate_between_normalized(normalized_from, normalized_to) {
                Ok(rate) => rate,
                Err(e) => {
                    log::error!(
                        "Exchange rate not available for {}/{}",
                        normalized_from,
                        normalized_to
                    );
                    return Err(e);
                }
            };

        Ok(source_multiplier * base_rate * target_multiplier)
    }

    fn get_exchange_rate_for_date(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal> {
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

        let (normalized_from, normalized_to, source_multiplier, target_multiplier) =
            Self::normalize_currency_pair(from_currency, to_currency);

        if normalized_from == normalized_to {
            return Ok(source_multiplier * target_multiplier);
        }

        let base_rate =
            self.get_rate_for_date_between_normalized(normalized_from, normalized_to, date)?;

        Ok(source_multiplier * base_rate * target_multiplier)
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

    async fn register_currency_pair(&self, from: &str, to: &str) -> Result<()> {
        if from == to || from.is_empty() || to.is_empty() {
            return Ok(());
        }

        let normalized_from = normalize_currency_code(from);
        let normalized_to = normalize_currency_code(to);

        if normalized_from.is_empty() || normalized_to.is_empty() {
            return Ok(());
        }

        let existing_rate = self
            .load_latest_exchange_rate(normalized_from, normalized_to)
            .ok();

        if existing_rate.is_none() {
            let asset_id = self
                .repository
                .create_fx_asset(normalized_from, normalized_to, DataSource::Yahoo.as_str())
                .await?;

            self.event_sink
                .emit(DomainEvent::assets_created(vec![asset_id]));
        }

        Ok(())
    }

    async fn register_currency_pair_manual(&self, from: &str, to: &str) -> Result<()> {
        if from == to || from.is_empty() || to.is_empty() {
            return Ok(());
        }

        let normalized_from = normalize_currency_code(from);
        let normalized_to = normalize_currency_code(to);

        if normalized_from.is_empty() || normalized_to.is_empty() {
            return Ok(());
        }

        let existing_rate = self
            .load_latest_exchange_rate(normalized_from, normalized_to)
            .ok();

        if existing_rate.is_none() {
            let asset_id = self
                .repository
                .create_fx_asset(normalized_from, normalized_to, DataSource::Manual.as_str())
                .await?;

            self.event_sink
                .emit(DomainEvent::assets_created(vec![asset_id]));
        }

        Ok(())
    }

    async fn ensure_fx_pairs(&self, pairs: Vec<(String, String)>) -> Result<()> {
        let unique_pairs: HashSet<(String, String)> = pairs.into_iter().collect();

        for (from, to) in unique_pairs {
            if from != to {
                self.register_currency_pair(&from, &to).await?;
            }
        }
        Ok(())
    }
}
