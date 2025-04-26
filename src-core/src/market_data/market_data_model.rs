use crate::schema::quotes;
use diesel::prelude::*;
use diesel::{
    sql_types::Text,
    expression::AsExpression,
};
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use crate::market_data::market_data_constants::{DATA_SOURCE_YAHOO, DATA_SOURCE_MANUAL};

#[derive(Queryable, Identifiable, Selectable, Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub symbol: String,
    pub timestamp: DateTime<Utc>,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub adjclose: Decimal,
    pub volume: Decimal,
    pub currency: String,
    pub data_source: DataSource,
    pub created_at: DateTime<Utc>,
}

#[derive(Queryable, Identifiable, Selectable, Insertable, AsChangeset, Debug, Clone, Serialize, Deserialize, PartialEq, QueryableByName)]
#[diesel(table_name = quotes)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct QuoteDb {
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
}

// Conversion implementations
impl From<QuoteDb> for Quote {
    fn from(db: QuoteDb) -> Self {
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
        }
    }
}

impl From<&Quote> for QuoteDb {
    fn from(quote: &Quote) -> Self {
        QuoteDb {
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
        }
    }
}

/// Summary model for quote search results
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub exchange: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
}

#[derive(Debug, Clone)]
pub struct QuoteRequest {
    pub symbol: String,
    pub data_source: DataSource,
    pub currency: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, AsExpression)]
#[diesel(sql_type = Text)]
#[serde(rename_all = "UPPERCASE")]
pub enum DataSource {
    Yahoo,
    Manual,
}

impl DataSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            DataSource::Yahoo => DATA_SOURCE_YAHOO,
            DataSource::Manual => DATA_SOURCE_MANUAL,
        }
    }
}

impl From<DataSource> for String {
    fn from(source: DataSource) -> Self {
        source.as_str().to_string()
    }
}

impl From<&str> for DataSource {
    fn from(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            DATA_SOURCE_YAHOO => DataSource::Yahoo,
            _ => DataSource::Manual,
        }
    }
}

#[derive(Clone, Debug)]
pub struct LatestQuotePair {
    pub latest: Quote,
    pub previous: Option<Quote>,
}