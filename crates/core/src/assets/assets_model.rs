//! Asset domain models.

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::errors::Result;
use crate::errors::ValidationError;
use crate::market_data::DataSource;
use crate::Error;

use super::assets_constants::*;

/// Asset behavior classification
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Security, // Stocks, ETFs, bonds, funds
    Crypto,        // Cryptocurrencies
    Cash,          // Holdable cash position ($CASH-USD)
    FxRate,        // Currency exchange rate (not holdable)
    Option,        // Options contracts
    Commodity,     // Physical commodities
    PrivateEquity, // Private shares, startup equity
    Property,      // Real estate
    Vehicle,       // Vehicles
    Liability,     // Debts (negative value)
    Other,         // Anything else
}

/// Option contract specification stored in Asset.metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionSpec {
    pub underlying_asset_id: String,
    pub expiration: chrono::NaiveDate,
    pub right: String, // CALL or PUT
    pub strike: Decimal,
    pub multiplier: Decimal,
    pub occ_symbol: Option<String>,
}

/// Domain model representing an asset in the system
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
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
    pub kind: Option<AssetKind>, // Behavior classification (nullable for migration)
    pub quote_symbol: Option<String>, // Symbol for pricing lookup (replaces symbol_mapping)
    #[serde(default = "default_is_active")]
    pub is_active: bool,
    pub metadata: Option<Value>, // JSON for extensions
}

fn default_is_active() -> bool {
    true
}

impl Asset {
    /// Check if this asset is holdable (can have positions)
    pub fn is_holdable(&self) -> bool {
        match self.kind {
            Some(AssetKind::FxRate) => false,
            _ => true,
        }
    }

    /// Check if this asset needs pricing
    pub fn needs_pricing(&self) -> bool {
        match self.kind {
            Some(AssetKind::Cash) => false, // Always 1:1 in its currency
            _ => true,
        }
    }

    /// Get option metadata if this is an option
    pub fn option_spec(&self) -> Option<OptionSpec> {
        if self.kind != Some(AssetKind::Option) {
            return None;
        }
        self.metadata
            .as_ref()
            .and_then(|m| m.get("option"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Get the effective kind, defaulting to Security if not set
    pub fn effective_kind(&self) -> AssetKind {
        self.kind.clone().unwrap_or(AssetKind::Security)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AssetSummary {
    pub id: String,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub currency: String,
    pub countries: Option<Vec<Country>>,
    pub sectors: Option<Vec<Sector>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sector {
    pub name: String,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub name: String,
    pub weight: f64,
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
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub notes: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,
    pub kind: Option<AssetKind>,      // Behavior classification
    pub quote_symbol: Option<String>, // Symbol for pricing lookup
    #[serde(default = "default_is_active")]
    pub is_active: bool,
    pub metadata: Option<Value>,      // JSON for extensions
}

impl NewAsset {
    /// Validates the new asset data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset symbol cannot be empty".to_string(),
            )));
        }
        if self.currency.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency cannot be empty".to_string(),
            )));
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
            kind: Some(AssetKind::Cash),
            is_active: true,
            ..Default::default()
        }
    }

    /// Creates a new FX asset
    pub fn new_fx_asset(base_currency: &str, target_currency: &str, source: &str) -> Self {
        let asset_id = format!("{}{}=X", base_currency, target_currency);
        let readable_name = format!("{}/{} Exchange Rate", base_currency, target_currency);
        let notes = format!(
            "Currency pair for converting from {} to {}",
            base_currency, target_currency
        );

        Self {
            id: Some(asset_id.clone()),
            name: Some(readable_name),
            symbol: asset_id,
            currency: base_currency.to_string(),
            asset_type: Some(FOREX_ASSET_TYPE.to_string()),
            asset_class: Some(CASH_ASSET_CLASS.to_string()),
            asset_sub_class: Some(CASH_ASSET_CLASS.to_string()),
            notes: Some(notes),
            data_source: source.to_string(),
            kind: Some(AssetKind::FxRate),
            is_active: true,
            ..Default::default()
        }
    }
}

impl From<crate::market_data::providers::models::AssetProfile> for NewAsset {
    fn from(profile: crate::market_data::providers::models::AssetProfile) -> Self {
        Self {
            id: profile.id,
            isin: profile.isin,
            name: profile.name,
            asset_type: profile.asset_type,
            symbol: profile.symbol.clone(),
            asset_class: profile.asset_class,
            asset_sub_class: profile.asset_sub_class,
            notes: profile.notes,
            countries: profile.countries,
            categories: profile.categories,
            classes: profile.classes,
            attributes: profile.attributes,
            currency: profile.currency,
            data_source: profile.data_source,
            sectors: profile.sectors,
            url: profile.url,
            kind: None,
            // quote_symbol from provider profile, or default to symbol
            quote_symbol: profile.quote_symbol.or(Some(profile.symbol)),
            is_active: true,
            metadata: None,
        }
    }
}

/// Input model for updating an asset profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub symbol: String,
    pub quote_symbol: Option<String>, // Symbol for pricing lookup
    pub name: Option<String>,
    pub sectors: Option<String>,
    pub countries: Option<String>,
    pub notes: String,
    pub asset_sub_class: Option<String>,
    pub asset_class: Option<String>,
}

impl UpdateAssetProfile {
    /// Validates the asset profile update data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset symbol cannot be empty".to_string(),
            )));
        }
        Ok(())
    }
}

/// Domain model representing a quote summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
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
