//! Database model for assets.

use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use wealthfolio_core::assets::{Asset, AssetKind, NewAsset};

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
    pub kind: Option<String>,         // Behavior classification (stored as string)
    pub quote_symbol: Option<String>, // Symbol for pricing lookup (replaces symbol_mapping)
    pub is_active: i32,               // 1/0 for usability (SQLite INTEGER)
    pub metadata: Option<String>,     // JSON for extensions (stored as text)
}

// Conversion implementations
impl From<AssetDB> for Asset {
    fn from(db: AssetDB) -> Self {
        // Parse kind string to AssetKind enum
        let kind = db.kind.as_ref().and_then(|s| match s.as_str() {
            "SECURITY" => Some(AssetKind::Security),
            "CRYPTO" => Some(AssetKind::Crypto),
            "CASH" => Some(AssetKind::Cash),
            "FX_RATE" => Some(AssetKind::FxRate),
            "OPTION" => Some(AssetKind::Option),
            "COMMODITY" => Some(AssetKind::Commodity),
            "PRIVATE_EQUITY" => Some(AssetKind::PrivateEquity),
            "PROPERTY" => Some(AssetKind::Property),
            "VEHICLE" => Some(AssetKind::Vehicle),
            "LIABILITY" => Some(AssetKind::Liability),
            "OTHER" => Some(AssetKind::Other),
            _ => None,
        });

        // Parse metadata JSON if present
        let metadata = db
            .metadata
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Self {
            id: db.id,
            isin: db.isin,
            name: db.name,
            asset_type: db.asset_type,
            symbol: db.symbol,
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
            kind,
            quote_symbol: db.quote_symbol,
            is_active: db.is_active != 0,
            metadata,
        }
    }
}

impl From<NewAsset> for AssetDB {
    fn from(domain: NewAsset) -> Self {
        let now = chrono::Utc::now().naive_utc();

        // Convert AssetKind enum to string for storage
        let kind = domain.kind.as_ref().map(|k| match k {
            AssetKind::Security => "SECURITY".to_string(),
            AssetKind::Crypto => "CRYPTO".to_string(),
            AssetKind::Cash => "CASH".to_string(),
            AssetKind::FxRate => "FX_RATE".to_string(),
            AssetKind::Option => "OPTION".to_string(),
            AssetKind::Commodity => "COMMODITY".to_string(),
            AssetKind::PrivateEquity => "PRIVATE_EQUITY".to_string(),
            AssetKind::Property => "PROPERTY".to_string(),
            AssetKind::Vehicle => "VEHICLE".to_string(),
            AssetKind::Liability => "LIABILITY".to_string(),
            AssetKind::Other => "OTHER".to_string(),
        });

        // Serialize metadata to JSON string
        let metadata = domain
            .metadata
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());

        Self {
            id: domain.id.unwrap_or_default(),
            isin: domain.isin,
            name: domain.name,
            asset_type: domain.asset_type,
            symbol: domain.symbol,
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
            kind,
            quote_symbol: domain.quote_symbol,
            is_active: if domain.is_active { 1 } else { 0 },
            metadata,
        }
    }
}
