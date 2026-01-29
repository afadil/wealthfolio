//! Database model for assets.
//! Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)
//! Clean schema: optional identifiers stored in metadata.identifiers JSON (e.g., ISIN)

use chrono::NaiveDateTime;
use diesel::prelude::*;
use log::error;
use serde::{Deserialize, Serialize};

use wealthfolio_core::assets::{Asset, AssetKind, NewAsset, PricingMode};

/// Helper to parse datetime string to NaiveDateTime.
///
/// Supports multiple formats:
/// - RFC3339: `2024-01-06T16:51:39Z` or `2024-01-06T16:51:39+00:00`
/// - SQLite CURRENT_TIMESTAMP: `2024-01-06 16:51:39`
/// - Date only: `2024-01-06`
fn text_to_datetime(s: &str) -> NaiveDateTime {
    // Try RFC3339 first (preferred format)
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return dt.naive_utc();
    }

    // Try SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS"
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt;
    }

    // Try ISO 8601 without timezone: "YYYY-MM-DDTHH:MM:SS"
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return dt;
    }

    // Try date only: "YYYY-MM-DD"
    if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return date
            .and_hms_opt(0, 0, 0)
            .unwrap_or_else(|| chrono::Utc::now().naive_utc());
    }

    error!("Failed to parse datetime '{}': unsupported format", s);
    chrono::Utc::now().naive_utc()
}

/// Database model for assets
/// Optional identifiers (ISIN) stored in metadata.identifiers JSON
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
    pub kind: String, // AssetKind enum (NOT NULL)
    pub name: Option<String>,
    pub symbol: String, // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: String, // MARKET, MANUAL, DERIVED, NONE (NOT NULL)
    pub preferred_provider: Option<String>,
    pub provider_overrides: Option<String>, // JSON for per-provider overrides

    // Metadata
    pub notes: Option<String>,
    pub metadata: Option<String>, // JSON: $.identifiers.isin (optional)

    // Status
    pub is_active: i32,
    pub created_at: String,
    pub updated_at: String,
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

        // Parse metadata JSON if present (includes identifiers like ISIN)
        let metadata = db
            .metadata
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        // Parse provider_overrides JSON if present
        let provider_overrides = db
            .provider_overrides
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Self {
            id: db.id,
            kind,
            name: db.name,
            symbol: db.symbol,
            exchange_mic: db.exchange_mic,
            exchange_name: None, // Computed by Asset::enrich()
            currency: db.currency,
            pricing_mode,
            preferred_provider: db.preferred_provider,
            provider_overrides,
            notes: db.notes,
            metadata,
            is_active: db.is_active != 0,
            created_at: text_to_datetime(&db.created_at),
            updated_at: text_to_datetime(&db.updated_at),
        }
    }
}

impl From<NewAsset> for AssetDB {
    fn from(domain: NewAsset) -> Self {
        let now = chrono::Utc::now().to_rfc3339();

        // Convert enums to database strings using as_db_str()
        let kind = domain.kind.as_db_str().to_string();
        let pricing_mode = domain.pricing_mode.as_db_str().to_string();

        // Serialize provider_overrides to JSON string
        let provider_overrides = domain
            .provider_overrides
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());

        // Serialize metadata to JSON string (includes identifiers like ISIN)
        let metadata = domain
            .metadata
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
            notes: domain.notes,
            metadata,
            is_active: if domain.is_active { 1 } else { 0 },
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
