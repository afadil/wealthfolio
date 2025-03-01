use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::market_data::market_data_model::DataSource;

use super::assets_errors::Result;
use super::assets_errors::AssetError;
use super::assets_constants::*;

/// Domain model representing an asset in the system
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub comment: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}

/// Input model for creating a new asset
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewAsset {
    pub id: Option<String>,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub comment: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}

impl NewAsset {
    /// Validates the new asset data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(AssetError::InvalidData(
                "Asset symbol cannot be empty".to_string(),
            ));
        }
        if self.currency.trim().is_empty() {
            return Err(AssetError::InvalidData(
                "Currency cannot be empty".to_string(),
            ));
        }
        Ok(())
    }

    /// Creates a new cash asset
    pub fn new_cash_asset(currency: &str) -> Self {
        let asset_id = format!("$CASH-{}", currency);
        Self {
            id: Some(asset_id.clone()),
            symbol: asset_id,
            currency: currency.to_string(),
            asset_type: Some(CASH_ASSET_TYPE.to_string()),
            asset_class: Some(CASH_ASSET_CLASS.to_string()),
            asset_sub_class: Some(CASH_ASSET_CLASS.to_string()),
            data_source: DataSource::Manual.as_str().to_string(),
            ..Default::default()
        }
    }

    /// Creates a new FX asset
    pub fn new_fx_asset(base_currency: &str, target_currency: &str, source: &str) -> Self {
        let asset_id = format!("{}{}=X", base_currency, target_currency);
        let readable_name = format!("{}/{} Exchange Rate", base_currency, target_currency);
        let comment = format!(
            "Currency pair for converting from {} to {}",
            base_currency, target_currency
        );

        Self {
            id: Some(asset_id.clone()),
            name: Some(readable_name),
            symbol: asset_id,
            currency: base_currency.to_string(),
            asset_type: Some(CURRENCY_ASSET_TYPE.to_string()),
            asset_class: Some(CASH_ASSET_CLASS.to_string()),
            asset_sub_class: Some(CASH_ASSET_CLASS.to_string()),
            comment: Some(comment),
            data_source: source.to_string(),
            ..Default::default()
        }
    }
}

/// Input model for updating an asset profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub symbol: String,
    pub sectors: Option<String>,
    pub countries: Option<String>,
    pub comment: String,
    pub asset_sub_class: Option<String>,
    pub asset_class: Option<String>,
}

impl UpdateAssetProfile {
    /// Validates the asset profile update data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(AssetError::InvalidData(
                "Asset symbol cannot be empty".to_string(),
            ));
        }
        Ok(())
    }
}

/// Database model for assets
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
    Default,
)]
#[diesel(table_name = crate::schema::assets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct AssetDB {
    pub id: String,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub comment: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
}

// Conversion implementations
impl From<AssetDB> for Asset {
    fn from(db: AssetDB) -> Self {
        Self {
            id: db.id,
            isin: db.isin,
            name: db.name,
            asset_type: db.asset_type,
            symbol: db.symbol,
            symbol_mapping: db.symbol_mapping,
            asset_class: db.asset_class,
            asset_sub_class: db.asset_sub_class,
            comment: db.comment,
            countries: db.countries,
            categories: db.categories,
            classes: db.classes,
            attributes: db.attributes,
            created_at: db.created_at,
            updated_at: db.updated_at,
            currency: db.currency,
            data_source: db.data_source,
            sectors: db.sectors,
            url: db.url,
        }
    }
}

impl From<NewAsset> for AssetDB {
    fn from(domain: NewAsset) -> Self {
        let now = chrono::Utc::now().naive_utc();
        Self {
            id: domain.id.unwrap_or_default(),
            isin: domain.isin,
            name: domain.name,
            asset_type: domain.asset_type,
            symbol: domain.symbol,
            symbol_mapping: domain.symbol_mapping,
            asset_class: domain.asset_class,
            asset_sub_class: domain.asset_sub_class,
            comment: domain.comment,
            countries: domain.countries,
            categories: domain.categories,
            classes: domain.classes,
            attributes: domain.attributes,
            created_at: now,
            updated_at: now,
            currency: domain.currency,
            data_source: domain.data_source,
            sectors: domain.sectors,
            url: domain.url,
        }
    }
}

/// Domain model representing a quote in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
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

/// Database model for quotes
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    Associations,
    Serialize,
    AsChangeset,
    Deserialize,
    Debug,
    Clone,
    QueryableByName,
)]
#[diesel(belongs_to(AssetDB, foreign_key = symbol))]
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

impl From<QuoteDB> for Quote {
    fn from(db: QuoteDB) -> Self {
        Self {
            id: db.id,
            created_at: db.created_at,
            data_source: db.data_source,
            date: db.date,
            symbol: db.symbol,
            open: db.open,
            high: db.high,
            low: db.low,
            volume: db.volume,
            close: db.close,
            adjclose: db.adjclose,
        }
    }
}

impl From<Quote> for QuoteDB {
    fn from(domain: Quote) -> Self {
        Self {
            id: domain.id,
            created_at: domain.created_at,
            data_source: domain.data_source,
            date: domain.date,
            symbol: domain.symbol,
            open: domain.open,
            high: domain.high,
            low: domain.low,
            volume: domain.volume,
            close: domain.close,
            adjclose: domain.adjclose,
        }
    }
}

/// Domain model representing an asset profile with its quote history
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetProfile {
    pub asset: Asset,
    pub quote_history: Vec<Quote>,
}

/// Domain model representing a quote summary
#[derive(Debug, Clone, Serialize, Deserialize)]
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