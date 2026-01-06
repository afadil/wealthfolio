//! Database models for market data (quotes, providers, sync state).

use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::market_data::{DataSource, MarketDataProviderSetting, Quote, QuoteSyncState};

/// Database model for quotes
#[derive(
    Queryable,
    Identifiable,
    Selectable,
    Insertable,
    AsChangeset,
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    QueryableByName,
)]
#[diesel(table_name = crate::schema::quotes)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct QuoteDB {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub timestamp: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub open: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub high: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub low: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub close: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub adjclose: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub volume: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub data_source: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub created_at: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub notes: Option<String>,
}

/// Database model for market data provider settings
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    Queryable,
    Identifiable,
    Selectable,
    Insertable,
    AsChangeset,
)]
#[diesel(table_name = crate::schema::market_data_providers)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct MarketDataProviderSettingDB {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: Option<String>,
    pub priority: i32,
    pub enabled: bool,
    pub logo_filename: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
}

/// Database model for updating market data provider settings
#[derive(Debug, Clone, Serialize, Deserialize, Insertable, AsChangeset)]
#[diesel(table_name = crate::schema::market_data_providers)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct UpdateMarketDataProviderSettingDB {
    pub priority: Option<i32>,
    pub enabled: Option<bool>,
}

/// Database model for quote sync state
#[derive(
    Debug, Clone, Queryable, Identifiable, Selectable, Insertable, AsChangeset, QueryableByName,
)]
#[diesel(table_name = crate::schema::quote_sync_state)]
#[diesel(primary_key(symbol))]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct QuoteSyncStateDB {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub is_active: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub first_activity_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_activity_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub position_closed_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_synced_at: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_quote_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub earliest_quote_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub data_source: String,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub sync_priority: i32,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub error_count: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_error: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub created_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub updated_at: String,
}

/// Update payload for partial updates to quote sync state
#[derive(Debug, Clone, Default, AsChangeset)]
#[diesel(table_name = crate::schema::quote_sync_state)]
pub struct QuoteSyncStateUpdateDB {
    pub is_active: Option<i32>,
    pub first_activity_date: Option<Option<String>>,
    pub last_activity_date: Option<Option<String>>,
    pub position_closed_date: Option<Option<String>>,
    pub last_synced_at: Option<Option<String>>,
    pub last_quote_date: Option<Option<String>>,
    pub earliest_quote_date: Option<Option<String>>,
    pub sync_priority: Option<i32>,
    pub error_count: Option<i32>,
    pub last_error: Option<Option<String>>,
    pub updated_at: Option<String>,
}

// Conversion implementations

impl From<QuoteDB> for Quote {
    fn from(db: QuoteDB) -> Self {
        let parse_datetime = |s: &str| -> DateTime<Utc> {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now())
        };

        Quote {
            id: db.id,
            symbol: db.symbol,
            timestamp: parse_datetime(&db.timestamp),
            open: Decimal::from_str(&db.open).unwrap_or_default(),
            high: Decimal::from_str(&db.high).unwrap_or_default(),
            low: Decimal::from_str(&db.low).unwrap_or_default(),
            close: Decimal::from_str(&db.close).unwrap_or_default(),
            adjclose: Decimal::from_str(&db.adjclose).unwrap_or_default(),
            volume: Decimal::from_str(&db.volume).unwrap_or_default(),
            data_source: DataSource::from(db.data_source.as_ref()),
            created_at: parse_datetime(&db.created_at),
            currency: db.currency,
            notes: db.notes,
        }
    }
}

impl From<&Quote> for QuoteDB {
    fn from(quote: &Quote) -> Self {
        QuoteDB {
            id: quote.id.clone(),
            symbol: quote.symbol.clone(),
            timestamp: quote.timestamp.to_rfc3339(),
            open: quote.open.to_string(),
            high: quote.high.to_string(),
            low: quote.low.to_string(),
            close: quote.close.to_string(),
            adjclose: quote.adjclose.to_string(),
            volume: quote.volume.to_string(),
            currency: quote.currency.clone(),
            data_source: quote.data_source.as_str().to_string(),
            created_at: quote.created_at.to_rfc3339(),
            notes: quote.notes.clone(),
        }
    }
}

impl From<MarketDataProviderSettingDB> for MarketDataProviderSetting {
    fn from(db: MarketDataProviderSettingDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            description: db.description,
            url: db.url,
            priority: db.priority,
            enabled: db.enabled,
            logo_filename: db.logo_filename,
            last_synced_at: db.last_synced_at,
            last_sync_status: db.last_sync_status,
            last_sync_error: db.last_sync_error,
        }
    }
}

impl From<MarketDataProviderSetting> for MarketDataProviderSettingDB {
    fn from(domain: MarketDataProviderSetting) -> Self {
        Self {
            id: domain.id,
            name: domain.name,
            description: domain.description,
            url: domain.url,
            priority: domain.priority,
            enabled: domain.enabled,
            logo_filename: domain.logo_filename,
            last_synced_at: domain.last_synced_at,
            last_sync_status: domain.last_sync_status,
            last_sync_error: domain.last_sync_error,
        }
    }
}

impl From<QuoteSyncStateDB> for QuoteSyncState {
    fn from(db: QuoteSyncStateDB) -> Self {
        let parse_datetime = |s: &str| -> DateTime<Utc> {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now())
        };

        let parse_date =
            |s: &str| -> Option<NaiveDate> { NaiveDate::parse_from_str(s, "%Y-%m-%d").ok() };

        QuoteSyncState {
            symbol: db.symbol,
            is_active: db.is_active != 0,
            first_activity_date: db.first_activity_date.as_deref().and_then(parse_date),
            last_activity_date: db.last_activity_date.as_deref().and_then(parse_date),
            position_closed_date: db.position_closed_date.as_deref().and_then(parse_date),
            last_synced_at: db.last_synced_at.as_deref().map(parse_datetime),
            last_quote_date: db.last_quote_date.as_deref().and_then(parse_date),
            earliest_quote_date: db.earliest_quote_date.as_deref().and_then(parse_date),
            data_source: db.data_source,
            sync_priority: db.sync_priority,
            error_count: db.error_count,
            last_error: db.last_error,
            created_at: parse_datetime(&db.created_at),
            updated_at: parse_datetime(&db.updated_at),
        }
    }
}

impl From<&QuoteSyncState> for QuoteSyncStateDB {
    fn from(state: &QuoteSyncState) -> Self {
        QuoteSyncStateDB {
            symbol: state.symbol.clone(),
            is_active: if state.is_active { 1 } else { 0 },
            first_activity_date: state
                .first_activity_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            last_activity_date: state
                .last_activity_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            position_closed_date: state
                .position_closed_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            last_synced_at: state.last_synced_at.map(|dt| dt.to_rfc3339()),
            last_quote_date: state
                .last_quote_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            earliest_quote_date: state
                .earliest_quote_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            data_source: state.data_source.clone(),
            sync_priority: state.sync_priority,
            error_count: state.error_count,
            last_error: state.last_error.clone(),
            created_at: state.created_at.to_rfc3339(),
            updated_at: state.updated_at.to_rfc3339(),
        }
    }
}
