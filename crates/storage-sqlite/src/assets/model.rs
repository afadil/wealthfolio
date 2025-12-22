//! Database model for assets.

use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use wealthfolio_core::assets::{Asset, NewAsset};

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
    pub notes: Option<String>,
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
            notes: db.notes,
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
            notes: domain.notes,
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
