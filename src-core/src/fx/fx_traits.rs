use super::fx_model::{ExchangeRate, NewExchangeRate};
use crate::errors::Result;
use crate::market_data::market_data_model::Quote;
use chrono::{NaiveDate, NaiveDateTime};
use rust_decimal::Decimal;
use std::collections::HashMap;

/// Trait defining the contract for FX repository operations.
pub trait FxRepositoryTrait: Send + Sync {
    fn get_all_currency_quotes(&self) -> Result<HashMap<String, Vec<Quote>>>;
    fn get_latest_currency_rates(&self) -> Result<HashMap<String, Decimal>>;
    fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    fn get_all_historical_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    fn get_exchange_rate(&self, from: &str, to: &str) -> Result<Option<ExchangeRate>>;
    fn get_exchange_rate_by_id(&self, id: &str) -> Result<Option<ExchangeRate>>;
    fn get_historical_quotes(
        &self,
        symbol: &str,
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<Quote>>;
    fn add_quote(
        &self,
        symbol: String,
        date: String,
        rate: Decimal,
        source: String,
    ) -> Result<Quote>;
    fn save_exchange_rate(&self, rate: ExchangeRate) -> Result<ExchangeRate>;
    fn update_exchange_rate(&self, rate: &ExchangeRate) -> Result<ExchangeRate>;
    fn delete_exchange_rate(&self, rate_id: &str) -> Result<()>;
    fn create_fx_asset(&self, from_currency: &str, to_currency: &str, source: &str) -> Result<()>;
}

/// Trait defining the contract for FX service operations.
pub trait FxServiceTrait: Send + Sync {
    fn initialize(&self) -> Result<()>;
    fn add_exchange_rate(&self, new_rate: NewExchangeRate) -> Result<ExchangeRate>;
    fn get_historical_rates(&self, from_currency: &str, to_currency: &str, days: i64) -> Result<Vec<ExchangeRate>>;
    fn update_exchange_rate(&self, from_currency: &str, to_currency: &str, rate: Decimal) -> Result<ExchangeRate>;
    fn get_latest_exchange_rate(&self, from_currency: &str, to_currency: &str) -> Result<Decimal>;
    fn get_exchange_rate_for_date(
        &self,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal>;
    fn convert_currency(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<Decimal>;
    fn convert_currency_for_date(
        &self,
        amount: Decimal,
        from_currency: &str,
        to_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal>;
    fn get_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    fn delete_exchange_rate(&self, rate_id: &str) -> Result<()>;
    fn register_currency_pair(&self, from_currency: &str, to_currency: &str) -> Result<()>;
    fn register_currency_pair_manual(&self, from_currency: &str, to_currency: &str) -> Result<()>;
}
