use crate::schema::quotes;
use diesel::prelude::*;
use diesel::{
    sql_types::Text,
    expression::AsExpression,
};
use bigdecimal::BigDecimal;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use crate::market_data::market_data_constants::{DATA_SOURCE_YAHOO, DATA_SOURCE_MANUAL};




#[derive(Queryable, Identifiable, Selectable, Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub symbol: String,
    pub date: NaiveDateTime,
    pub open: BigDecimal,
    pub high: BigDecimal,
    pub low: BigDecimal,
    pub close: BigDecimal,
    pub adjclose: BigDecimal,
    pub volume: BigDecimal,
    pub currency: String,
    pub data_source: DataSource,
    pub created_at: NaiveDateTime,
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
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub date: NaiveDateTime,
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
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub created_at: NaiveDateTime,
}


// Conversion implementations
impl From<QuoteDb> for Quote {
    fn from(db: QuoteDb) -> Self {
        Quote {
            id: db.id,
            symbol: db.symbol,
            date: db.date,
            open: BigDecimal::from_str(&db.open).unwrap_or_default(),
            high: BigDecimal::from_str(&db.high).unwrap_or_default(),
            low: BigDecimal::from_str(&db.low).unwrap_or_default(),
            close: BigDecimal::from_str(&db.close).unwrap_or_default(),
            adjclose: BigDecimal::from_str(&db.adjclose).unwrap_or_default(),
            volume: BigDecimal::from_str(&db.volume).unwrap_or_default(),
            data_source: DataSource::from(db.data_source.as_ref()),
            created_at: db.created_at,
            currency: db.currency,
        }
    }
}


impl From<&Quote> for QuoteDb {
    fn from(quote: &Quote) -> Self {
        QuoteDb {
            id: quote.id.clone(),  // String needs cloning
            symbol: quote.symbol.clone(),  // String needs cloning
            date: quote.date,          // NaiveDateTime is Copy
            open: quote.open.to_string(),   // BigDecimal -> String
            high: quote.high.to_string(),  // BigDecimal -> String
            low: quote.low.to_string(),   // BigDecimal -> String
            close: quote.close.to_string(),  // BigDecimal -> String
            adjclose: quote.adjclose.to_string(),
            volume: quote.volume.to_string(), //BigDecimal -> String
            currency: quote.currency.clone(),  //String needs cloning
            data_source: quote.data_source.as_str().to_string(),
            created_at: quote.created_at, // NaiveDateTime is copy
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