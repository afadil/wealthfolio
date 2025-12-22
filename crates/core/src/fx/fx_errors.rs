use crate::errors::DatabaseError;
use std::error::Error;
use std::fmt;

#[derive(Debug)]
pub enum FxError {
    DatabaseError(String),
    RateNotFound(String),
    InvalidCurrencyPair(String),
    InvalidCurrencyCode(String),
    CacheError(String),
    ConversionError(String),
    SaveError(String),
    FetchError(String),
}

impl fmt::Display for FxError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            FxError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            FxError::RateNotFound(msg) => write!(f, "Exchange rate not found: {}", msg),
            FxError::InvalidCurrencyPair(msg) => write!(f, "Invalid currency pair: {}", msg),
            FxError::InvalidCurrencyCode(msg) => write!(f, "Invalid currency code: {}", msg),
            FxError::CacheError(msg) => write!(f, "Cache error: {}", msg),
            FxError::ConversionError(msg) => write!(f, "Currency conversion error: {}", msg),
            FxError::SaveError(msg) => write!(f, "Save error: {}", msg),
            FxError::FetchError(msg) => write!(f, "Fetch error: {}", msg),
        }
    }
}

impl Error for FxError {}

impl From<diesel::result::Error> for FxError {
    fn from(err: diesel::result::Error) -> Self {
        FxError::DatabaseError(err.to_string())
    }
}

impl From<DatabaseError> for FxError {
    fn from(err: DatabaseError) -> Self {
        FxError::DatabaseError(err.to_string())
    }
}

impl
    From<
        std::sync::PoisonError<
            std::sync::RwLockReadGuard<'_, std::collections::HashMap<String, f64>>,
        >,
    > for FxError
{
    fn from(
        err: std::sync::PoisonError<
            std::sync::RwLockReadGuard<'_, std::collections::HashMap<String, f64>>,
        >,
    ) -> Self {
        FxError::CacheError(err.to_string())
    }
}

impl
    From<
        std::sync::PoisonError<
            std::sync::RwLockWriteGuard<'_, std::collections::HashMap<String, f64>>,
        >,
    > for FxError
{
    fn from(
        err: std::sync::PoisonError<
            std::sync::RwLockWriteGuard<'_, std::collections::HashMap<String, f64>>,
        >,
    ) -> Self {
        FxError::CacheError(err.to_string())
    }
}

impl
    From<
        std::sync::PoisonError<
            std::sync::RwLockReadGuard<
                '_,
                std::collections::HashMap<
                    String,
                    Vec<crate::market_data::market_data_model::Quote>,
                >,
            >,
        >,
    > for FxError
{
    fn from(
        err: std::sync::PoisonError<
            std::sync::RwLockReadGuard<
                '_,
                std::collections::HashMap<
                    String,
                    Vec<crate::market_data::market_data_model::Quote>,
                >,
            >,
        >,
    ) -> Self {
        FxError::CacheError(err.to_string())
    }
}

impl
    From<
        std::sync::PoisonError<
            std::sync::RwLockWriteGuard<
                '_,
                std::collections::HashMap<
                    String,
                    Vec<crate::market_data::market_data_model::Quote>,
                >,
            >,
        >,
    > for FxError
{
    fn from(
        err: std::sync::PoisonError<
            std::sync::RwLockWriteGuard<
                '_,
                std::collections::HashMap<
                    String,
                    Vec<crate::market_data::market_data_model::Quote>,
                >,
            >,
        >,
    ) -> Self {
        FxError::CacheError(err.to_string())
    }
}

use diesel;
