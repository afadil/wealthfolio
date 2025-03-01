use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use crate::market_data::market_data_constants::{DATA_SOURCE_YAHOO, DATA_SOURCE_MANUAL};

/// Domain model representing a market quote

#[derive(QueryableByName, Debug)]
pub struct QuoteWithCurrency {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub date: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub open: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub high: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub low: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub close: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub adjclose: f64,
    #[diesel(sql_type = diesel::sql_types::Double)]
    pub volume: f64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub data_source: String,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub created_at: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DataSource {
    Yahoo,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub id: String,
    pub symbol: String,
    pub date: NaiveDateTime,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub adjclose: f64,
    pub volume: f64,
    pub data_source: DataSource,
    pub created_at: NaiveDateTime,
    pub currency: Option<String>,
}

/// Input model for updating an existing quote
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteUpdate {
    pub id: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub adjclose: f64,
    pub volume: f64,
}

/// Summary model for quote search results
// #[derive(Debug, Clone, Serialize, Deserialize)]
// #[serde(rename_all = "camelCase")]
// pub struct QuoteSummary {
//     pub symbol: String,
//     pub name: String,
//     pub exchange: String,
//     pub asset_type: String,
//     pub currency: String,
// }

/// Summary model for quote search results
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub exchange: String,
    // pub exchange_display: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
}

/// Database model for quotes
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    QueryableByName,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::quotes)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct QuoteDB {
    pub id: String,
    pub created_at: NaiveDateTime,
    pub data_source: String,
    pub date: NaiveDateTime,
    pub symbol: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub volume: f64,
    pub close: f64,
    pub adjclose: f64,
}

// Conversion implementations
impl From<QuoteDB> for Quote {
    fn from(db: QuoteDB) -> Self {
        Quote {
            id: db.id,
            symbol: db.symbol,
            date: db.date,
            open: db.open,
            high: db.high,
            low: db.low,
            close: db.close,
            adjclose: db.adjclose,
            volume: db.volume,
            data_source: DataSource::from(db.data_source.as_ref()),
            created_at: db.created_at,
            currency: None, // Currency will be set from asset data when needed
        }
    }
}

impl From<QuoteWithCurrency> for Quote {
    fn from(q: QuoteWithCurrency) -> Self {
        Quote {
            id: q.id,
            symbol: q.symbol,
            date: q.date,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            adjclose: q.adjclose,
            volume: q.volume,
            data_source: DataSource::from(q.data_source.as_str()),
            created_at: q.created_at,
            currency: Some(q.currency),
        }
    }
}

impl From<Quote> for QuoteDB {
    fn from(domain: Quote) -> Self {
        Self {
            id: domain.id,
            symbol: domain.symbol,
            date: domain.date,
            open: domain.open,
            high: domain.high,
            low: domain.low,
            close: domain.close,
            adjclose: domain.adjclose,
            volume: domain.volume,
            data_source: domain.data_source.as_str().to_string(),
            created_at: domain.created_at,
        }
    }
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

#[derive(Debug, Clone)]
pub struct QuoteRequest {
    pub symbol: String,
    pub data_source: DataSource,
}

impl QuoteRequest {
    pub fn new(symbol: String, data_source: DataSource) -> Self {
        Self {
            symbol,
            data_source,
        }
    }

    pub fn to_asset(&self) -> crate::assets::assets_model::Asset {
        use chrono::Utc;
        let now = Utc::now().naive_utc();
        
        crate::assets::assets_model::Asset {
            id: self.symbol.clone(),
            symbol: self.symbol.clone(),
            data_source: self.data_source.as_str().to_string(),
            currency: String::new(), // Default value
            created_at: now,
            updated_at: now,
            isin: None,
            name: None,
            asset_type: None,
            symbol_mapping: None,
            asset_class: None,
            asset_sub_class: None,
            comment: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            sectors: None,
            url: None,
        }
    }
} 