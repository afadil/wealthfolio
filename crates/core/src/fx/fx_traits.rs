use super::fx_model::{ExchangeRate, NewExchangeRate};
use crate::errors::Result;
use crate::quotes::Quote;
use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime};
use rust_decimal::Decimal;

/// Trait defining the contract for FX repository operations.
#[async_trait]
pub trait FxRepositoryTrait: Send + Sync {
    fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    fn get_historical_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    fn get_latest_exchange_rate(&self, from: &str, to: &str) -> Result<Option<ExchangeRate>>;
    fn get_latest_exchange_rate_by_symbol(&self, symbol: &str) -> Result<Option<ExchangeRate>>;
    fn get_historical_quotes(
        &self,
        symbol: &str,
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<Quote>>;
    async fn add_quote(
        &self,
        symbol: String,
        date: String,
        rate: Decimal,
        source: String,
    ) -> Result<Quote>;
    async fn save_exchange_rate(&self, rate: ExchangeRate) -> Result<ExchangeRate>;
    async fn update_exchange_rate(&self, rate: &ExchangeRate) -> Result<ExchangeRate>;
    async fn delete_exchange_rate(&self, rate_id: &str) -> Result<()>;
    async fn create_fx_asset(
        &self,
        from_currency: &str,
        to_currency: &str,
        source: &str,
    ) -> Result<()>;
}

/// Trait defining the contract for FX service operations.
#[async_trait]
pub trait FxServiceTrait: Send + Sync {
    fn initialize(&self) -> Result<()>;

    fn get_historical_rates(
        &self,
        from_currency: &str,
        to_currency: &str,
        days: i64,
    ) -> Result<Vec<ExchangeRate>>;
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
    fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>>;
    async fn add_exchange_rate(&self, new_rate: NewExchangeRate) -> Result<ExchangeRate>;
    async fn update_exchange_rate(
        &self,
        from_currency: &str,
        to_currency: &str,
        rate: Decimal,
    ) -> Result<ExchangeRate>;
    async fn delete_exchange_rate(&self, rate_id: &str) -> Result<()>;
    async fn register_currency_pair(&self, from_currency: &str, to_currency: &str) -> Result<()>;
    async fn register_currency_pair_manual(
        &self,
        from_currency: &str,
        to_currency: &str,
    ) -> Result<()>;
}
