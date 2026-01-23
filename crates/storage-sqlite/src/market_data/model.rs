//! Database models for market data (quotes, providers, sync state).

use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::quotes::{
    DataSource, MarketDataProviderSetting, ProviderCapabilities, Quote, QuoteSyncState,
};

/// Database model for quotes
///
/// Updated to use the new schema with:
/// - `asset_id` instead of `symbol`
/// - `day` for YYYY-MM-DD date
/// - `source` instead of `data_source`
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
    pub asset_id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub day: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub source: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub open: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub high: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub low: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub close: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub adjclose: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub volume: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub notes: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub created_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub timestamp: String,
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
#[diesel(primary_key(asset_id))]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct QuoteSyncStateDB {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub asset_id: String,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub is_active: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub position_closed_date: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_synced_at: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub data_source: String,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub sync_priority: i32,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub error_count: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub last_error: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub profile_enriched_at: Option<String>,
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
    pub position_closed_date: Option<Option<String>>,
    pub last_synced_at: Option<Option<String>>,
    pub data_source: Option<String>,
    pub sync_priority: Option<i32>,
    pub error_count: Option<i32>,
    pub last_error: Option<Option<String>>,
    pub profile_enriched_at: Option<Option<String>>,
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

        let parse_optional_decimal = |s: &Option<String>| -> Decimal {
            s.as_ref()
                .and_then(|v| Decimal::from_str(v).ok())
                .unwrap_or_default()
        };

        Quote {
            id: db.id,
            asset_id: db.asset_id,
            timestamp: parse_datetime(&db.timestamp),
            open: parse_optional_decimal(&db.open),
            high: parse_optional_decimal(&db.high),
            low: parse_optional_decimal(&db.low),
            close: Decimal::from_str(&db.close).unwrap_or_default(),
            adjclose: parse_optional_decimal(&db.adjclose),
            volume: parse_optional_decimal(&db.volume),
            data_source: DataSource::from(db.source.as_ref()),
            created_at: parse_datetime(&db.created_at),
            currency: db.currency,
            notes: db.notes,
        }
    }
}

impl From<&Quote> for QuoteDB {
    fn from(quote: &Quote) -> Self {
        // Extract day from timestamp (YYYY-MM-DD)
        let day = quote.timestamp.format("%Y-%m-%d").to_string();

        // Convert Decimal to Option<String>, treating zero as None for OHLV
        let decimal_to_optional = |d: &Decimal| -> Option<String> {
            if d.is_zero() {
                None
            } else {
                Some(d.to_string())
            }
        };

        QuoteDB {
            id: quote.id.clone(),
            asset_id: quote.asset_id.clone(),
            day,
            source: quote.data_source.as_str().to_string(),
            open: decimal_to_optional(&quote.open),
            high: decimal_to_optional(&quote.high),
            low: decimal_to_optional(&quote.low),
            close: quote.close.to_string(),
            adjclose: decimal_to_optional(&quote.adjclose),
            volume: decimal_to_optional(&quote.volume),
            currency: quote.currency.clone(),
            notes: quote.notes.clone(),
            created_at: quote.created_at.to_rfc3339(),
            timestamp: quote.timestamp.to_rfc3339(),
        }
    }
}

impl From<MarketDataProviderSettingDB> for MarketDataProviderSetting {
    fn from(db: MarketDataProviderSettingDB) -> Self {
        let capabilities = ProviderCapabilities::for_provider(&db.id);
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
            capabilities,
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
            asset_id: db.asset_id,
            is_active: db.is_active != 0,
            position_closed_date: db.position_closed_date.as_deref().and_then(parse_date),
            last_synced_at: db.last_synced_at.as_deref().map(parse_datetime),
            data_source: db.data_source,
            sync_priority: db.sync_priority,
            error_count: db.error_count,
            last_error: db.last_error,
            profile_enriched_at: db.profile_enriched_at.as_deref().map(parse_datetime),
            created_at: parse_datetime(&db.created_at),
            updated_at: parse_datetime(&db.updated_at),
        }
    }
}

impl From<&QuoteSyncState> for QuoteSyncStateDB {
    fn from(state: &QuoteSyncState) -> Self {
        QuoteSyncStateDB {
            asset_id: state.asset_id.clone(),
            is_active: if state.is_active { 1 } else { 0 },
            position_closed_date: state
                .position_closed_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            last_synced_at: state.last_synced_at.map(|dt| dt.to_rfc3339()),
            data_source: state.data_source.clone(),
            sync_priority: state.sync_priority,
            error_count: state.error_count,
            last_error: state.last_error.clone(),
            profile_enriched_at: state.profile_enriched_at.map(|dt| dt.to_rfc3339()),
            created_at: state.created_at.to_rfc3339(),
            updated_at: state.updated_at.to_rfc3339(),
        }
    }
}
