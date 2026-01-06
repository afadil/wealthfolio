//! Database model for assets.
//! Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)

use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use wealthfolio_core::assets::{Asset, AssetKind, NewAsset, PricingMode};

/// Database model for assets
/// Matches the new schema: no data_source, no quote_symbol, kind/pricing_mode are NOT NULL
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

    // Core identity
    pub kind: String,            // AssetKind enum (NOT NULL)
    pub name: Option<String>,
    pub symbol: String,          // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: String,            // MARKET, MANUAL, DERIVED, NONE (NOT NULL)
    pub preferred_provider: Option<String>,
    pub provider_overrides: Option<String>, // JSON for per-provider overrides

    // Classification
    pub isin: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,

    // Metadata
    pub notes: Option<String>,
    pub profile: Option<String>,  // JSON: sectors, countries, website, etc.
    pub metadata: Option<String>,

    // Status
    pub is_active: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// Conversion implementations
impl From<AssetDB> for Asset {
    fn from(db: AssetDB) -> Self {
        // Parse kind string to AssetKind enum (NOT NULL, defaults to Security)
        let kind = match db.kind.as_str() {
            "SECURITY" => AssetKind::Security,
            "CRYPTO" => AssetKind::Crypto,
            "CASH" => AssetKind::Cash,
            "FX_RATE" => AssetKind::FxRate,
            "OPTION" => AssetKind::Option,
            "COMMODITY" => AssetKind::Commodity,
            "PRIVATE_EQUITY" => AssetKind::PrivateEquity,
            "PROPERTY" => AssetKind::Property,
            "VEHICLE" => AssetKind::Vehicle,
            "COLLECTIBLE" => AssetKind::Collectible,
            "PHYSICAL_PRECIOUS" => AssetKind::PhysicalPrecious,
            "LIABILITY" => AssetKind::Liability,
            "OTHER" => AssetKind::Other,
            _ => AssetKind::Security,
        };

        // Parse pricing_mode string to PricingMode enum (NOT NULL)
        let pricing_mode = match db.pricing_mode.as_str() {
            "MARKET" => PricingMode::Market,
            "MANUAL" => PricingMode::Manual,
            "DERIVED" => PricingMode::Derived,
            "NONE" => PricingMode::None,
            _ => PricingMode::Market,
        };

        // Parse metadata JSON if present
        let metadata = db
            .metadata
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        // Parse provider_overrides JSON if present
        let provider_overrides = db
            .provider_overrides
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        // Parse profile JSON if present
        let profile = db
            .profile
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Self {
            id: db.id,
            kind,
            name: db.name,
            symbol: db.symbol,
            exchange_mic: db.exchange_mic,
            currency: db.currency,
            pricing_mode,
            preferred_provider: db.preferred_provider,
            provider_overrides,
            isin: db.isin,
            asset_class: db.asset_class,
            asset_sub_class: db.asset_sub_class,
            notes: db.notes,
            profile,
            metadata,
            is_active: db.is_active != 0,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewAsset> for AssetDB {
    fn from(domain: NewAsset) -> Self {
        let now = chrono::Utc::now().naive_utc();

        // Convert enums to database strings using as_db_str()
        let kind = domain.kind.as_db_str().to_string();
        let pricing_mode = domain.pricing_mode.as_db_str().to_string();

        // Serialize metadata to JSON string
        let metadata = domain
            .metadata
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());

        // Serialize provider_overrides to JSON string
        let provider_overrides = domain
            .provider_overrides
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());

        // Serialize profile to JSON string
        let profile = domain
            .profile
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());

        Self {
            id: domain.id.unwrap_or_default(),
            kind,
            name: domain.name,
            symbol: domain.symbol,
            exchange_mic: domain.exchange_mic,
            currency: domain.currency,
            pricing_mode,
            preferred_provider: domain.preferred_provider,
            provider_overrides,
            isin: domain.isin,
            asset_class: domain.asset_class,
            asset_sub_class: domain.asset_sub_class,
            notes: domain.notes,
            profile,
            metadata,
            is_active: if domain.is_active { 1 } else { 0 },
            created_at: now,
            updated_at: now,
        }
    }
}
